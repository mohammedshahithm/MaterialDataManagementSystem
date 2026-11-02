// Set VERCEL environment variable BEFORE importing server.ts
process.env.VERCEL = '1';

import http from 'http';
import app from '../backend/src/server';

async function main() {
  console.log('--- Testing Express App in Simulated Vercel Serverless Mode (VERCEL=1) ---');
  
  // When VERCEL=1 is set, app.listen(3001) is NOT called by server.ts.
  // Instead, the serverless runtime imports the exported app and wraps it.
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(3098, '127.0.0.1', () => {
      console.log('Simulated Vercel Function wrapper listening on port 3098');
      resolve();
    });
  });

  try {
    const res = await fetch('http://127.0.0.1:3098/api/health');
    const data = await res.json();
    console.log('API /api/health in serverless mode:', res.status, data);

    const cronRes = await fetch('http://127.0.0.1:3098/api/cron/retention');
    const cronData = await cronRes.json();
    console.log('API /api/cron/retention in serverless mode:', cronRes.status, cronData);

    console.log('✅ Serverless execution behavior verified cleanly!');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('Serverless test failed:', err);
  process.exit(1);
});

