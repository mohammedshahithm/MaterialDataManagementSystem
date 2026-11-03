const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    include: {
      dateFolder: { include: { batch: true } },
      files: { where: { deletedAt: null } },
    },
  });
  console.log('Total products in DB:', products.length);
  for (const p of products) {
    console.log(`\nProduct: ${p.id} | Code: "${p.productCode}" | Name: "${p.productName}"`);
    console.log(`  Batch: ${p.dateFolder?.batch?.batchName} | WorkDate: ${p.dateFolder?.workDate}`);
    console.log(`  Status: ${p.status}`);
    console.log(`  Files (${p.files.length}):`);
    for (const f of p.files) {
      console.log(`    - [${f.category}] slot=${f.slotIndex} isLatest=${f.isLatest} "${f.originalFilename}" (${f.fileSize} bytes) key=${f.storageKey}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

