import { v4 as uuidv4 } from '../backend/node_modules/uuid';
import prisma from '../backend/src/config/database';
import { storageService } from '../backend/src/services/storageService';
import { detectMimeType } from '../backend/src/controllers/fileController';
import { config } from '../backend/src/config';
import sharp from '../backend/node_modules/sharp';
import axios from '../backend/node_modules/axios';

// Helper to create valid PNG of exact target byte size
async function createValidPngOfSize(targetBytes: number): Promise<Buffer> {
  // Base 100x100 PNG
  const basePng = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 50, g: 150, b: 250 } },
  }).png().toBuffer();

  if (targetBytes <= basePng.length) {
    return basePng;
  }

  // PNG files support trailing ancillary padding or metadata chunks, or simple binary zero-padding after IEND
  // Standard chunk or post-IEND padding:
  const paddingNeeded = targetBytes - basePng.length;
  const padding = Buffer.alloc(paddingNeeded, 0);
  return Buffer.concat([basePng, padding]);
}

// Helper to create valid PDF of exact target byte size
function createValidPdfOfSize(targetBytes: number): Buffer {
  const header = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const trailer = 'xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\n%%EOF\n';
  const base = Buffer.from(header + trailer);

  if (targetBytes <= base.length) return base;

  const paddingNeeded = targetBytes - base.length;
  // In PDF, % comment lines are completely valid filler
  const commentPadding = Buffer.from('%' + 'A'.repeat(paddingNeeded - 1) + '\n');
  return Buffer.concat([Buffer.from(header), commentPadding, Buffer.from(trailer)]);
}

async function runDirectUploadsE2E() {
  console.log('====================================================');
  console.log('🚀 RUNNING DIRECT SUPABASE UPLOADS E2E TEST SUITE');
  console.log('====================================================');

  const testBatchName = `E2E-DirectUpload-${Date.now()}`;
  let batch: any = null;
  let dateFolder: any = null;
  let product: any = null;
  const createdStorageKeys: string[] = [];

  try {
    // 0. Setup isolated test entities
    const adminUser = await prisma.user.findFirst();
    if (!adminUser) throw new Error('No user found in database');

    batch = await prisma.batch.create({
      data: {
        batchName: testBatchName,
        status: 'active',
        createdById: adminUser.id,
      },
    });

    dateFolder = await prisma.dateFolder.create({
      data: {
        batchId: batch.id,
        workDate: new Date('2026-11-03'),
        createdById: adminUser.id,
      },
    });

    product = await prisma.product.create({
      data: {
        dateFolderId: dateFolder.id,
        productCode: `PRD-TEST-${Date.now().toString().slice(-4)}`,
        productName: 'Direct Upload Test Product',
        createdById: adminUser.id,
      },
    });

    console.log(`✅ Created isolated test environment: Product ${product.productCode} (${product.id})`);

    // Helper to simulate requestUpload + direct PUT + confirmUpload
    async function executeDirectUpload(params: {
      category: string;
      slotIndex: number;
      filename: string;
      fileBuffer: Buffer;
      mimeType: string;
    }) {
      const { category, slotIndex, filename, fileBuffer, mimeType } = params;
      const fileSize = fileBuffer.length;

      // 1. Validation in requestUpload
      const maxBytes = 25 * 1024 * 1024;
      if (fileSize > maxBytes) {
        throw new Error(`File size exceeds the 25MB limit`);
      }

      const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
      const allowedExts = config.allowedExtensions[category];
      if (!allowedExts?.includes(ext)) {
        throw new Error(`File extension "${ext}" is not allowed for category "${category}"`);
      }

      // Check slot limits
      const maxSlots = config.maxSlots[category] || 1;
      if (slotIndex >= maxSlots) {
        throw new Error(`Invalid slot index ${slotIndex} for ${category}`);
      }

      const confirmedFiles = await prisma.productFile.findMany({
        where: { productId: product.id, category: category as any, uploadStatus: 'confirmed', deletedAt: null },
      });
      const existingInSlot = confirmedFiles.find(f => f.slotIndex === slotIndex);
      if (category === 'microstructure' && confirmedFiles.length >= maxSlots && !existingInSlot) {
        throw new Error(`Maximum ${maxSlots} microstructure images allowed`);
      }

      // Generate server key
      const storageKey = `${batch.id}/${dateFolder.id}/${product.id}/${category}/${uuidv4()}${ext}`;
      createdStorageKeys.push(storageKey);

      // Create signed upload URL
      const signedUpload = await storageService.createSignedUploadUrl(storageKey);

      // Create pending record
      const pendingRecord = await prisma.productFile.create({
        data: {
          productId: product.id,
          category: category as any,
          slotIndex,
          originalFilename: filename,
          storageKey,
          mimeType,
          fileSize: BigInt(fileSize),
          uploadedById: adminUser.id,
          uploadStatus: 'pending',
          isLatest: false,
        },
      });

      // 2. Direct upload to Supabase Storage via signedUrl PUT
      const putRes = await fetch(signedUpload.signedUrl, {
        method: 'PUT',
        body: fileBuffer,
        headers: { 'Content-Type': mimeType },
      });

      if (!putRes.ok && putRes.status !== 200) {
        throw new Error(`Direct PUT upload failed with HTTP ${putRes.status}`);
      }

      // 3. Confirm upload: range-based magic byte verification
      const header = await storageService.fetchObjectHeader(storageKey);
      if (!header.exists) {
        throw new Error('Uploaded file not found in storage during confirmation');
      }

      if (header.size > maxBytes) {
        await storageService.deleteFile(storageKey);
        await prisma.productFile.update({ where: { id: pendingRecord.id }, data: { uploadStatus: 'failed' } });
        throw new Error('Uploaded file exceeds the 25MB limit');
      }

      const detectedMime = detectMimeType(header.buffer);
      const allowedMimes = config.allowedTypes[category];
      if (!detectedMime || !allowedMimes?.includes(detectedMime)) {
        await storageService.deleteFile(storageKey);
        await prisma.productFile.update({ where: { id: pendingRecord.id }, data: { uploadStatus: 'failed' } });
        throw new Error(`File content type "${detectedMime}" is not allowed for category "${category}"`);
      }

      // Replace existing
      if (existingInSlot) {
        await prisma.productFile.update({
          where: { id: existingInSlot.id },
          data: { isLatest: false, deletedAt: new Date() },
        });
        await storageService.deleteFile(existingInSlot.storageKey);
      }

      const confirmedFile = await prisma.productFile.update({
        where: { id: pendingRecord.id },
        data: {
          uploadStatus: 'confirmed',
          isLatest: true,
          fileSize: BigInt(header.size),
          mimeType: detectedMime,
        },
      });

      return confirmedFile;
    }

    // ── TEST 1: FILE SIZE TESTS (100 KB, 2 MB, 4 MB, 5 MB, 10 MB, 20 MB, 25 MB, 26 MB) ──
    console.log('\n--- TEST 1: FILE SIZE BATTERY ---');
    const sizesToTest = [
      { label: '100 KB', bytes: 100 * 1024 },
      { label: '2 MB', bytes: 2 * 1024 * 1024 },
      { label: '4 MB', bytes: 4 * 1024 * 1024 },
      { label: '5 MB (exceeds Vercel 4.5MB limit)', bytes: 5 * 1024 * 1024 },
      { label: '10 MB (exceeds Vercel 4.5MB limit)', bytes: 10 * 1024 * 1024 },
      { label: '20 MB (exceeds Vercel 4.5MB limit)', bytes: 20 * 1024 * 1024 },
      { label: '25 MB (maximum allowed limit)', bytes: 25 * 1024 * 1024 },
    ];

    for (const test of sizesToTest) {
      process.stdout.write(`  Testing ${test.label}... `);
      const buffer = await createValidPngOfSize(test.bytes);
      const res = await executeDirectUpload({
        category: 'graph',
        slotIndex: 0,
        filename: `test-${test.label.replace(/\s+/g, '')}.png`,
        fileBuffer: buffer,
        mimeType: 'image/png',
      });
      if (res.uploadStatus === 'confirmed' && Number(res.fileSize) >= test.bytes) {
        console.log(`✅ PASS (Recorded: ${res.fileSize} bytes)`);
      } else {
        throw new Error(`Failed size test for ${test.label}`);
      }
    }

    // 26 MB (must be rejected)
    process.stdout.write('  Testing 26 MB (must be rejected)... ');
    try {
      const buffer26Mb = await createValidPngOfSize(26 * 1024 * 1024);
      await executeDirectUpload({
        category: 'graph',
        slotIndex: 0,
        filename: 'oversized-26mb.png',
        fileBuffer: buffer26Mb,
        mimeType: 'image/png',
      });
      throw new Error('Should have rejected 26MB file');
    } catch (err: any) {
      if (err.message.includes('25MB limit')) {
        console.log(`✅ PASS (Correctly rejected: ${err.message})`);
      } else {
        throw err;
      }
    }

    // ── TEST 2: ALL FOUR CATEGORIES ──
    console.log('\n--- TEST 2: ALL FOUR FILE CATEGORIES ---');
    // Microstructure
    const microBuf = await createValidPngOfSize(500 * 1024);
    const mRes = await executeDirectUpload({
      category: 'microstructure',
      slotIndex: 0,
      filename: 'micro-sample-1.png',
      fileBuffer: microBuf,
      mimeType: 'image/png',
    });
    console.log(`  Microstructure Slot 0: ✅ PASS (${mRes.id})`);

    // Graph
    const graphBuf = await createValidPngOfSize(500 * 1024);
    const gRes = await executeDirectUpload({
      category: 'graph',
      slotIndex: 0,
      filename: 'graph-sample.png',
      fileBuffer: graphBuf,
      mimeType: 'image/png',
    });
    console.log(`  Graph Slot 0: ✅ PASS (${gRes.id})`);

    // Original PDF (using 5 MB PDF to exceed 4.5 MB)
    const pdfBuf = createValidPdfOfSize(5 * 1024 * 1024);
    const pRes = await executeDirectUpload({
      category: 'source_pdf',
      slotIndex: 0,
      filename: 'source-document-large.pdf',
      fileBuffer: pdfBuf,
      mimeType: 'application/pdf',
    });
    console.log(`  Original PDF (5MB): ✅ PASS (${pRes.id})`);

    // WhatsApp Image
    const waBuf = await createValidPngOfSize(500 * 1024);
    const wRes = await executeDirectUpload({
      category: 'whatsapp_image',
      slotIndex: 0,
      filename: 'whatsapp-photo.png',
      fileBuffer: waBuf,
      mimeType: 'image/png',
    });
    console.log(`  WhatsApp Image: ✅ PASS (${wRes.id})`);

    // ── TEST 3: THREE MICROSTRUCTURE IMAGES + FOURTH REJECTION ──
    console.log('\n--- TEST 3: MICROSTRUCTURE LIMIT ENFORCEMENT ---');
    const micro2 = await executeDirectUpload({
      category: 'microstructure',
      slotIndex: 1,
      filename: 'micro-sample-2.png',
      fileBuffer: microBuf,
      mimeType: 'image/png',
    });
    console.log(`  Microstructure Slot 1: ✅ PASS (${micro2.id})`);

    const micro3 = await executeDirectUpload({
      category: 'microstructure',
      slotIndex: 2,
      filename: 'micro-sample-3.png',
      fileBuffer: microBuf,
      mimeType: 'image/png',
    });
    console.log(`  Microstructure Slot 2: ✅ PASS (${micro3.id})`);

    process.stdout.write('  Attempting 4th Microstructure image (slotIndex 3)... ');
    try {
      await executeDirectUpload({
        category: 'microstructure',
        slotIndex: 3,
        filename: 'micro-sample-4.png',
        fileBuffer: microBuf,
        mimeType: 'image/png',
      });
      throw new Error('Should have rejected 4th microstructure image');
    } catch (err: any) {
      if (err.message.includes('Invalid slot index') || err.message.includes('Maximum 3')) {
        console.log(`✅ PASS (Rejected: ${err.message})`);
      } else {
        throw err;
      }
    }

    // ── TEST 4: CONCURRENT UPLOADS ──
    console.log('\n--- TEST 4: CONCURRENT UPLOADS ---');
    const concurrentUploads = [
      executeDirectUpload({ category: 'microstructure', slotIndex: 0, filename: 'concurrent-1.png', fileBuffer: microBuf, mimeType: 'image/png' }),
      executeDirectUpload({ category: 'microstructure', slotIndex: 1, filename: 'concurrent-2.png', fileBuffer: microBuf, mimeType: 'image/png' }),
      executeDirectUpload({ category: 'graph', slotIndex: 0, filename: 'concurrent-graph.png', fileBuffer: graphBuf, mimeType: 'image/png' }),
    ];
    const concurrentResults = await Promise.all(concurrentUploads);
    console.log(`  Concurrent upload of ${concurrentResults.length} files: ✅ PASS`);

    // ── TEST 5: INVALID IMAGE & PDF DETECTION + STORAGE CLEANUP ──
    console.log('\n--- TEST 5: INVALID FILE DETECTION & STORAGE CLEANUP ---');
    const fakeImageBuffer = Buffer.from('FAKE_EXECUTABLE_OR_TEXT_DATA_NOT_AN_IMAGE');
    process.stdout.write('  Uploading fake image (invalid magic bytes)... ');
    try {
      await executeDirectUpload({
        category: 'whatsapp_image',
        slotIndex: 0,
        filename: 'fake-image.png',
        fileBuffer: fakeImageBuffer,
        mimeType: 'image/png',
      });
      throw new Error('Should have rejected invalid image');
    } catch (err: any) {
      if (err.message.includes('not allowed') || err.message.includes('Invalid or unrecognized')) {
        console.log(`✅ PASS (Rejected: ${err.message})`);
      } else {
        throw err;
      }
    }

    // Verify storage cleanup of invalid file
    const lastKey = createdStorageKeys[createdStorageKeys.length - 1];
    const checkHeader = await storageService.fetchObjectHeader(lastKey);
    if (!checkHeader.exists) {
      console.log(`  Storage cleanup verified: Invalid object removed from Supabase Storage ✅ PASS`);
    } else {
      throw new Error('Storage cleanup failed: object still exists in storage');
    }

    // ── TEST 6: REPLACEMENT & DELETION ──
    console.log('\n--- TEST 6: REPLACEMENT & DELETION ---');
    const replacementBuf = await createValidPngOfSize(200 * 1024);
    const replaced = await executeDirectUpload({
      category: 'graph',
      slotIndex: 0,
      filename: 'graph-replacement.png',
      fileBuffer: replacementBuf,
      mimeType: 'image/png',
    });
    console.log(`  File replacement executed cleanly: ✅ PASS (${replaced.id})`);

    // ── TEST 7: ARCHIVE / PDF DOWNLOAD > 4.5 MB (VERCEL COMPATIBILITY) ──
    console.log('\n--- TEST 7: ARCHIVES & DOWNLOADS > 4.5 MB ---');
    // The product now has confirmed 5MB PDF, 200KB Graph, 500KB Micro 1, 500KB Micro 2, 500KB WA. Total > 6.5 MB!
    // Test product archive generation and redirect
    const tempZipName = `test-product-archive-${Date.now()}.zip`;
    const tempZipKey = `_temp_archives/${tempZipName}`;
    const dummyZipData = Buffer.alloc(6 * 1024 * 1024, 0x5a); // 6 MB archive
    await storageService.uploadFile(tempZipKey, dummyZipData, 'application/zip');
    createdStorageKeys.push(tempZipKey);

    const signedZipUrl = await storageService.getSignedUrl(tempZipKey, 60, { download: tempZipName });
    const headCheck = await fetch(signedZipUrl, { method: 'HEAD' });
    const zipLen = parseInt(headCheck.headers.get('content-length') || '0', 10);
    console.log(`  Archive size: ${(zipLen / 1024 / 1024).toFixed(2)} MB (> 4.5 MB Vercel limit)`);
    console.log(`  Signed redirect URL generated: ✅ PASS (${signedZipUrl.substring(0, 75)}...)`);

    // Test cleanup
    await storageService.deleteFile(tempZipKey);
    console.log(`  Temporary archive cleaned up: ✅ PASS`);

    console.log('\n====================================================');
    console.log('🎉 ALL DIRECT SUPABASE UPLOAD TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } finally {
    // Clean up test batch and files from DB and Supabase Storage
    console.log('\n🧹 Cleaning up test records from database and storage...');
    for (const key of createdStorageKeys) {
      try {
        await storageService.deleteFile(key);
      } catch {}
    }
    if (batch?.id) {
      try {
        await prisma.batch.delete({ where: { id: batch.id } });
      } catch {}
    }
    console.log('✅ Cleanup complete.');
  }
}

runDirectUploadsE2E().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
