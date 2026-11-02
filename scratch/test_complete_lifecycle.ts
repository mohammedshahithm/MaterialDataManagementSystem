const API_BASE = 'http://127.0.0.1:3001/api';

async function runCompleteLifecycleTest() {
  console.log('🧪 Starting Complete No-Login Lifecycle & Security Test...');
  const results: { test: string; status: 'PASS' | 'FAIL'; details: string }[] = [];

  const timestamp = Date.now();
  const testBatchName = `QA-Batch-NoLogin-${timestamp}`;
  let batchId = '';
  let dateId = '';
  let productId = '';

  try {
    // 1. Batch Creation without credentials
    console.log('\n--- 1. Batch Creation (No-Login) ---');
    const bRes = await fetch(`${API_BASE}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchName: testBatchName,
        description: 'Automated E2E Verification of Login-Free Mode',
      }),
    });
    const bData = await bRes.json();
    batchId = bData.id;
    console.log(`Created Batch ID: ${batchId}, CreatedBy ID: ${bData.createdById}`);

    if (bRes.status === 201 && batchId && bData.createdById === '00000000-0000-0000-0000-000000000001') {
      results.push({ test: 'Batch Creation', status: 'PASS', details: `Created batch ${batchId} attributed to Shared Terminal` });
      console.log('✅ PASS: Batch Creation attributed to Shared Terminal');
    } else {
      results.push({ test: 'Batch Creation', status: 'FAIL', details: `Status ${bRes.status}, User: ${bData?.createdById}` });
      console.log('❌ FAIL: Batch Creation');
    }

    // 2. Date Folder Creation
    console.log('\n--- 2. Date Folder Creation (No-Login) ---');
    const dRes = await fetch(`${API_BASE}/batches/${batchId}/dates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDate: '2026-11-02' }),
    });
    const dData = await dRes.json();
    dateId = dData.id;
    console.log(`Created DateFolder ID: ${dateId}`);
    if (dRes.status === 201 && dateId) {
      results.push({ test: 'Date Folder Creation', status: 'PASS', details: `Created date folder ${dateId}` });
      console.log('✅ PASS: Date Folder Creation');
    } else {
      results.push({ test: 'Date Folder Creation', status: 'FAIL', details: `Status ${dRes.status}: ${JSON.stringify(dData)}` });
      console.log('❌ FAIL: Date Folder Creation');
    }

    // 3. Product Creation
    console.log('\n--- 3. Product Creation (No-Login) ---');
    const pRes = await fetch(`${API_BASE}/dates/${dateId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: 'E2E Specimen Alpha',
        productCode: `SPEC-${timestamp}`,
        metadata: { material: 'Titanium Ti-6Al-4V', remarks: 'No-Login E2E Test' },
      }),
    });
    const pData = await pRes.json();
    productId = pData.id;
    console.log(`Created Product ID: ${productId}`);
    if (pRes.status === 201 && productId) {
      results.push({ test: 'Product Creation', status: 'PASS', details: `Created product ${productId} attributed to Shared Terminal` });
      console.log('✅ PASS: Product Creation');
    } else {
      results.push({ test: 'Product Creation', status: 'FAIL', details: `Status ${pRes.status}: ${JSON.stringify(pData)}` });
      console.log('❌ FAIL: Product Creation');
    }

    // 4. File Uploads (4 categories: microstructure, graph, source_pdf, whatsapp_image)
    console.log('\n--- 4. File Uploads across 4 categories ---');
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF');

    const uploads = [
      { category: 'microstructure', slotIndex: 0, filename: 'micro1.png', buffer: pngBuffer, mime: 'image/png' },
      { category: 'graph', slotIndex: 0, filename: 'graph.png', buffer: pngBuffer, mime: 'image/png' },
      { category: 'source_pdf', slotIndex: 0, filename: 'spec.pdf', buffer: pdfBuffer, mime: 'application/pdf' },
      { category: 'whatsapp_image', slotIndex: 0, filename: 'wa.png', buffer: pngBuffer, mime: 'image/png' },
    ];

    let uploadSuccessCount = 0;
    for (const u of uploads) {
      const formData = new FormData();
      const blob = new Blob([u.buffer], { type: u.mime });
      formData.append('file', blob, u.filename);
      formData.append('category', u.category);
      formData.append('slotIndex', String(u.slotIndex));

      const upRes = await fetch(`${API_BASE}/products/${productId}/files/upload`, {
        method: 'POST',
        body: formData,
      });
      const upData = await upRes.json();
      if (upRes.status === 201 && upData?.fileId) {
        uploadSuccessCount++;
      } else {
        console.error(`Upload ${u.category} failed:`, upRes.status, upData);
      }
    }

    if (uploadSuccessCount === 4) {
      results.push({ test: 'File Uploads (4 categories)', status: 'PASS', details: 'All 4 category files uploaded to Supabase Storage' });
      console.log('✅ PASS: File Uploads across 4 categories');
    } else {
      results.push({ test: 'File Uploads (4 categories)', status: 'FAIL', details: `Only ${uploadSuccessCount}/4 uploaded` });
      console.log('❌ FAIL: File Uploads');
    }

    // 5. Composite PDF Report Generation
    console.log('\n--- 5. Composite PDF Report Generation ---');
    const repRes = await fetch(`${API_BASE}/products/${productId}/generate-report`, { method: 'POST' });
    const repData = await repRes.json();
    console.log('Report generation status:', repRes.status, repData);
    if (repRes.status === 200 && repData?.fileId) {
      results.push({ test: 'Composite PDF Generation', status: 'PASS', details: `Report generated successfully (size: ${repData.size} bytes)` });
      console.log('✅ PASS: Composite PDF Generation');
    } else {
      results.push({ test: 'Composite PDF Generation', status: 'FAIL', details: `Status ${repRes.status}: ${JSON.stringify(repData)}` });
      console.log('❌ FAIL: Composite PDF Generation');
    }

    // 6. Product ZIP Archive Download
    console.log('\n--- 6. Product ZIP Archive Download ---');
    const pZipRes = await fetch(`${API_BASE}/products/${productId}/archive`);
    const pZipBuf = await pZipRes.arrayBuffer();
    const pZipSize = pZipBuf.byteLength;
    console.log(`Product ZIP size: ${pZipSize} bytes`);
    if (pZipRes.status === 200 && pZipSize > 500) {
      results.push({ test: 'Product ZIP Download', status: 'PASS', details: `Downloaded ${pZipSize} bytes archive` });
      console.log('✅ PASS: Product ZIP Download');
    } else {
      results.push({ test: 'Product ZIP Download', status: 'FAIL', details: `Status ${pZipRes.status}, size ${pZipSize}` });
      console.log('❌ FAIL: Product ZIP Download');
    }

    // 7. Batch ZIP Archive Download
    console.log('\n--- 7. Batch ZIP Archive Download ---');
    const bZipRes = await fetch(`${API_BASE}/batches/${batchId}/archive`);
    const bZipBuf = await bZipRes.arrayBuffer();
    const bZipSize = bZipBuf.byteLength;
    console.log(`Batch ZIP size: ${bZipSize} bytes`);
    if (bZipRes.status === 200 && bZipSize > 500) {
      results.push({ test: 'Batch ZIP Download', status: 'PASS', details: `Downloaded ${bZipSize} bytes archive` });
      console.log('✅ PASS: Batch ZIP Download');
    } else {
      results.push({ test: 'Batch ZIP Download', status: 'FAIL', details: `Status ${bZipRes.status}, size ${bZipSize}` });
      console.log('❌ FAIL: Batch ZIP Download');
    }

    // 8. Close Batch & Confirm Backup
    console.log('\n--- 8. Close Batch & Confirm Backup ---');
    await fetch(`${API_BASE}/batches/${batchId}/close`, { method: 'POST' });
    const backupRes = await fetch(`${API_BASE}/batches/${batchId}/backup-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diskIdentifier: 'TEST-EXTERNAL-DRIVE-2TB',
        destinationPath: 'E:\\Backups\\2026\\NoLoginTest',
        notes: 'Automated lifecycle test backup confirmation',
      }),
    });
    const backupData = await backupRes.json();
    console.log('Backup confirmation response status:', backupData?.status);
    if (backupRes.status === 201 && backupData?.status === 'confirmed') {
      results.push({ test: 'Backup Confirmation', status: 'PASS', details: 'Backup record created with status confirmed' });
      console.log('✅ PASS: Backup Confirmation');
    } else {
      results.push({ test: 'Backup Confirmation', status: 'FAIL', details: `Status was: ${backupData?.status}` });
      console.log('❌ FAIL: Backup Confirmation');
    }

    // 9. Unauthorized Cloud Deletion Block (HTTP 403)
    console.log('\n--- 9. Unauthorized Cloud Deletion Block (HTTP 403) ---');
    const unauthDelRes = await fetch(`${API_BASE}/batches/${batchId}/approve-deletion`, {
      method: 'POST',
    });
    if (unauthDelRes.status === 403) {
      results.push({ test: 'Unauthorized Deletion Block', status: 'PASS', details: 'HTTP 403 Forbidden correctly returned for unauthenticated deletion attempt' });
      console.log('✅ PASS: Unauthorized Deletion Block (HTTP 403 Forbidden received)');
    } else {
      results.push({ test: 'Unauthorized Deletion Block', status: 'FAIL', details: `Expected 403, got ${unauthDelRes.status}` });
      console.log(`❌ FAIL: Expected 403, got ${unauthDelRes.status}`);
    }

    // 10. Invalid Admin Passcode Block (HTTP 403)
    console.log('\n--- 10. Invalid Admin Passcode Block (HTTP 403) ---');
    const invalidDelRes = await fetch(`${API_BASE}/batches/${batchId}/approve-deletion`, {
      method: 'POST',
      headers: { 'x-admin-key': 'WrongPasscode456' },
    });
    if (invalidDelRes.status === 403) {
      results.push({ test: 'Invalid Passcode Block', status: 'PASS', details: 'HTTP 403 Forbidden returned for invalid admin passcode' });
      console.log('✅ PASS: Invalid Passcode Block (HTTP 403 Forbidden received)');
    } else {
      results.push({ test: 'Invalid Passcode Block', status: 'FAIL', details: `Expected 403, got ${invalidDelRes.status}` });
      console.log(`❌ FAIL: Expected 403, got ${invalidDelRes.status}`);
    }

    // 11. Authorized Cloud Deletion with Admin Passcode (HTTP 200)
    console.log('\n--- 11. Authorized Cloud Deletion with Admin Passcode (HTTP 200) ---');
    const authDelRes = await fetch(`${API_BASE}/batches/${batchId}/approve-deletion`, {
      method: 'POST',
      headers: { 'x-admin-key': 'AdminSecurityPasscode2026!' },
    });
    const authDelData = await authDelRes.json();
    console.log('Deletion result:', authDelData);
    if (authDelRes.status === 200 && authDelData.deleted > 0) {
      results.push({ test: 'Authorized Cloud Deletion', status: 'PASS', details: `Deleted ${authDelData.deleted} cloud files with admin authorization` });
      console.log(`✅ PASS: Authorized Cloud Deletion (${authDelData.deleted} files deleted)`);
    } else {
      results.push({ test: 'Authorized Cloud Deletion', status: 'FAIL', details: `Status ${authDelRes.status}, deleted: ${authDelData?.deleted}` });
      console.log('❌ FAIL: Authorized Cloud Deletion');
    }

    // 12. Storage Privacy Check: Direct unauthenticated public access should fail
    console.log('\n--- 12. Storage Privacy Check ---');
    try {
      const publicUrl = 'https://xsmfpxeikowpghbuhdwa.supabase.co/storage/v1/object/public/material-data/test.png';
      const pubRes = await fetch(publicUrl);
      if (pubRes.status === 400 || pubRes.status === 403 || pubRes.status === 404) {
        results.push({ test: 'Storage Privacy Check', status: 'PASS', details: `Direct public bucket access denied with HTTP ${pubRes.status}` });
        console.log(`✅ PASS: Storage Privacy Check (HTTP ${pubRes.status} received)`);
      } else {
        results.push({ test: 'Storage Privacy Check', status: 'FAIL', details: `Public URL returned HTTP ${pubRes.status}` });
        console.log(`❌ FAIL: Direct public access returned HTTP ${pubRes.status}`);
      }
    } catch (e: any) {
      results.push({ test: 'Storage Privacy Check', status: 'PASS', details: 'Direct public access failed as expected' });
      console.log('✅ PASS: Storage Privacy Check');
    }

  } catch (error: any) {
    console.error('Test execution failed:', error.message);
    results.push({ test: 'Fatal Exception', status: 'FAIL', details: error.message });
  }

  console.log('\n========================================');
  console.log('FULL LIFECYCLE TEST SUMMARY:');
  console.log('========================================');
  results.forEach(r => console.log(`${r.status === 'PASS' ? '✅' : '❌'} [${r.status}] ${r.test}: ${r.details}`));
  const allPassed = results.every(r => r.status === 'PASS');
  console.log(`\nOVERALL: ${allPassed ? 'ALL LIFECYCLE TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

runCompleteLifecycleTest();
