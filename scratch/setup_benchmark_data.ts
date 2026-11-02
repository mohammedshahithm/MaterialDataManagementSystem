import prisma from '../backend/src/config/database';
import { storageService } from '../backend/src/services/storageService';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

async function setupBenchmarkData() {
  console.log('Setting up realistic benchmark data...');

  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'terminal@company.internal',
        fullName: 'Shared Factory Terminal',
        role: 'worker',
      },
    });
  }

  // Create active batch
  const batch = await prisma.batch.create({
    data: {
      batchName: 'Benchmark Batch - Line A',
      description: 'Active production batch for real-world benchmarking',
      createdById: user.id,
      status: 'active',
    },
  });

  // Create date folder
  const dateFolder = await prisma.dateFolder.create({
    data: {
      batchId: batch.id,
      workDate: new Date('2026-11-02'),
      createdById: user.id,
    },
  });

  // Create product
  const product = await prisma.product.create({
    data: {
      dateFolderId: dateFolder.id,
      productCode: 'PRD-BENCH-001',
      productName: 'Titanium Grade 5 Specimen',
      createdById: user.id,
      metadata: { material: 'Ti-6Al-4V', testType: 'Tensile & Microstructure' },
      status: 'uploads_complete',
    },
  });

  // Upload 4 sample files
  const samplePng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  const samplePdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF'
  );

  const fileDefinitions = [
    { category: 'microstructure', slot: 0, filename: 'microstructure_100x.png', mime: 'image/png', buf: samplePng },
    { category: 'microstructure', slot: 1, filename: 'microstructure_500x.png', mime: 'image/png', buf: samplePng },
    { category: 'graph', slot: 0, filename: 'tensile_stress_strain.png', mime: 'image/png', buf: samplePng },
    { category: 'source_pdf', slot: 0, filename: 'mill_test_certificate.pdf', mime: 'application/pdf', buf: samplePdf },
    { category: 'whatsapp_image', slot: 0, filename: 'whatsapp_specimen.png', mime: 'image/png', buf: samplePng },
  ];

  for (const def of fileDefinitions) {
    const key = `${batch.id}/${dateFolder.id}/${product.id}/${def.category}/${uuidv4()}.png`;
    await storageService.uploadFile(key, def.buf, def.mime);

    await prisma.productFile.create({
      data: {
        productId: product.id,
        category: def.category as any,
        slotIndex: def.slot,
        originalFilename: def.filename,
        storageKey: key,
        mimeType: def.mime,
        fileSize: BigInt(def.buf.length),
        checksumSha256: createHash('sha256').update(def.buf).digest('hex'),
        uploadedById: user.id,
        uploadStatus: 'confirmed',
        isLatest: true,
      },
    });
  }

  console.log(`Setup complete! Batch ID: ${batch.id}, Date ID: ${dateFolder.id}, Product ID: ${product.id}`);
  await prisma.$disconnect();
}

setupBenchmarkData().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});

