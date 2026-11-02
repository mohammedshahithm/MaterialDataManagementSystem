import prisma from 'd:/Desktop/MaterialDataManagementSystem/backend/src/config/database';

async function auditDatabase() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, role: true, createdAt: true },
  });

  const batches = await prisma.batch.findMany({
    select: { id: true, batchName: true, status: true, createdAt: true },
  });

  const products = await prisma.product.findMany({
    select: { id: true, productCode: true, productName: true, dateFolderId: true },
  });

  const files = await prisma.productFile.findMany({
    select: { id: true, category: true, originalFilename: true, storageKey: true, uploadStatus: true, deletedAt: true },
  });

  const backupRecords = await prisma.backupRecord.findMany({
    select: { id: true, batchId: true, diskIdentifier: true, destinationPath: true, confirmedAt: true },
  });

  console.log('=== USERS ===');
  console.log(users);
  console.log('=== BATCHES ===');
  console.log(batches);
  console.log('=== PRODUCTS COUNT ===', products.length);
  console.log('=== FILES COUNT ===', files.length);
  console.log('=== BACKUP RECORDS COUNT ===', backupRecords.length);

  await prisma.$disconnect();
}

auditDatabase().catch(console.error);

