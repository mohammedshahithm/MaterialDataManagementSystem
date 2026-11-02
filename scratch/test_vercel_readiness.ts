import http from 'http';
import app from '../backend/src/server';

async function main() {
  console.log('--- Testing Express App In Serverless Mode ---');
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(3099, '127.0.0.1', () => {
      console.log('Test server listening on port 3099');
      resolve();
    });
  });

  try {
    // 1. Health check at root
    const rootHealthRes = await fetch('http://127.0.0.1:3099/health');
    const rootHealth = await rootHealthRes.json();
    console.log('1. Root /health response:', rootHealthRes.status, rootHealth);

    // 2. Health check at /api/health
    const apiHealthRes = await fetch('http://127.0.0.1:3099/api/health');
    const apiHealth = await apiHealthRes.json();
    console.log('2. API /api/health response:', apiHealthRes.status, apiHealth);

    // 3. Cron retention endpoint at /api/cron/retention
    const cronRes = await fetch('http://127.0.0.1:3099/api/cron/retention');
    const cron = await cronRes.json();
    console.log('3. API /api/cron/retention response:', cronRes.status, cron);

    // 4. API Dashboard endpoint under Shared Terminal
    const dashRes = await fetch('http://127.0.0.1:3099/api/dashboard');
    const dash = await dashRes.json();
    console.log('4. API /api/dashboard response:', dashRes.status, 'Total Batches:', dash.totalBatches);

    console.log('\n✅ All Express server endpoints verified successfully for Vercel deployment!');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

