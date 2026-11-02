const API_BASE = 'http://127.0.0.1:3001/api';

async function runSharedTerminalLifecycleTest() {
  console.log('🏭 Starting Shared Factory Terminal Complete Lifecycle & Deletion Test...');
  const results: { test: string; status: 'PASS' | 'FAIL'; details: string }[] = [];

  const timestamp = Date.now();
  const testBatchName = `Terminal-Batch-${timestamp}`;
  let batchId = '';
  let dateId = '';
  let productId = '';

  try {
    // 1. Batch Creation (No login, no credentials)
    console.log('\n--- 1. Batch Creation ---');
    const bRes = await fetch(`${API_BASE}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchName: testBatchName,
        description: 'Shared Factory Terminal Production Run',
      }),
    });
    const bData = await bRes.json();
    batchId = bData.id;
    console.log(`Created Batch ID: ${batchId}, CreatedBy ID: ${bData.createdById}`);

    if (bRes.status === 201 && batchId && bData.createdById === '00000000-0000-0000-0000-000000000001') {
      results.push({ test: 'Batch Creation', status: 'PASS', details: `Created batch ${batchId} under Shared Factory Terminal` });
      console.log('✅ PASS: Batch Creation under Shared Factory Terminal');
    } else {
      results.push({ test: 'Batch Creation', status: 'FAIL', details: `Status ${bRes.status}, User: ${bData?.createdById}` });
      console.log('❌ FAIL: Batch Creation');
    }

    // 2. Batch Update / Rename
    console.log('\n--- 2. Batch Rename & Edit ---');
    const updatedName = `${testBatchName}-Renamed`;
    const bUpdateRes = await fetch(`${API_BASE}/batches/${batchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchName: updatedName }),
    });
    const bUpdateData = await bUpdateRes.json();
    if (bUpdateRes.status === 200 && bUpdateData.batchName === updatedName) {
      results.push({ test: 'Batch Edit & Rename', status: 'PASS', details: `Updated batch name to ${updatedName}` });
      console.log('✅ PASS: Batch Edit & Rename');
    } else {
      results.push({ test: 'Batch Edit & Rename', status: 'FAIL', details: `Status ${bUpdateRes.status}` });
      console.log('❌ FAIL: Batch Edit & Rename');
    }

    // 3. Date Folder Creation
    console.log('\n--- 3. Date Folder Creation ---');
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

    // 4. Product Creation & Management
    console.log('\n--- 4. Product Creation ---');
    const pRes = await fetch(`${API_BASE}/dates/${dateId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: 'Turbine Blade Specimen X',
        productCode: `TB-X-${timestamp}`,
        metadata: { material: 'Inconel 718', grade: 'Aerospace Grade 1', remarks: 'Factory Terminal Specimen' },
      }),
    });
    const pData = await pRes.json();
    productId = pData.id;
    console.log(`Created Product ID: ${productId}`);
    if (pRes.status === 201 && productId) {
      results.push({ test: 'Product Creation', status: 'PASS', details: `Created product ${productId} under Shared Terminal` });
      console.log('✅ PASS: Product Creation');
    } else {
      results.push({ test: 'Product Creation', status: 'FAIL', details: `Status ${pRes.status}: ${JSON.stringify(pData)}` });
      console.log('❌ FAIL: Product Creation');
    }

    // 5. File Uploads (up to 3 microstructure, 1 graph, 1 PDF, 1 WhatsApp)
    console.log('\n--- 5. File Uploads (6 files across all slots) ---');
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF');

    const uploads = [
      { category: 'microstructure', slotIndex: 0, filename: 'micro1.png', buffer: pngBuffer, mime: 'image/png' },
      { category: 'microstructure', slotIndex: 1, filename: 'micro2.png', buffer: pngBuffer, mime: 'image/png' },
      { category: 'microstructure', slotIndex: 2, filename: 'micro3.png', buffer: pngBuffer, mime: 'image/png' },
      { category: 'graph', slotIndex: 0, filename: 'graph.png', buffer: pngBuffer, mime: 'image/png' },
      { category: 'source_pdf', slotIndex: 0, filename: 'test_spec.pdf', buffer: pdfBuffer, mime: 'application/pdf' },
      { category: 'whatsapp_image', slotIndex: 0, filename: 'wa_spec.png', buffer: pngBuffer, mime: 'image/png' },
    ];

    let uploadCount = 0;
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
        uploadCount++;
      } else {
        console.error(`Upload ${u.category}[${u.slotIndex}] failed:`, upRes.status, upData);
      }
    }

    if (uploadCount === 6) {
      results.push({ test: 'File Uploads (All Categories)', status: 'PASS', details: 'All 6 files uploaded (3 micro, 1 graph, 1 pdf, 1 wa)' });
      console.log('✅ PASS: File Uploads (All Categories)');
    } else {
      results.push({ test: 'File Uploads (All Categories)', status: 'FAIL', details: `Uploaded ${uploadCount}/6` });
      console.log('❌ FAIL: File Uploads');
    }

    // 6. Final Composite PDF Report Generation
    console.log('\n--- 6. Final Composite PDF Report Generation ---');
    const repRes = await fetch(`${API_BASE}/products/${productId}/generate-report`, { method: 'POST' });
    const repData = await repRes.json();
    if (repRes.status === 200 && repData?.fileId) {
      results.push({ test: 'Composite PDF Generation', status: 'PASS', details: `Report generated (${repData.size} bytes)` });
      console.log('✅ PASS: Composite PDF Generation');
    } else {
      results.push({ test: 'Composite PDF Generation', status: 'FAIL', details: `Status ${repRes.status}: ${JSON.stringify(repData)}` });
      console.log('❌ FAIL: Composite PDF Generation');
    }

    // 7. Product PDF Download
    console.log('\n--- 7. Product PDF Download ---');
    const pdfDownRes = await fetch(`${API_BASE}/products/${productId}/report/download`);
    const pdfDownData = await pdfDownRes.json();
    if (pdfDownRes.status === 200 && pdfDownData?.downloadUrl) {
      results.push({ test: 'Product PDF Download Link', status: 'PASS', details: 'Pre-signed URL acquired for product PDF report' });
      console.log('✅ PASS: Product PDF Download Link');
    } else {
      results.push({ test: 'Product PDF Download Link', status: 'FAIL', details: `Status ${pdfDownRes.status}` });
      console.log('❌ FAIL: Product PDF Download Link');
    }

    // 8. Product ZIP & Batch ZIP Downloads
    console.log('\n--- 8. ZIP Archive Downloads ---');
    const pZipRes = await fetch(`${API_BASE}/products/${productId}/archive`);
    const pZipBuf = await pZipRes.arrayBuffer();
    const bZipRes = await fetch(`${API_BASE}/batches/${batchId}/archive`);
    const bZipBuf = await bZipRes.arrayBuffer();

    if (pZipRes.status === 200 && pZipBuf.byteLength > 500 && bZipRes.status === 200 && bZipBuf.byteLength > 500) {
      results.push({ test: 'ZIP Archive Downloads', status: 'PASS', details: `Product ZIP (${pZipBuf.byteLength} B) & Batch ZIP (${bZipBuf.byteLength} B) downloaded` });
      console.log('✅ PASS: ZIP Archive Downloads');
    } else {
      results.push({ test: 'ZIP Archive Downloads', status: 'FAIL', details: `PZip: ${pZipRes.status}, BZip: ${bZipRes.status}` });
      console.log('❌ FAIL: ZIP Archive Downloads');
    }

    // 9. Storage Usage View
    console.log('\n--- 9. Storage Usage View ---');
    const storageRes = await fetch(`${API_BASE}/storage/summary`);
    const storageData = await storageRes.json();
    if (storageRes.status === 200 && storageData.totalFiles >= 6) {
      results.push({ test: 'Storage Usage View', status: 'PASS', details: `Storage summary retrieved (${storageData.totalFiles} files, ${storageData.storageUsedGb} GB)` });
      console.log('✅ PASS: Storage Usage View');
    } else {
      results.push({ test: 'Storage Usage View', status: 'FAIL', details: `Status ${storageRes.status}` });
      console.log('❌ FAIL: Storage Usage View');
    }

    // 10. Deletion Safeguard 1: Active Batch Deletion Attempt
    console.log('\n--- 10. Safeguard: Active Batch Cannot Be Deleted ---');
    const activeDelRes = await fetch(`${API_BASE}/batches/${batchId}/approve-deletion`, { method: 'POST' });
    if (activeDelRes.status === 400) {
      results.push({ test: 'Safeguard: Block Active Batch Deletion', status: 'PASS', details: 'Rejected with HTTP 400 (batch must be closed)' });
      console.log('✅ PASS: Block Active Batch Deletion');
    } else {
      results.push({ test: 'Safeguard: Block Active Batch Deletion', status: 'FAIL', details: `Expected 400, got ${activeDelRes.status}` });
      console.log('❌ FAIL: Block Active Batch Deletion');
    }

    // 11. Close Batch
    console.log('\n--- 11. Close Batch ---');
    await fetch(`${API_BASE}/batches/${batchId}/close`, { method: 'POST' });

    // 12. Deletion Safeguard 2: Unbacked Batch Deletion Attempt
    console.log('\n--- 12. Safeguard: Unbacked Batch Cannot Be Deleted ---');
    const unbackedDelRes = await fetch(`${API_BASE}/batches/${batchId}/approve-deletion`, { method: 'POST' });
    if (unbackedDelRes.status === 400) {
      results.push({ test: 'Safeguard: Block Unbacked Batch Deletion', status: 'PASS', details: 'Rejected with HTTP 400 (backup must be confirmed)' });
      console.log('✅ PASS: Block Unbacked Batch Deletion');
    } else {
      results.push({ test: 'Safeguard: Block Unbacked Batch Deletion', status: 'FAIL', details: `Expected 400, got ${unbackedDelRes.status}` });
      console.log('❌ FAIL: Block Unbacked Batch Deletion');
    }

    // 13. Confirm External Hard Disk Backup
    console.log('\n--- 13. Confirm Physical Backup ---');
    const backupRes = await fetch(`${API_BASE}/batches/${batchId}/backup-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diskIdentifier: 'EXT-HDD-PLANT-01 (Seagate 4TB)',
        destinationPath: 'E:\\PlantBackups\\2026\\Batch-X',
        notes: 'Physical hard disk backup verified by factory terminal operator.',
      }),
    });
    const backupData = await backupRes.json();
    if (backupRes.status === 201 && backupData.status === 'confirmed') {
      results.push({ test: 'Physical Backup Confirmation', status: 'PASS', details: 'Backup registered and batch marked backup_confirmed' });
      console.log('✅ PASS: Physical Backup Confirmation');
    } else {
      results.push({ test: 'Physical Backup Confirmation', status: 'FAIL', details: `Status ${backupRes.status}` });
      console.log('❌ FAIL: Physical Backup Confirmation');
    }

    // 14. Terminal User Cloud Deletion (NO PASSCODE, NO ADMIN ROLE)
    console.log('\n--- 14. Terminal User Cloud Deletion (Direct Authorization) ---');
    const delRes = await fetch(`${API_BASE}/batches/${batchId}/approve-deletion`, {
      method: 'POST',
    });
    const delData = await delRes.json();
    console.log('Deletion result:', delData);
    if (delRes.status === 200 && delData.deleted === 7) { // 6 source files + 1 report
      results.push({ test: 'Terminal User Cloud Deletion', status: 'PASS', details: `Deleted ${delData.deleted} cloud files directly without administrator passcode` });
      console.log(`✅ PASS: Terminal User Cloud Deletion (${delData.deleted} files deleted)`);
    } else {
      results.push({ test: 'Terminal User Cloud Deletion', status: 'FAIL', details: `Status ${delRes.status}, deleted: ${delData?.deleted}` });
      console.log('❌ FAIL: Terminal User Cloud Deletion');
    }

    // 15. Audit Logs View
    console.log('\n--- 15. Audit Logs View ---');
    const auditRes = await fetch(`${API_BASE}/audit-logs`);
    const auditData = await auditRes.json();
    if (auditRes.status === 200 && Array.isArray(auditData.logs)) {
      results.push({ test: 'Audit Logs Accessibility', status: 'PASS', details: `Accessed audit log stream (${auditData.logs.length} logs recorded)` });
      console.log('✅ PASS: Audit Logs Accessibility');
    } else {
      results.push({ test: 'Audit Logs Accessibility', status: 'FAIL', details: `Status ${auditRes.status}` });
      console.log('❌ FAIL: Audit Logs Accessibility');
    }

  } catch (error: any) {
    console.error('Test execution error:', error.message);
    results.push({ test: 'Fatal Exception', status: 'FAIL', details: error.message });
  }

  console.log('\n========================================');
  console.log('SHARED FACTORY TERMINAL LIFECYCLE SUMMARY:');
  console.log('========================================');
  results.forEach(r => console.log(`${r.status === 'PASS' ? '✅' : '❌'} [${r.status}] ${r.test}: ${r.details}`));
  const allPassed = results.every(r => r.status === 'PASS');
  console.log(`\nOVERALL: ${allPassed ? 'ALL TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

runSharedTerminalLifecycleTest();

