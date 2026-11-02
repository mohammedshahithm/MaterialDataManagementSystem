import { chromium } from '../frontend/node_modules/playwright';
import http from 'http';
import net from 'net';
import fs from 'fs';

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

async function measureHttp(url: string, headers: Record<string, string> = {}): Promise<{ status: number; duration: number; size: number }> {
  const start = performance.now();
  const res = await fetch(url, { headers });
  const text = await res.text();
  const duration = performance.now() - start;
  return { status: res.status, duration, size: text.length };
}

async function runBenchmark() {
  console.log('====================================================');
  console.log('MDMS PERFORMANCE AUDIT — BASELINE MEASUREMENTS');
  console.log('====================================================\n');

  const results: any = {
    timestamp: new Date().toISOString(),
    network: {},
    api: {},
    browser: {},
  };

  // 1. Supabase Network Latency (Singapore)
  console.log('--- 1. Supabase Network Latency (Singapore) ---');
  const dbHost = 'aws-0-ap-southeast-1.pooler.supabase.com';
  const apiHost = 'wjdkbgxhgivwjobxkxuu.supabase.co';

  const tcpDbSamples: number[] = [];
  for (let i = 0; i < 4; i++) {
    try {
      tcpDbSamples.push(await measureTcpLatency(dbHost, 5432));
    } catch {}
  }
  const avgDbTcp = tcpDbSamples.slice(1).reduce((a, b) => a + b, 0) / (tcpDbSamples.length - 1);
  console.log(`TCP Latency to Supabase DB (${dbHost}:5432): ${avgDbTcp.toFixed(2)} ms`);
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

  // 2. API Endpoint Response Times (via backend on localhost:3001)
  console.log('\n--- 2. Backend API Response Times ---');

  // Baseline health check (pure Node.js + Express overhead)
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
  for (let i = 0; i < 3; i++) {
    const res = await measureHttp(`${BACKEND_URL}/api/dashboard`);
    dashRuns.push(res.duration);
  }
  const avgDash = dashRuns.reduce((a, b) => a + b, 0) / dashRuns.length;
  console.log(`GET /api/dashboard: ${avgDash.toFixed(2)} ms`);
  results.api.dashboardMs = avgDash;

  // Batches endpoint
  const batchesRuns: number[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await measureHttp(`${BACKEND_URL}/api/batches`);
    batchesRuns.push(res.duration);
  }
  const avgBatches = batchesRuns.reduce((a, b) => a + b, 0) / batchesRuns.length;
  console.log(`GET /api/batches: ${avgBatches.toFixed(2)} ms`);
  results.api.batchesMs = avgBatches;

  // Storage summary endpoint
  const storageRuns: number[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await measureHttp(`${BACKEND_URL}/api/storage/summary`);
    storageRuns.push(res.duration);
  }
  const avgStorage = storageRuns.reduce((a, b) => a + b, 0) / storageRuns.length;
  console.log(`GET /api/storage/summary: ${avgStorage.toFixed(2)} ms`);
  results.api.storageSummaryMs = avgStorage;

  // Retention settings endpoint
  const settingsRes = await measureHttp(`${BACKEND_URL}/api/admin/retention-settings`);
  console.log(`GET /api/admin/retention-settings: ${settingsRes.duration.toFixed(2)} ms`);
  results.api.retentionSettingsMs = settingsRes.duration;

  // Audit logs endpoint
  const auditRes = await measureHttp(`${BACKEND_URL}/api/audit-logs?page=1&limit=50`);
  console.log(`GET /api/audit-logs: ${auditRes.duration.toFixed(2)} ms`);
  results.api.auditLogsMs = auditRes.duration;

  // 3. Browser End-to-End Navigation & Rendering Times
  console.log('\n--- 3. Browser Page Loads & Route Transitions ---');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Track network requests
  let activeRequests = 0;
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
  results.browser.initialDashboardApiCount = totalApiRequests;

  // Navigation: Dashboard -> Batches
  totalApiRequests = 0;
  const t1 = performance.now();
  await page.click('a[href="/batches"]');
  await page.waitForLoadState('networkidle');
  const navBatchesTime = performance.now() - t1;
  console.log(`Navigation '/' -> '/batches': ${navBatchesTime.toFixed(2)} ms (${totalApiRequests} API calls)`);
  results.browser.navBatchesMs = navBatchesTime;
  results.browser.navBatchesApiCount = totalApiRequests;

  // Navigation: Batches -> Storage
  totalApiRequests = 0;
  const t2 = performance.now();
  await page.click('a[href="/storage"]');
  await page.waitForLoadState('networkidle');
  const navStorageTime = performance.now() - t2;
  console.log(`Navigation '/batches' -> '/storage': ${navStorageTime.toFixed(2)} ms (${totalApiRequests} API calls)`);
  results.browser.navStorageMs = navStorageTime;
  results.browser.navStorageApiCount = totalApiRequests;

  // Re-visit: Storage -> Dashboard (testing cache miss / repeated fetch)
  totalApiRequests = 0;
  const t3 = performance.now();
  await page.click('a[href="/"]');
  await page.waitForLoadState('networkidle');
  const revisitDashTime = performance.now() - t3;
  console.log(`Re-visit '/storage' -> '/': ${revisitDashTime.toFixed(2)} ms (${totalApiRequests} repeated API calls)`);
  results.browser.revisitDashboardMs = revisitDashTime;
  results.browser.revisitDashboardApiCount = totalApiRequests;

  // Re-visit: Dashboard -> Batches (testing cache miss / repeated fetch)
  totalApiRequests = 0;
  const t4 = performance.now();
  await page.click('a[href="/batches"]');
  await page.waitForLoadState('networkidle');
  const revisitBatchesTime = performance.now() - t4;
  console.log(`Re-visit '/' -> '/batches': ${revisitBatchesTime.toFixed(2)} ms (${totalApiRequests} repeated API calls)`);
  results.browser.revisitBatchesMs = revisitBatchesTime;
  results.browser.revisitBatchesApiCount = totalApiRequests;

  await browser.close();

  fs.writeFileSync('scratch/baseline_results.json', JSON.stringify(results, null, 2));
  console.log('\nBaseline metrics saved to scratch/baseline_results.json');
  console.log('====================================================\n');
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
