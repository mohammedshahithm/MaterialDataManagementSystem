import prisma from '../backend/src/config/database';

async function measureProductAndFiles() {
  const product = await prisma.product.findFirst({
    where: { files: { some: { deletedAt: null } } },
    include: { files: { where: { deletedAt: null } } },
  });

  if (!product) {
    console.log('No product with files found to measure');
    await prisma.$disconnect();
    return;
  }

  console.log(`Testing Product ${product.id} (${product.productCode}) with ${product.files.length} files...`);

  // Measure GET /api/products/:id
  const t0 = performance.now();
  const res = await fetch(`http://localhost:3001/api/products/${product.id}`);
  const t1 = performance.now();
  console.log(`GET /api/products/:productId: ${(t1 - t0).toFixed(2)} ms (status: ${res.status})`);

  // Measure GET /api/files/:fileId/download-url (first call vs repeat call)
  const file = product.files[0];
  if (file) {
    const tF0 = performance.now();
    const fRes1 = await fetch(`http://localhost:3001/api/files/${file.id}/download-url?inline=true`);
    const tF1 = performance.now();
    console.log(`GET /api/files/:fileId/download-url (preview call 1): ${(tF1 - tF0).toFixed(2)} ms`);

    const tF2 = performance.now();
    const fRes2 = await fetch(`http://localhost:3001/api/files/${file.id}/download-url?inline=true`);
    const tF3 = performance.now();
    console.log(`GET /api/files/:fileId/download-url (preview call 2 - repeat): ${(tF3 - tF2).toFixed(2)} ms`);
  }

  await prisma.$disconnect();
}

measureProductAndFiles().catch(console.error);

