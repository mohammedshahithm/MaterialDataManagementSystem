import prisma from '../backend/src/config/database';

async function checkFiles() {
  const allFiles = await prisma.productFile.findMany({ take: 5 });
  console.log('Total files found in DB:', allFiles.length);
  for (const f of allFiles) {
    console.log(f.id, f.originalFilename, 'deletedAt:', f.deletedAt, 'status:', f.uploadStatus);
  }
  await prisma.$disconnect();
}
checkFiles();

