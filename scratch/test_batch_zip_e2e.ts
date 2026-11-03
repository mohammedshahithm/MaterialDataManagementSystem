import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import prisma from '../backend/src/config/database';
import { storageService } from '../backend/src/services/storageService';
import app from '../backend/src/server';

const TEST_PORT = 3199;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Sample 1x1 PNG bytes
const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// Sample valid minimal PDF bytes
const SAMPLE_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF',
  'utf-8'
);

async function run() {
  console.log('====================================================');
  console.log('E2E BATCH-LEVEL ZIP DOWNLOAD VERIFICATION TEST');
  console.log('====================================================\n');

  // Start test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`[TEST SERVER] Listening on ${BASE_URL}\n`);
      resolve();
    });
  });

  const createdBatchIds: string[] = [];
  const createdStorageKeys: string[] = [];
  const tempExtractDirs: string[] = [];

  try {
    // 0. Get terminal test user
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found in database');

    // ──────────────────────────────────────────────────────────────
    // TEST 1 & 8: Batch with multiple products, special characters & files
    // ──────────────────────────────────────────────────────────────
    console.log('--- TEST 1: Creating Batch with Special Chars and Multiple Products ---');
    const batchSpecialName = `Batch #99: Special / Test * <2026>`;
    const batch = await prisma.batch.create({
      data: {
        batchName: batchSpecialName,
        description: 'E2E Batch ZIP Download Test with special characters',
        createdById: user.id,
      },
    });
    createdBatchIds.push(batch.id);
    console.log(`Created batch ID: ${batch.id} ("${batch.batchName}")`);

    const dateFolder = await prisma.dateFolder.create({
      data: {
        batchId: batch.id,
        workDate: new Date('2026-11-02'),
        createdById: user.id,
      },
    });

    // Product 1: Complete files (2 microstructure, 1 graph, 1 PDF, 1 WhatsApp)
    const product1 = await prisma.product.create({
      data: {
        dateFolderId: dateFolder.id,
        productCode: 'Product-001:A',
        productName: 'Special Grade Steel Rod',
        createdById: user.id,
      },
    });

    // Product 2: Partial files (missing optional graph and whatsapp)
    const product2 = await prisma.product.create({
      data: {
        dateFolderId: dateFolder.id,
        productCode: 'Product-002',
        productName: 'Titanium Bar',
        createdById: user.id,
      },
    });

    // Helper to upload file to storage and record in DB
    const uploadTestFile = async (
      productId: string,
      category: any,
      slotIndex: number,
      origName: string,
      buffer: Buffer,
      mime: string
    ) => {
      const storageKey = `test-e2e/${Date.now()}-${slotIndex}-${origName}`;
      await storageService.uploadFile(storageKey, buffer, mime);
      createdStorageKeys.push(storageKey);

      await prisma.productFile.create({
        data: {
          productId,
          category,
          slotIndex,
          originalFilename: origName,
          storageKey,
          mimeType: mime,
          fileSize: BigInt(buffer.length),
          uploadedById: user.id,
          uploadStatus: 'confirmed',
          isLatest: true,
        },
      });
    };

    console.log('Uploading sample files to Supabase Storage for Product-001...');
    await uploadTestFile(product1.id, 'microstructure', 0, 'raw_micro_1.png', SAMPLE_PNG, 'image/png');
    await uploadTestFile(product1.id, 'microstructure', 1, 'raw_micro_2.png', SAMPLE_PNG, 'image/png');
    await uploadTestFile(product1.id, 'graph', 0, 'stress_strain.png', SAMPLE_PNG, 'image/png');
    await uploadTestFile(product1.id, 'source_pdf', 0, 'mill_test_report.pdf', SAMPLE_PDF, 'application/pdf');
    await uploadTestFile(product1.id, 'whatsapp_image', 0, 'wa_specimen.png', SAMPLE_PNG, 'image/png');

    console.log('Uploading partial files for Product-002...');
    await uploadTestFile(product2.id, 'microstructure', 0, 'surface_micro.png', SAMPLE_PNG, 'image/png');
    await uploadTestFile(product2.id, 'source_pdf', 0, 'cert_origin.pdf', SAMPLE_PDF, 'application/pdf');

    // ──────────────────────────────────────────────────────────────
    // TEST 2, 3, 4: Download Batch ZIP and inspect headers & structure
    // ──────────────────────────────────────────────────────────────
    console.log('\n--- TEST 2: Downloading Batch ZIP Archive via API ---');
    const zipUrl = `${BASE_URL}/api/batches/${batch.id}/archive`;
    const res = await fetch(zipUrl);

    console.log(`HTTP Status: ${res.status}`);
    const disposition = res.headers.get('content-disposition');
    const contentType = res.headers.get('content-type');
    console.log(`Content-Type: ${contentType}`);
    console.log(`Content-Disposition: ${disposition}`);

    if (res.status !== 200) {
      throw new Error(`Batch ZIP download failed with status ${res.status}`);
    }
    if (!contentType?.includes('application/zip')) {
      throw new Error(`Invalid content-type: ${contentType}`);
    }

    // Verify filename header
    if (!disposition?.includes('.zip')) {
      throw new Error(`Content-Disposition does not contain .zip filename: ${disposition}`);
    }

    const zipBuffer = Buffer.from(await res.arrayBuffer());
    console.log(`Downloaded ZIP size: ${zipBuffer.length} bytes`);

    // Save ZIP to disk
    const tempZipPath = path.resolve(__dirname, 'test_batch_download.zip');
    const tempExtractDir = path.resolve(__dirname, 'test_batch_extracted');
    tempExtractDirs.push(tempExtractDir);
    fs.writeFileSync(tempZipPath, zipBuffer);

    // ──────────────────────────────────────────────────────────────
    // TEST 10: Extract using native Windows PowerShell Expand-Archive
    // ──────────────────────────────────────────────────────────────
    console.log('\n--- TEST 3: Verifying Windows Extraction via Expand-Archive ---');
    if (fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempExtractDir, { recursive: true });

    execSync(`powershell -Command "Expand-Archive -Path '${tempZipPath}' -DestinationPath '${tempExtractDir}' -Force"`);
    console.log('✅ Successfully extracted using native Windows Expand-Archive!');

    // Read extracted tree
    function getFileTree(dir: string, base: string = ''): string[] {
      const files: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          files.push(...getFileTree(full, rel));
        } else {
          files.push(rel);
        }
      }
      return files;
    }

    const extractedFiles = getFileTree(tempExtractDir);
    console.log('\nExtracted File Tree inside ZIP:');
    extractedFiles.forEach((f) => console.log(`  ├── ${f}`));

    // Verify root folder name is sanitized batch name
    const expectedRoot = 'Batch-#99-Special-Test-2026';
    const hasExpectedRoot = extractedFiles.some((f) => f.startsWith(expectedRoot));
    console.log(`Root folder matches sanitized batch name "${expectedRoot}":`, hasExpectedRoot);
    if (!hasExpectedRoot) throw new Error('Root folder name does not match expected sanitized batch name');

    // Verify Product-001 files in new Section H hierarchy
    const dateSubfolder = 'Date-2026-11-02';
    const p1Files = [
      `${expectedRoot}/${dateSubfolder}/Product-001-A/Microstructure/Microstructure-Image-1.png`,
      `${expectedRoot}/${dateSubfolder}/Product-001-A/Microstructure/Microstructure-Image-2.png`,
      `${expectedRoot}/${dateSubfolder}/Product-001-A/Graph/Graph-Image.png`,
      `${expectedRoot}/${dateSubfolder}/Product-001-A/Original-PDF/Original-Document.pdf`,
      `${expectedRoot}/${dateSubfolder}/Product-001-A/WhatsApp-Image/WhatsApp-Image.png`,
    ];
    for (const expectedFile of p1Files) {
      const found = extractedFiles.includes(expectedFile);
      console.log(`  Verify ${expectedFile}:`, found ? 'EXISTS ✅' : 'MISSING ❌');
      if (!found) throw new Error(`Missing expected file in ZIP: ${expectedFile}`);
    }

    // Verify Product-002 files in new Section H hierarchy
    const p2Files = [
      `${expectedRoot}/${dateSubfolder}/Product-002/Microstructure/Microstructure-Image-1.png`,
      `${expectedRoot}/${dateSubfolder}/Product-002/Original-PDF/Original-Document.pdf`,
    ];
    for (const expectedFile of p2Files) {
      const found = extractedFiles.includes(expectedFile);
      console.log(`  Verify ${expectedFile}:`, found ? 'EXISTS ✅' : 'MISSING ❌');
      if (!found) throw new Error(`Missing expected file in ZIP: ${expectedFile}`);
    }

    // Verify manifest
    const hasManifest = extractedFiles.includes(`${expectedRoot}/manifest.json`);
    console.log(`  Verify ${expectedRoot}/manifest.json:`, hasManifest ? 'EXISTS ✅' : 'MISSING ❌');
    if (!hasManifest) throw new Error('Missing manifest.json in batch ZIP root');

    // Clean up zip file
    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);

    // ──────────────────────────────────────────────────────────────
    // TEST 5: Download Empty Batch
    // ──────────────────────────────────────────────────────────────
    console.log('\n--- TEST 4: Downloading Empty Batch ZIP ---');
    const emptyBatch = await prisma.batch.create({
      data: {
        batchName: 'Empty-Batch-Test-2026',
        description: 'Empty batch test',
        createdById: user.id,
      },
    });
    createdBatchIds.push(emptyBatch.id);

    const emptyRes = await fetch(`${BASE_URL}/api/batches/${emptyBatch.id}/archive`);
    console.log(`Empty Batch Download Status: ${emptyRes.status}`);
    const emptyBuffer = Buffer.from(await emptyRes.arrayBuffer());
    console.log(`Empty Batch ZIP size: ${emptyBuffer.length} bytes`);

    const emptyZipPath = path.resolve(__dirname, 'empty_batch.zip');
    const emptyExtractDir = path.resolve(__dirname, 'empty_batch_extracted');
    tempExtractDirs.push(emptyExtractDir);
    fs.writeFileSync(emptyZipPath, emptyBuffer);

    execSync(`powershell -Command "Expand-Archive -Path '${emptyZipPath}' -DestinationPath '${emptyExtractDir}' -Force"`);
    const emptyFiles = getFileTree(emptyExtractDir);
    console.log('Extracted Empty Batch Tree:');
    emptyFiles.forEach((f) => console.log(`  ├── ${f}`));
    const hasReadme = emptyFiles.some((f) => f.includes('README.txt'));
    console.log('Empty batch contains README.txt:', hasReadme ? 'YES ✅' : 'NO ❌');
    if (!hasReadme) throw new Error('Empty batch ZIP failed to extract clean README.txt');
    if (fs.existsSync(emptyZipPath)) fs.unlinkSync(emptyZipPath);

    // ──────────────────────────────────────────────────────────────
    // TEST 9: Individual Product ZIP Download
    // ──────────────────────────────────────────────────────────────
    console.log('\n--- TEST 5: Individual Product ZIP Download ---');
    const p1ZipRes = await fetch(`${BASE_URL}/api/products/${product1.id}/archive`);
    console.log(`Product ZIP Status: ${p1ZipRes.status}`);
    const p1Disp = p1ZipRes.headers.get('content-disposition');
    console.log(`Product ZIP Content-Disposition: ${p1Disp}`);
    if (!p1Disp?.includes('Product-001-A.zip')) {
      throw new Error(`Unexpected product zip disposition: ${p1Disp}`);
    }
    const p1ZipBuffer = Buffer.from(await p1ZipRes.arrayBuffer());
    const tempP1ZipPath = path.resolve(__dirname, 'test_p1_download.zip');
    const tempP1ExtractDir = path.resolve(__dirname, 'test_p1_extracted');
    tempExtractDirs.push(tempP1ExtractDir);
    fs.writeFileSync(tempP1ZipPath, p1ZipBuffer);
    execSync(`powershell -Command "Expand-Archive -Path '${tempP1ZipPath}' -DestinationPath '${tempP1ExtractDir}' -Force"`);
    const p1ExtractedFiles = getFileTree(tempP1ExtractDir);
    console.log('Extracted Product ZIP Tree:');
    p1ExtractedFiles.forEach((f) => console.log(`  ├── ${f}`));
    const hasP1Micro = p1ExtractedFiles.includes('Product-001-A/Microstructure/Microstructure-Image-1.png');
    console.log('Product ZIP has category subfolder Microstructure:', hasP1Micro ? 'YES ✅' : 'NO ❌');
    if (!hasP1Micro) throw new Error('Product ZIP missing category folder');
    if (fs.existsSync(tempP1ZipPath)) fs.unlinkSync(tempP1ZipPath);

    // ──────────────────────────────────────────────────────────────
    // TEST 11: Individual File Download Default Naming
    // ──────────────────────────────────────────────────────────────
    console.log('\n--- TEST 6: Individual File Download Default Naming ---');
    const p1FilesDb = await prisma.productFile.findMany({ where: { productId: product1.id } });
    const pdfFile = p1FilesDb.find((f) => f.category === 'source_pdf');
    if (pdfFile) {
      const fileUrlRes = await fetch(`${BASE_URL}/api/files/${pdfFile.id}/download-url`);
      const fileUrlData = await fileUrlRes.json();
      console.log(`Source PDF download filename: ${fileUrlData.filename}`);
      if (fileUrlData.filename !== 'Product-001-A-Original-Document.pdf') {
        throw new Error(`Expected Product-001-A-Original-Document.pdf, got: ${fileUrlData.filename}`);
      }
      console.log('✅ Individual Original PDF default naming verified!');
    }

    // ──────────────────────────────────────────────────────────────
    // TEST 12: Download Log & Audit Log Tracking
    // ──────────────────────────────────────────────────────────────
    console.log('\n--- TEST 7: Download Logs Verification ---');
    const logs = await prisma.downloadLog.findMany({
      where: { batchId: batch.id },
      orderBy: { downloadedAt: 'desc' },
    });
    console.log(`Recorded download logs for batch: ${logs.length}`);
    const batchLog = logs.find((l) => l.downloadType === 'batch_zip');
    console.log('Batch ZIP download logged in database:', Boolean(batchLog), batchLog?.filename);
    if (!batchLog) throw new Error('Batch zip download was not recorded in download_logs');

    console.log('\n====================================================');
    console.log('🎉 ALL 10 BATCH-LEVEL ZIP REQUIREMENTS VERIFIED 100%!');
    console.log('====================================================\n');
  } finally {
    // Cleanup temporary files and directories
    for (const d of tempExtractDirs) {
      if (fs.existsSync(d)) {
        try {
          fs.rmSync(d, { recursive: true, force: true });
        } catch {}
      }
    }

    // Cleanup storage files
    console.log('Cleaning up test storage keys...');
    for (const key of createdStorageKeys) {
      try {
        await storageService.deleteFile(key);
      } catch {}
    }

    // Cleanup database test batches (cascade deletes products & files)
    console.log('Cleaning up test batches in database...');
    for (const id of createdBatchIds) {
      try {
        await prisma.batch.delete({ where: { id } });
      } catch {}
    }

    server.close();
  }
}

run().catch((err) => {
  console.error('\n❌ E2E Verification failed:', err);
  process.exit(1);
});

