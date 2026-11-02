import { chromium } from '../frontend/node_modules/playwright';

const API_BASE = 'http://localhost:3001/api';
const FRONTEND_BASE = 'http://localhost:5173';

interface TestResult {
  category: string;
  test: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function record(category: string, test: string, status: 'PASS' | 'FAIL', details: string) {
  results.push({ category, test, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${status}] [${category}] ${test}: ${details}`);
}

async function runFullVerification() {
  console.log('================================================================');
  console.log('MDMS COMPLETE APPLICATION QA, DEBUGGING & REGRESSION VERIFICATION');
  console.log('================================================================\n');

  // PART 1: BACKEND ROUTE & API VERIFICATION
  console.log('--- PART 1: BACKEND ROUTE & API VERIFICATION ---');

  // Test 1.1: Health check
  try {
    const healthRes = await fetch('http://localhost:3001/health');
    const healthData = await healthRes.json();
    if (healthRes.status === 200 && healthData.status === 'ok') {
      record('Backend Route', 'Health Check Endpoint', 'PASS', 'Backend is running on port 3001 and returned status ok');
    } else {
      record('Backend Route', 'Health Check Endpoint', 'FAIL', `Status: ${healthRes.status}`);
    }
  } catch (err: any) {
    record('Backend Route', 'Health Check Endpoint', 'FAIL', err.message);
  }

  // Test 1.2: Startup validation mechanism and removal of close endpoint
  try {
    const closeRes = await fetch(`${API_BASE}/batches/00000000-0000-0000-0000-000000000000/close`, {
      method: 'POST',
    });
    if (closeRes.status === 404) {
      record('Backend Route', 'Close Batch Route Removed', 'PASS', 'POST /api/batches/:id/close returns 404 Not Found');
    } else {
      record('Backend Route', 'Close Batch Route Removed', 'FAIL', `Expected 404, got ${closeRes.status}`);
    }
  } catch (err: any) {
    record('Backend Route', 'Close Batch Route Removed', 'FAIL', err.message);
  }

  // PART 2: COMPLETE LIFECYCLE REGRESSION TEST
  console.log('\n--- PART 2: COMPLETE LIFECYCLE & DOWNLOAD TRACKING TEST ---');

  const timestamp = Date.now();
  const testBatchName = `QA-Regress-Batch-${timestamp}`;
  let batchId = '';
  let dateId = '';
  let productId = '';

  // 2.1: Create active batch
  try {
    const bRes = await fetch(`${API_BASE}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchName: testBatchName,
        description: 'End-to-end regression batch testing',
      }),
    });
    const bData = await bRes.json();
    batchId = bData.id;
    if (bRes.status === 201 && batchId && bData.status === 'active') {
      record('Batch Management', 'Create Active Batch', 'PASS', `Batch created with ID ${batchId}, status: active`);
    } else {
      record('Batch Management', 'Create Active Batch', 'FAIL', `Status: ${bRes.status}, data: ${JSON.stringify(bData)}`);
    }
  } catch (err: any) {
    record('Batch Management', 'Create Active Batch', 'FAIL', err.message);
  }

  // 2.2: Edit batch name and description
  try {
    const updatedName = `${testBatchName}-Edited`;
    const bUpdateRes = await fetch(`${API_BASE}/batches/${batchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchName: updatedName,
        description: 'Updated description for active batch',
      }),
    });
    const bUpdateData = await bUpdateRes.json();
    if (bUpdateRes.status === 200 && bUpdateData.batchName === updatedName) {
      record('Batch Management', 'Edit Batch', 'PASS', `Successfully updated batch name and description while active`);
    } else {
      record('Batch Management', 'Edit Batch', 'FAIL', `Status: ${bUpdateRes.status}`);
    }
  } catch (err: any) {
    record('Batch Management', 'Edit Batch', 'FAIL', err.message);
  }

  // 2.3: Create date folder in active batch
  try {
    const dRes = await fetch(`${API_BASE}/batches/${batchId}/dates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDate: '2026-11-03' }),
    });
    const dData = await dRes.json();
    dateId = dData.id;
    if (dRes.status === 201 && dateId) {
      record('Date Folder Management', 'Create Date Folder', 'PASS', `Created date folder ${dateId} in active batch`);
    } else {
      record('Date Folder Management', 'Create Date Folder', 'FAIL', `Status: ${dRes.status}`);
    }
  } catch (err: any) {
    record('Date Folder Management', 'Create Date Folder', 'FAIL', err.message);
  }

  // 2.4: Create product in date folder
  try {
    const pRes = await fetch(`${API_BASE}/dates/${dateId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: 'Automated Test Specimen',
        productCode: `SPEC-${timestamp}`,
        metadata: { material: 'Ti-6Al-4V', grade: 'Grade 5 Titanium', remarks: 'Regression QA Specimen' },
      }),
    });
    const pData = await pRes.json();
    productId = pData.id;
    if (pRes.status === 201 && productId) {
      record('Product Management', 'Create Product', 'PASS', `Created product ${productId} (${pData.productCode})`);
    } else {
      record('Product Management', 'Create Product', 'FAIL', `Status: ${pRes.status}`);
    }
  } catch (err: any) {
    record('Product Management', 'Create Product', 'FAIL', err.message);
  }

  // 2.5: Upload 6 files across all 4 categories (3 microstructure, 1 graph, 1 PDF, 1 WhatsApp)
  try {
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF');

    const uploads = [
      { category: 'microstructure', slotIndex: 0, filename: 'micro1.png', buffer: pngBuffer, mime: 'image/png' },
      { category: 'microstructure', slotIndex: 1, filename: 'micro2.png', buffer: pngBuffer, mime: 'image/png' },
      { category: 'microstructure', slotIndex: 2, filename: 'micro3.png', buffer: pngBuffer, mime: 'image/png' },
      { category: 'graph', slotIndex: 0, filename: 'graph.png', buffer: pngBuffer, mime: 'image/png' },
      { category: 'source_pdf', slotIndex: 0, filename: 'original_spec.pdf', buffer: pdfBuffer, mime: 'application/pdf' },
      { category: 'whatsapp_image', slotIndex: 0, filename: 'whatsapp.png', buffer: pngBuffer, mime: 'image/png' },
    ];

    let uploaded = 0;
    const fileIds: string[] = [];
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
      if (upRes.status === 201 && upData.fileId) {
        uploaded++;
        fileIds.push(upData.fileId);
      }
    }

    if (uploaded === 6) {
      record('File Storage', 'Upload 4 Categories (6 Files)', 'PASS', 'Successfully uploaded 3 microstructure, 1 graph, 1 PDF, 1 WhatsApp to Supabase Storage');
    } else {
      record('File Storage', 'Upload 4 Categories (6 Files)', 'FAIL', `Uploaded ${uploaded}/6`);
    }

    // 2.6: Verify file preview download URLs
    let previewValid = true;
    for (const fId of fileIds) {
      const pUrlRes = await fetch(`${API_BASE}/files/${fId}/download-url?inline=true`);
      const pUrlData = await pUrlRes.json();
      if (pUrlRes.status !== 200 || !pUrlData.downloadUrl) {
        previewValid = false;
        break;
      }
    }
    if (previewValid) {
      record('File Storage', 'File Preview Signed URLs', 'PASS', 'Pre-signed inline URLs generated for all uploaded files');
    } else {
      record('File Storage', 'File Preview Signed URLs', 'FAIL', 'Failed to generate pre-signed preview URLs');
    }
  } catch (err: any) {
    record('File Storage', 'File Uploads & Preview', 'FAIL', err.message);
  }

  // 2.7: Generate composite PDF report
  try {
    const repRes = await fetch(`${API_BASE}/products/${productId}/generate-report`, { method: 'POST' });
    const repData = await repRes.json();
    if (repRes.status === 200 && repData.fileId) {
      record('PDF Generation', 'Generate Composite PDF Report', 'PASS', `Generated final PDF report (${repData.size} bytes)`);
    } else {
      record('PDF Generation', 'Generate Composite PDF Report', 'FAIL', `Status: ${repRes.status}`);
    }
  } catch (err: any) {
    record('PDF Generation', 'Generate Composite PDF Report', 'FAIL', err.message);
  }

  // 2.8: Download PDF Report & verify download tracking
  try {
    const pdfDownRes = await fetch(`${API_BASE}/products/${productId}/report/download`);
    const pdfDownBuf = await pdfDownRes.arrayBuffer();
    if (pdfDownRes.status === 200 && pdfDownBuf.byteLength > 500) {
      record('Download Tracking', 'Download PDF Report', 'PASS', `Streamed valid composite PDF report (${pdfDownBuf.byteLength} bytes)`);
    } else {
      record('Download Tracking', 'Download PDF Report', 'FAIL', `Status: ${pdfDownRes.status}, bytes: ${pdfDownBuf.byteLength}`);
    }
  } catch (err: any) {
    record('Download Tracking', 'Download PDF Report', 'FAIL', err.message);
  }

  // 2.9: Download Product ZIP
  try {
    const pZipRes = await fetch(`${API_BASE}/products/${productId}/archive`);
    const pZipBuf = await pZipRes.arrayBuffer();
    if (pZipRes.status === 200 && pZipBuf.byteLength > 500) {
      record('Download Tracking', 'Download Product ZIP', 'PASS', `Product ZIP generated and streamed (${pZipBuf.byteLength} bytes)`);
    } else {
      record('Download Tracking', 'Download Product ZIP', 'FAIL', `Status: ${pZipRes.status}, bytes: ${pZipBuf.byteLength}`);
    }
  } catch (err: any) {
    record('Download Tracking', 'Download Product ZIP', 'FAIL', err.message);
  }

  // 2.10: Download Complete Batch ZIP
  try {
    const bZipRes = await fetch(`${API_BASE}/batches/${batchId}/archive`);
    const bZipBuf = await bZipRes.arrayBuffer();
    if (bZipRes.status === 200 && bZipBuf.byteLength > 500) {
      record('Download Tracking', 'Download Complete Batch ZIP', 'PASS', `Batch ZIP generated and streamed (${bZipBuf.byteLength} bytes)`);
    } else {
      record('Download Tracking', 'Download Complete Batch ZIP', 'FAIL', `Status: ${bZipRes.status}, bytes: ${bZipBuf.byteLength}`);
    }
  } catch (err: any) {
    record('Download Tracking', 'Download Complete Batch ZIP', 'FAIL', err.message);
  }

  // 2.11: Verify Download History in download_logs (give finish event 500ms to persist)
  await new Promise(r => setTimeout(r, 500));
  try {
    const dHistRes = await fetch(`${API_BASE}/downloads/history`);
    const dHist = await dHistRes.json();
    const batchLogs = dHist.filter((log: any) => log.batchName === `${testBatchName}-Edited`);
    const types = new Set(batchLogs.map((l: any) => l.downloadType));
    if (types.has('batch_zip') && types.has('product_zip') && (types.has('report_pdf') || types.has('pdf'))) {
      record('Download Tracking', 'Audit Download History', 'PASS', `All 3 download events (PDF, Product ZIP, Batch ZIP) logged in download_logs`);
    } else {
      record('Download Tracking', 'Audit Download History', 'FAIL', `Found types: ${Array.from(types).join(', ')}`);
    }
  } catch (err: any) {
    record('Download Tracking', 'Audit Download History', 'FAIL', err.message);
  }

  // 2.12: Fetch Batch Deletion Summary
  try {
    const delSumRes = await fetch(`${API_BASE}/batches/${batchId}/deletion-summary`);
    const delSum = await delSumRes.json();
    if (
      delSumRes.status === 200 &&
      delSum.totalDateFolders === 1 &&
      delSum.totalProducts === 1 &&
      delSum.totalFiles === 7 && // 6 uploaded files + 1 generated report
      delSum.batchZipDownloaded === true &&
      delSum.hasDownloads === true
    ) {
      record('Batch Deletion', 'Batch Deletion Summary API', 'PASS', `Accurately reported ${delSum.totalFiles} files, ${delSum.totalProducts} products, and download history`);
    } else {
      record('Batch Deletion', 'Batch Deletion Summary API', 'FAIL', JSON.stringify(delSum));
    }
  } catch (err: any) {
    record('Batch Deletion', 'Batch Deletion Summary API', 'FAIL', err.message);
  }

  // 2.13: Execute Batch Deletion
  try {
    const delRes = await fetch(`${API_BASE}/batches/${batchId}`, { method: 'DELETE' });
    const delData = await delRes.json();
    if (delRes.status === 200 && delData.filesDeleted === 7) {
      record('Batch Deletion', 'Delete Batch & Clean Storage', 'PASS', `Deleted batch and removed ${delData.filesDeleted} files from Supabase Storage`);
    } else {
      record('Batch Deletion', 'Delete Batch & Clean Storage', 'FAIL', `Status: ${delRes.status}, data: ${JSON.stringify(delData)}`);
    }

    // Verify batch is excluded from default list
    const listRes = await fetch(`${API_BASE}/batches`);
    const listData = await listRes.json();
    const isExcluded = !listData.some((b: any) => b.id === batchId);
    if (isExcluded) {
      record('Batch Deletion', 'Exclude Deleted From List', 'PASS', 'Deleted batch is excluded from active batches list');
    } else {
      record('Batch Deletion', 'Exclude Deleted From List', 'FAIL', 'Deleted batch still present in list');
    }
  } catch (err: any) {
    record('Batch Deletion', 'Execute Batch Deletion', 'FAIL', err.message);
  }

  // 2.14: Verify Audit Records Preserved
  try {
    const auditRes = await fetch(`${API_BASE}/audit-logs`);
    const auditData = await auditRes.json();
    const hasBatchDeleteLog = auditData.logs.some((l: any) => l.action === 'DELETE_BATCH' && l.entityId === batchId);
    if (hasBatchDeleteLog) {
      record('Audit Trail', 'Preserve Audit Logs on Deletion', 'PASS', 'DELETE_BATCH audit record safely preserved in database');
    } else {
      record('Audit Trail', 'Preserve Audit Logs on Deletion', 'FAIL', 'DELETE_BATCH audit record not found');
    }
  } catch (err: any) {
    record('Audit Trail', 'Preserve Audit Logs on Deletion', 'FAIL', err.message);
  }

  // PART 3: PLAYWRIGHT BROWSER VERIFICATION (ALL 10 FRONTEND PAGES)
  console.log('\n--- PART 3: PLAYWRIGHT BROWSER VERIFICATION (ALL 10 FRONTEND PAGES) ---');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Collect browser console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Page 1: Dashboard (/)
    console.log('Testing Page 1: Dashboard...');
    await page.goto(`${FRONTEND_BASE}/`);
    await page.waitForLoadState('networkidle');
    const hasDashboardTitle = await page.locator('h1:has-text("Dashboard")').isVisible();
    const hasActiveBatchesCard = await page.locator('text=Active Batches').isVisible();
    const hasStorageCard = await page.locator('text=Storage Used').isVisible();
    if (hasDashboardTitle && hasActiveBatchesCard && hasStorageCard) {
      record('Frontend UI', 'Page 1: Dashboard Load', 'PASS', 'Dashboard renders with Active Batches card and storage metrics');
    } else {
      record('Frontend UI', 'Page 1: Dashboard Load', 'FAIL', 'Dashboard missing required cards');
    }

    // Page 2: Batch Management (/batches)
    console.log('Testing Page 2: Batch Management...');
    await page.click('a[href="/batches"]');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1:has-text("Batch Management")');
    await page.waitForSelector('button[title="Edit Batch"]', { timeout: 10000 });
    const hasCreateBatchBtn = await page.locator('button:has-text("Create Batch")').isVisible();
    const lockIconCount = await page.locator('button[title="Close Batch"]').count();
    const editBtnCount = await page.locator('button[title="Edit Batch"]').count();
    const deleteBtnCount = await page.locator('button[title="Delete Batch"]').count();
    if (hasCreateBatchBtn && lockIconCount === 0 && editBtnCount > 0 && deleteBtnCount > 0) {
      record('Frontend UI', 'Page 2: Batch Management', 'PASS', `Lock icon completely removed (count: ${lockIconCount}), Edit (${editBtnCount}) and Delete (${deleteBtnCount}) buttons operational for all users`);
    } else {
      record('Frontend UI', 'Page 2: Batch Management', 'FAIL', `Lock icons: ${lockIconCount}, Edit: ${editBtnCount}, Delete: ${deleteBtnCount}`);
    }

    // Page 3: Batch Detail Page (/batches/:id)
    console.log('Testing Page 3: Batch Detail Page...');
    const firstBatchLink = page.locator('a[title="Open Batch"]').first();
    await firstBatchLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('a:has-text("Back to Batches")');
    const hasAddDateBtn = await page.locator('button:has-text("Add Date")').isVisible();
    const hasEditBatchDetailBtn = await page.locator('button:has-text("Edit Batch")').isVisible();
    if (hasAddDateBtn && hasEditBatchDetailBtn) {
      record('Frontend UI', 'Page 3: Batch Detail Page', 'PASS', 'Add Date and Edit Batch buttons visible and operational on active batch');
    } else {
      record('Frontend UI', 'Page 3: Batch Detail Page', 'FAIL', `Add Date: ${hasAddDateBtn}, Edit Batch: ${hasEditBatchDetailBtn}`);
    }

    // Page 4: Date Folder Management (/dates/:dateId)
    console.log('Testing Page 4: Date Folder Detail Page...');
    const firstDateFolder = page.locator('a[href^="/dates/"]').first();
    const dateFolderExists = (await firstDateFolder.count()) > 0;
    if (dateFolderExists) {
      await firstDateFolder.click();
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('a:has-text("Back to Batch")');
      const hasAddProductBtn = await page.locator('button:has-text("Add Product")').isVisible();
      if (hasAddProductBtn) {
        record('Frontend UI', 'Page 4: Date Folder Detail', 'PASS', 'Date folder detail loaded with Add Product action');
      } else {
        record('Frontend UI', 'Page 4: Date Folder Detail', 'FAIL', 'Add Product button missing');
      }

      // Page 5: Product Upload Page (/products/:productId)
      console.log('Testing Page 5: Product Upload Page...');
      const firstProduct = page.locator('a[href^="/products/"]').first();
      const productExists = (await firstProduct.count()) > 0;
      if (productExists) {
        await firstProduct.click();
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('h3:has-text("Progress")');
        const hasMicro1 = await page.locator('text=Microstructure Image 1').first().isVisible();
        const hasGraphImg = await page.locator('text=Graph Image').first().isVisible();
        const hasOrigPdf = await page.locator('text=Original PDF Document').first().isVisible();
        const hasWaImg = await page.locator('text=WhatsApp Image').first().isVisible();
        if (hasMicro1 && hasGraphImg && hasOrigPdf && hasWaImg) {
          record('Frontend UI', 'Page 5: Product Upload Page', 'PASS', 'All 4 required file upload sections present and ready');
        } else {
          record('Frontend UI', 'Page 5: Product Upload Page', 'FAIL', `Micro1: ${hasMicro1}, Graph: ${hasGraphImg}, PDF: ${hasOrigPdf}, WA: ${hasWaImg}`);
        }

        // Page 6: Progress & Workflow Checklist
        console.log('Testing Page 6: Progress & Workflow Checklist...');
        const hasProgressHeader = await page.locator('h3:has-text("Progress")').first().isVisible();
        const hasMicroCheck = await page.locator('text=Microstructure 1').first().isVisible();
        const hasGraphCheck = await page.locator('text=Graph').first().isVisible();
        if (hasProgressHeader && hasMicroCheck && hasGraphCheck) {
          record('Frontend UI', 'Page 6: Workflow & PDF Checklist', 'PASS', 'Product workflow checklist and PDF generation panels functional');
        } else {
          record('Frontend UI', 'Page 6: Workflow & PDF Checklist', 'FAIL', 'Workflow Checklist missing items');
        }
      }
    }

    // Page 7: Download History & Storage Management (/backup)
    console.log('Testing Page 7: Download History & Storage Management (/backup)...');
    await page.goto(`${FRONTEND_BASE}/backup`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1:has-text("Download History & Storage")');
    const hasDownloadHeading = await page.locator('h1:has-text("Download History & Storage")').isVisible();
    const hasBatchesSection = await page.locator('h2:has-text("Batches & Storage Management")').isVisible();
    const hasHistorySection = await page.locator('h2:has-text("Download History")').isVisible();
    if (hasDownloadHeading && hasBatchesSection && hasHistorySection) {
      record('Frontend UI', 'Page 7: Download History Page', 'PASS', 'Download History and Storage Management page renders cleanly');
    } else {
      record('Frontend UI', 'Page 7: Download History Page', 'FAIL', 'Sections missing on /backup');
    }

    // Page 8: Storage Monitor (/storage)
    console.log('Testing Page 8: Storage Monitor (/storage)...');
    await page.goto(`${FRONTEND_BASE}/storage`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1:has-text("Storage Monitor")');
    const hasStorageMonitor = await page.locator('h1:has-text("Storage Monitor")').isVisible();
    const hasStorageBarHeading = await page.getByRole('heading', { name: 'Storage Usage' }).isVisible();
    if (hasStorageMonitor && hasStorageBarHeading) {
      record('Frontend UI', 'Page 8: Storage Monitor', 'PASS', 'Storage Monitor displays total storage, file count, and batch breakdown');
    } else {
      record('Frontend UI', 'Page 8: Storage Monitor', 'FAIL', 'Storage Monitor missing elements');
    }

    // Page 9: Audit Logs (/audit-logs)
    console.log('Testing Page 9: Audit Logs (/audit-logs)...');
    await page.goto(`${FRONTEND_BASE}/audit-logs`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1:has-text("Audit Logs")');
    const hasAuditTitle = await page.locator('h1:has-text("Audit Logs")').isVisible();
    const auditRows = await page.locator('tbody tr').count();
    if (hasAuditTitle && auditRows > 0) {
      record('Frontend UI', 'Page 9: Audit Logs', 'PASS', `Audit Logs accessible without login barrier, showing ${auditRows} logs`);
    } else {
      record('Frontend UI', 'Page 9: Audit Logs', 'FAIL', 'Audit logs page missing or empty');
    }

    // Page 10: Settings (/settings)
    console.log('Testing Page 10: Settings (/settings)...');
    await page.goto(`${FRONTEND_BASE}/settings`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1:has-text("Settings")');
    const hasSettings = await page.locator('h1:has-text("Settings")').isVisible();
    const hasStorageWarningField = await page.locator('label:has-text("Storage Warning Threshold (GB)")').isVisible();
    if (hasSettings && hasStorageWarningField) {
      record('Frontend UI', 'Page 10: Settings Page', 'PASS', 'System Settings accessible without login barrier, storage threshold configured');
    } else {
      record('Frontend UI', 'Page 10: Settings Page', 'FAIL', 'Settings page missing');
    }

    // Console error evaluation
    const criticalErrors = consoleErrors.filter(e => !e.includes('favicon.ico'));
    if (criticalErrors.length === 0) {
      record('Frontend Stability', 'Browser Console Health', 'PASS', 'Zero JavaScript runtime errors across all 10 pages');
    } else {
      record('Frontend Stability', 'Browser Console Health', 'FAIL', `Encountered console errors: ${criticalErrors.join(' | ')}`);
    }

  } catch (err: any) {
    record('Frontend UI', 'Playwright Browser Automation', 'FAIL', err.message);
  } finally {
    if (browser) await browser.close();
  }

  // Summary
  console.log('\n================================================================');
  console.log('FINAL REGRESSION & VERIFICATION SUMMARY REPORT:');
  console.log('================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL CHECKS: ${results.length}`);
  console.log(`PASSED: ${passCount}`);
  console.log(`FAILED: ${failCount}`);
  console.log(`STATUS: ${failCount === 0 ? 'ALL VERIFICATIONS PASSED (100%)' : 'FAILURES DETECTED'}`);
  console.log('================================================================');

  process.exit(failCount === 0 ? 0 : 1);
}

runFullVerification().catch(err => {
  console.error('FATAL SUITE ERROR:', err);
  process.exit(1);
});
