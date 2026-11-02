const { PrismaClient } = require('@prisma/client');

async function test() {
  const p = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://postgres.wjdkbgxhgivwjobxkxuu:sha2hi00th7@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5'
      }
    }
  });

  try {
    const t0 = performance.now();
    const count = await p.batch.count();
    const t1 = performance.now();
    console.log(`Port 6543 SUCCESS! Batch count: ${count}, latency: ${(t1 - t0).toFixed(2)} ms`);
  } catch (err) {
    console.error('Error on port 6543:', err.message);
  } finally {
    await p.$disconnect();
  }
}

test();
