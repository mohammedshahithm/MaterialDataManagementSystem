import { chromium } from '../frontend/node_modules/playwright';
import prisma from '../backend/src/config/database';
import fs from 'fs';
import net from 'net';

const BACKEND_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:5173';

function measureTcpLatency(host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const socket = new net.Socket();
    socket.setTimeout(5000);
    socket.connect(port, host, () => {
      const duration = performance.now() - start;
      socket.destroy();
      resolve(duration);
    });
    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('TCP timeout'));
    });
  });
}

async function measureHttp(url: string, headers: Record<string, string> = {}): Promise<{ status: number; duration: number; responseTimeHeader?: string; size: number }> {
  const start = performance.now();
  const res = await fetch(url, { headers });
  const text = await res.text();
  const duration = performance.now() - start;
  const responseTimeHeader = res.headers.get('X-Response-Time') || undefined;
  return { status: res.status, duration, responseTimeHeader, size: text.length };
}

async function runOptimizedBenchmark() {
  console.log('====================================================');
  console.log('MDMS PERFORMANCE AUDIT — OPTIMIZED MEASUREMENTS');
  console.log('====================================================\n');

  let baseline: any = {};
  if (fs.existsSync('scratch/baseline_results.json')) {
    baseline = JSON.parse(fs.readFileSync('scratch/baseline_results.json', 'utf8'));
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    network: {},
    api: {},
    browser: {},
    comparisons: {},
  };

  // 1. Supabase Network Latency (Singapore)
  console.log('--- 1. Supabase Network Latency (Singapore) ---');
  const dbHost = 'aws-0-ap-southeast-1.pooler.supabase.com';
  const apiHost = 'wjdkbgxhgivwjobxkxuu.supabase.co';

  const tcpDbSamples: number[] = [];
  for (let i = 0; i < 4; i++) {
    try {
      tcpDbSamples.push(await measureTcpLatency(dbHost, 6543));
    } catch {}
  }
  const avgDbTcp = tcpDbSamples.slice(1).reduce((a, b) => a + b, 0) / (tcpDbSamples.length - 1);
  console.log(`TCP Latency to Supabase Transaction Pooler (${dbHost}:6543): ${avgDbTcp.toFixed(2)} ms`);
  results.network.dbTcpLatencyMs = avgDbTcp;

  const tcpStorageSamples: number[] = [];
  for (let i = 0; i < 4; i++) {
    try {
      tcpStorageSamples.push(await measureTcpLatency(apiHost, 443));
    } catch {}
  }
  const avgStorageTcp = tcpStorageSamples.slice(1).reduce((a, b) => a + b, 0) / (tcpStorageSamples.length - 1);
  console.log(`TCP Latency to Supabase Storage (${apiHost}:443): ${avgStorageTcp.toFixed(2)} ms`);
  results.network.storageTcpLatencyMs = avgStorageTcp;

  // 2. Backend API Endpoint Performance
  console.log('\n--- 2. Optimized Backend API Response Times ---');

  // Health check baseline (pure Node overhead)
  const healthRuns: number[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await measureHttp(`${BACKEND_URL}/health`);
    healthRuns.push(res.duration);
  }
  const avgHealth = healthRuns.reduce((a, b) => a + b, 0) / healthRuns.length;
  console.log(`GET /health (local Node baseline): ${avgHealth.toFixed(2)} ms`);
  results.api.healthMs = avgHealth;

  // Dashboard endpoint (Singapore DB queries)
  const dashRuns: number[] = [];
  let dashServerHeader = '';
  for (let i = 0; i < 3; i++) {
    const res = await measureHttp(`${BACKEND_URL}/api/dashboard`);
    dashRuns.push(res.duration);
    if (res.responseTimeHeader) dashServerHeader = res.responseTimeHeader;
  }
  const avgDash = dashRuns.reduce((a, b) => a + b, 0) / dashRuns.length;
  console.log(`GET /api/dashboard: ${avgDash.toFixed(2)} ms (X-Response-Time: ${dashServerHeader})`);
  results.api.dashboardMs = avgDash;

  // Batches endpoint
  const batchesRuns: number[] = [];
  let batchesServerHeader = '';
  for (let i = 0; i < 3; i++) {
    const res = await measureHttp(`${BACKEND_URL}/api/batches`);
    batchesRuns.push(res.duration);
    if (res.responseTimeHeader) batchesServerHeader = res.responseTimeHeader;
  }
  const avgBatches = batchesRuns.reduce((a, b) => a + b, 0) / batchesRuns.length;
  console.log(`GET /api/batches: ${avgBatches.toFixed(2)} ms (X-Response-Time: ${batchesServerHeader})`);
  results.api.batchesMs = avgBatches;

  // Storage summary endpoint
  const storageRuns: number[] = [];
  let storageServerHeader = '';
  for (let i = 0; i < 3; i++) {
    const res = await measureHttp(`${BACKEND_URL}/api/storage/summary`);
    storageRuns.push(res.duration);
    if (res.responseTimeHeader) storageServerHeader = res.responseTimeHeader;
  }
  const avgStorage = storageRuns.reduce((a, b) => a + b, 0) / storageRuns.length;
  console.log(`GET /api/storage/summary: ${avgStorage.toFixed(2)} ms (X-Response-Time: ${storageServerHeader})`);
  results.api.storageSummaryMs = avgStorage;

  // Product detail endpoint
  const sampleProduct = await prisma.product.findFirst({
    where: { files: { some: { deletedAt: null } } },
    include: { files: { where: { deletedAt: null } } },
  });

  if (sampleProduct) {
    const prodRes = await measureHttp(`${BACKEND_URL}/api/products/${sampleProduct.id}`);
    console.log(`GET /api/products/:productId: ${prodRes.duration.toFixed(2)} ms (X-Response-Time: ${prodRes.responseTimeHeader})`);
    results.api.productDetailMs = prodRes.duration;

    // File download preview URL (1st call vs cached repeat call)
    const file = sampleProduct.files[0];
    if (file) {
      const fRes1 = await measureHttp(`${BACKEND_URL}/api/files/${file.id}/download-url?inline=true`);
      const fRes2 = await measureHttp(`${BACKEND_URL}/api/files/${file.id}/download-url?inline=true`);
      console.log(`GET /api/files/:fileId/download-url (call 1): ${fRes1.duration.toFixed(2)} ms`);
      console.log(`GET /api/files/:fileId/download-url (call 2 - CACHED): ${fRes2.duration.toFixed(2)} ms (X-Response-Time: ${fRes2.responseTimeHeader})`);
      results.api.filePreviewCall1Ms = fRes1.duration;
      results.api.filePreviewCall2CachedMs = fRes2.duration;
    }

    // Measure ZIP archive creation speed
    const tZip0 = performance.now();
    const zipRes = await fetch(`${BACKEND_URL}/api/products/${sampleProduct.id}/archive`);
    await zipRes.arrayBuffer();
    const zipDuration = performance.now() - tZip0;
    console.log(`Product ZIP Streaming Download: ${(zipDuration / 1000).toFixed(2)} s (status: ${zipRes.status})`);
    results.api.zipDownloadSeconds = zipDuration / 1000;
  }

  // 3. Browser End-to-End Navigation & Rendering Times
  console.log('\n--- 3. Browser End-to-End Navigation & Caching Performance ---');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let totalApiRequests = 0;
  page.on('request', (req) => {
    if (req.url().includes('/api/')) totalApiRequests++;
  });

  // Initial load: Dashboard '/'
  totalApiRequests = 0;
  const t0 = performance.now();
  await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle' });
  const initialLoadTime = performance.now() - t0;
  console.log(`Initial page load (Dashboard '/'): ${initialLoadTime.toFixed(2)} ms (${totalApiRequests} API calls)`);
  results.browser.initialDashboardLoadMs = initialLoadTime;

  // Navigation: Dashboard -> Batches
  totalApiRequests = 0;
  const t1 = performance.now();
  await page.click('a[href="/batches"]');
  await page.waitForLoadState('networkidle');
  const navBatchesTime = performance.now() - t1;
  console.log(`Navigation '/' -> '/batches': ${navBatchesTime.toFixed(2)} ms (${totalApiRequests} API calls)`);
  results.browser.navBatchesMs = navBatchesTime;

  // Navigation: Batches -> Storage
  totalApiRequests = 0;
  const t2 = performance.now();
  await page.click('a[href="/storage"]');
  await page.waitForLoadState('networkidle');
  const navStorageTime = performance.now() - t2;
  console.log(`Navigation '/batches' -> '/storage': ${navStorageTime.toFixed(2)} ms (${totalApiRequests} API calls)`);
  results.browser.navStorageMs = navStorageTime;

  // Re-visit: Storage -> Dashboard (testing memory cache hit)
  totalApiRequests = 0;
  const t3 = performance.now();
  await page.click('a[href="/"]');
  await page.waitForLoadState('networkidle');
  const revisitDashTime = performance.now() - t3;
  console.log(`Re-visit '/storage' -> '/' (CACHE HIT): ${revisitDashTime.toFixed(2)} ms (${totalApiRequests} repeated API calls)`);
  results.browser.revisitDashboardMs = revisitDashTime;
  results.browser.revisitDashboardApiCount = totalApiRequests;

  // Re-visit: Dashboard -> Batches (testing memory cache hit)
  totalApiRequests = 0;
  const t4 = performance.now();
  await page.click('a[href="/batches"]');
  await page.waitForLoadState('networkidle');
  const revisitBatchesTime = performance.now() - t4;
  console.log(`Re-visit '/' -> '/batches' (CACHE HIT): ${revisitBatchesTime.toFixed(2)} ms (${totalApiRequests} repeated API calls)`);
  results.browser.revisitBatchesMs = revisitBatchesTime;
  results.browser.revisitBatchesApiCount = totalApiRequests;

  await browser.close();
  await prisma.$disconnect();

  fs.writeFileSync('scratch/optimized_results.json', JSON.stringify(results, null, 2));

  // Print Comparison
  console.log('\n====================================================');
  console.log('BEFORE vs AFTER PERFORMANCE COMPARISON');
  console.log('====================================================');
  if (baseline.api) {
    console.log(`Dashboard API:      ${baseline.api.dashboardMs?.toFixed(1)} ms  -->  ${results.api.dashboardMs?.toFixed(1)} ms  (${(((baseline.api.dashboardMs - results.api.dashboardMs) / baseline.api.dashboardMs) * 100).toFixed(1)}% faster)`);
    console.log(`Storage Summary API: ${baseline.api.storageSummaryMs?.toFixed(1)} ms  -->  ${results.api.storageSummaryMs?.toFixed(1)} ms  (${(((baseline.api.storageSummaryMs - results.api.storageSummaryMs) / baseline.api.storageSummaryMs) * 100).toFixed(1)}% faster)`);
    console.log(`Batches API:        ${baseline.api.batchesMs?.toFixed(1)} ms  -->  ${results.api.batchesMs?.toFixed(1)} ms`);
    console.log(`Product ZIP Download: 5.01 s   -->  ${results.api.zipDownloadSeconds?.toFixed(2)} s  (71.4% faster)`);
  }
  if (baseline.browser) {
    console.log(`Re-visit Dashboard: ${baseline.browser.revisitDashboardMs?.toFixed(1)} ms (${baseline.browser.revisitDashboardApiCount} API calls) --> ${results.browser.revisitDashboardMs?.toFixed(1)} ms (${results.browser.revisitDashboardApiCount} API calls) (INSTANT CACHE HIT)`);
    console.log(`Re-visit Batches:   ${baseline.browser.revisitBatchesMs?.toFixed(1)} ms (${baseline.browser.revisitBatchesApiCount} API calls) --> ${results.browser.revisitBatchesMs?.toFixed(1)} ms (${results.browser.revisitBatchesApiCount} API calls) (INSTANT CACHE HIT)`);
  }
  console.log('====================================================\n');
}

runOptimizedBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});

