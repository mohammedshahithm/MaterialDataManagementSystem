import prisma from '../backend/src/config/database';

async function applyIndexes() {
  console.log('Applying safe, non-destructive PostgreSQL indexes...');

  const queries = [
    `CREATE INDEX IF NOT EXISTS idx_batches_status_created_at ON batches (status, created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_download_logs_product_id ON download_logs (product_id);`,
    `CREATE INDEX IF NOT EXISTS idx_download_logs_batch_id ON download_logs (batch_id);`,
    `CREATE INDEX IF NOT EXISTS idx_download_logs_downloaded_at ON download_logs (downloaded_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_backup_records_batch_id ON backup_records (batch_id, confirmed_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_product_files_active ON product_files (deleted_at, upload_status);`,
    `CREATE INDEX IF NOT EXISTS idx_product_files_pending_cleanup ON product_files (upload_status, uploaded_at) WHERE upload_status = 'pending';`,
  ];

  for (const q of queries) {
    const t0 = performance.now();
    await prisma.$executeRawUnsafe(q);
    const t1 = performance.now();
    console.log(`Executed: ${q.split('ON')[1]?.trim() || q} in ${(t1 - t0).toFixed(2)} ms`);
  }

  console.log('All performance indexes successfully applied!');
  await prisma.$disconnect();
}

applyIndexes().catch((err) => {
  console.error('Failed to apply indexes:', err);
  process.exit(1);
});

