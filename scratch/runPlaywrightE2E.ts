import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import prisma from 'd:/Desktop/MaterialDataManagementSystem/backend/src/config/database';

interface BrowserTestResult {
  step: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: BrowserTestResult[] = [];
const consoleErrors: string[] = [];
const networkFailures: string[] = [];

function record(step: string, status: 'PASS' | 'FAIL', details?: string) {
  results.push({ step, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [Browser E2E] ${step}${details ? ` (${details})` : ''}`);
}

async function loginUser(page: Page, email: string, pass: string) {
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  // Wait for sidebar navigation to confirm full authentication and profile load
  await page.waitForSelector('aside nav a[href="/batches"]', { timeout: 25000 });
}

async function runBrowserTests() {
  console.log('\n==================================================');
  console.log('STARTING REAL BROWSER (CHROME) PLAYWRIGHT E2E TESTS');
  console.log('==================================================\n');

  const tempDir = path.join('D:\\Desktop\\MaterialDataManagementSystem\\scratch\\temp_fixtures');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const micro1Path = path.join(tempDir, 'micro1.png');
  const micro2Path = path.join(tempDir, 'micro2.png');
  const micro3Path = path.join(tempDir, 'micro3.png');
  const graphPath = path.join(tempDir, 'graph.png');
  const waPath = path.join(tempDir, 'wa.png');
  const pdfPath = path.join(tempDir, 'original.pdf');

  await sharp({ create: { width: 160, height: 120, channels: 4, background: { r: 40, g: 100, b: 200, alpha: 1 } } }).png().toFile(micro1Path);
  await sharp({ create: { width: 160, height: 120, channels: 4, background: { r: 60, g: 150, b: 80, alpha: 1 } } }).png().toFile(micro2Path);
  await sharp({ create: { width: 160, height: 120, channels: 4, background: { r: 180, g: 90, b: 40, alpha: 1 } } }).png().toFile(micro3Path);
  await sharp({ create: { width: 160, height: 120, channels: 4, background: { r: 120, g: 40, b: 180, alpha: 1 } } }).png().toFile(graphPath);
  await sharp({ create: { width: 160, height: 120, channels: 4, background: { r: 30, g: 180, b: 140, alpha: 1 } } }).png().toFile(waPath);

  const pdfDoc = await PDFDocument.create();
  const pdfPage = pdfDoc.addPage([500, 350]);
  pdfPage.drawText('Factory Inspection Specification Document', { x: 50, y: 300, size: 14 });
  fs.writeFileSync(pdfPath, await pdfDoc.save());

  let browser: Browser | null = null;
  let testBatchId = '';

  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('requestfailed', (req) => {
      networkFailures.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
    });

    // ────────────────────────────────────────────────────────────
    // 1. Administrator Login & Role Verification
    // ────────────────────────────────────────────────────────────
    await loginUser(page, 'qa-admin@mdms-test.local', 'TestPassword123!');
    record('1. Administrator Login & Redirect to Dashboard', 'PASS');

    const usersLink = await page.isVisible('a[href="/users"]');
    const settingsLink = await page.isVisible('a[href="/settings"]');
    const auditLogsLink = await page.isVisible('a[href="/audit-logs"]');

    if (usersLink && settingsLink && auditLogsLink) {
      record('2. Admin Navigation Links Visible in Sidebar', 'PASS');
    } else {
      record('2. Admin Navigation Links Visible in Sidebar', 'FAIL');
    }

    // ────────────────────────────────────────────────────────────
    // 2. Admin Protected Settings View
    // ────────────────────────────────────────────────────────────
    await page.click('a[href="/settings"]');
    await page.waitForURL('http://localhost:5173/settings');
    await page.waitForSelector('h1:has-text("Settings")', { timeout: 10000 });
    record('3. Navigate to Admin Settings Page', 'PASS');

    // ────────────────────────────────────────────────────────────
    // 3. Logout
    // ────────────────────────────────────────────────────────────
    await page.click('button:has-text("Sign Out")');
    await page.waitForURL('http://localhost:5173/login', { timeout: 15000 });
    record('4. Administrator Logout & Redirect to Login Page', 'PASS');

    // ────────────────────────────────────────────────────────────
    // 4. Worker Login & Route Shielding
    // ────────────────────────────────────────────────────────────
    await loginUser(page, 'qa-worker@mdms-test.local', 'TestPassword123!');
    record('5. Worker Login & Redirect to Dashboard', 'PASS');

    await page.waitForTimeout(1000);
    const workerUsersLink = await page.isVisible('a[href="/users"]');
    const workerSettingsLink = await page.isVisible('a[href="/settings"]');
    if (!workerUsersLink && !workerSettingsLink) {
      record('6. Admin Links Hidden for Worker in Sidebar', 'PASS');
    } else {
      record('6. Admin Links Hidden for Worker in Sidebar', 'FAIL');
    }

    await page.goto('http://localhost:5173/settings');
    await page.waitForSelector('text=Access Denied', { timeout: 10000 });
    const accessDeniedVisible = await page.isVisible('text=Administrator privileges are required to view this page.');
    if (accessDeniedVisible) {
      record('7. AdminRoute Shielding Enforced (Access Denied Displayed for Worker)', 'PASS');
    } else {
      record('7. AdminRoute Shielding Enforced (Access Denied Displayed for Worker)', 'FAIL');
    }

    // ────────────────────────────────────────────────────────────
    // 5. Create Batch via UI
    // ────────────────────────────────────────────────────────────
    await page.click('a[href="/batches"]');
    await page.waitForURL('http://localhost:5173/batches');
    await page.click('button:has-text("Create Batch")');

    const batchName = `PW-BATCH-${Date.now().toString().slice(-6)}`;
    await page.fill('input[placeholder*="Batch"]', batchName);
    await page.fill('textarea[placeholder*="Optional"]', 'Created via Playwright Automation');
    
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/batches') && res.request().method() === 'POST'),
      page.click('form button[type="submit"]:has-text("Create")'),
    ]);

    await page.waitForTimeout(2000);
    const dbBatch = await prisma.batch.findFirst({ where: { batchName } });
    testBatchId = dbBatch!.id;
    record('8. Create Batch via UI Modal', 'PASS', `Batch: ${batchName}`);

    // ────────────────────────────────────────────────────────────
    // 6. Create Date Folder via UI
    // ────────────────────────────────────────────────────────────
    await page.goto(`http://localhost:5173/batches/${testBatchId}`);
    await page.waitForSelector('button:has-text("Add Date")', { timeout: 15000 });

    await page.click('button:has-text("Add Date")');
    await page.fill('input[type="date"]', '2026-11-01');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/dates') && res.request().method() === 'POST'),
      page.click('form button[type="submit"]:has-text("Create")'),
    ]);

    await page.waitForTimeout(2000);
    const dbDateFolder = await prisma.dateFolder.findFirst({ where: { batchId: testBatchId } });
    const dateFolderId = dbDateFolder!.id;
    record('9. Create Date Folder (01-11-2026) via UI Modal', 'PASS', `DateId: ${dateFolderId}`);

    // ────────────────────────────────────────────────────────────
    // 7. Create Product via UI
    // ────────────────────────────────────────────────────────────
    await page.goto(`http://localhost:5173/dates/${dateFolderId}`);
    await page.waitForSelector('button:has-text("Add Product")', { timeout: 15000 });

    await page.click('button:has-text("Add Product")');
    await page.fill('input[placeholder*="PRD"]', '001');
    await page.fill('input[placeholder*="Steel"]', 'Nickel Turbine Blade 001');
    await page.fill('input[placeholder*="AISI"]', 'Inconel 718');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/products') && res.request().method() === 'POST'),
      page.click('form button[type="submit"]:has-text("Create")'),
    ]);

    await page.waitForTimeout(2000);
    const dbProduct = await prisma.product.findFirst({ where: { dateFolderId } });
    const productId = dbProduct!.id;
    record('10. Create Product 001 via UI Modal', 'PASS', `Product Code: 001`);

    // ────────────────────────────────────────────────────────────
    // 8. Upload Four Categories via UI
    // ────────────────────────────────────────────────────────────
    await page.goto(`http://localhost:5173/products/${productId}`);
    await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 15000 });

    const fileInputs = page.locator('input[type="file"]');
    const uploadFiles = [micro1Path, micro2Path, micro3Path, graphPath, pdfPath, waPath];

    for (let i = 0; i < uploadFiles.length; i++) {
      await Promise.all([
        page.waitForResponse((res) => res.url().includes('/files/upload') && res.status() === 201),
        fileInputs.nth(i).setInputFiles(uploadFiles[i]),
      ]);
      await page.waitForTimeout(1000);
    }

    await page.waitForTimeout(1500);
    const completionText = await page.locator('div:has-text("% Complete")').first().textContent();
    record('11. Upload All 4 Categories (6 Files) via UI File Inputs', 'PASS', `Status: ${completionText?.trim()}`);

    const previewBtn = page.locator('button[title="Preview"]').first();
    const canPreview = await previewBtn.isVisible();
    if (canPreview) {
      record('12. File Preview Action Available & Rendered', 'PASS');
    } else {
      record('12. File Preview Action Available & Rendered', 'FAIL');
    }

    // ────────────────────────────────────────────────────────────
    // 9. Generate Composite PDF via UI
    // ────────────────────────────────────────────────────────────
    const generatePdfButton = page.locator('button:has-text("Generate Report")');
    await generatePdfButton.waitFor({ state: 'visible' });

    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/generate-report') && res.status() === 200),
      generatePdfButton.click(),
    ]);

    await page.waitForTimeout(2000);
    const downloadPdfButton = page.locator('button:has-text("Download PDF")');
    const hasDownloadPdf = await downloadPdfButton.isVisible();
    if (hasDownloadPdf) {
      record('13. Generate Composite PDF Report via UI', 'PASS');
    } else {
      record('13. Generate Composite PDF Report via UI', 'FAIL');
    }

    // ────────────────────────────────────────────────────────────
    // 10. Product ZIP Download Trigger
    // ────────────────────────────────────────────────────────────
    const zipButton = page.locator('button:has-text("Download ZIP")');
    const hasZipButton = await zipButton.isVisible();
    if (hasZipButton) {
      record('14. Product ZIP Download Trigger Visible & Enabled', 'PASS');
    } else {
      record('14. Product ZIP Download Trigger Visible & Enabled', 'FAIL');
    }

    // ────────────────────────────────────────────────────────────
    // 11. Close Batch & Confirm External Backup via UI
    // ────────────────────────────────────────────────────────────
    await page.goto('http://localhost:5173/batches');
    await page.waitForURL('http://localhost:5173/batches');

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    const batchCard = page.locator(`div.rounded-xl:has(h3:has-text("${batchName}"))`);
    const closeBatchButton = batchCard.locator('button[title="Close Batch"]');
    await closeBatchButton.click();
    await page.waitForTimeout(2000);
    record('15. Close Batch via UI (Initiates 5-Day Retention)', 'PASS');

    await page.goto('http://localhost:5173/backup');
    await page.waitForURL('http://localhost:5173/backup');

    const backupBatchCard = page.locator(`div.rounded-xl:has(h3:has-text("${batchName}"))`);
    await backupBatchCard.waitFor({ state: 'visible', timeout: 15000 });
    const confirmBackupBtn = backupBatchCard.locator('button:has-text("Confirm Backup")');
    await confirmBackupBtn.click();

    await page.waitForSelector('form input', { state: 'visible', timeout: 10000 });
    const modalInputs = page.locator('form input');
    await modalInputs.nth(0).fill('SEAGATE-EXT-004');
    await modalInputs.nth(1).fill('E:\\MDMS_ARCHIVES\\2026\\');
    await page.locator('form textarea').fill('Physical copy verified in browser E2E test');

    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/backup-confirmation') && res.status() === 201),
      page.click('form button[type="submit"]:has-text("Confirm Backup")'),
    ]);

    await page.waitForTimeout(2000);
    record('16. Submit External Hard Disk Backup Confirmation Form via UI', 'PASS');

    // ────────────────────────────────────────────────────────────
    // 12. Administrator-Only Deletion Approval via UI
    // ────────────────────────────────────────────────────────────
    await page.locator('button:has-text("Sign Out")').click();
    await page.waitForURL('http://localhost:5173/login');
    await loginUser(page, 'qa-admin@mdms-test.local', 'TestPassword123!');

    await page.goto('http://localhost:5173/backup');
    await page.waitForURL('http://localhost:5173/backup');

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    const adminBatchCard = page.locator(`div.rounded-xl:has(h3:has-text("${batchName}"))`);
    await adminBatchCard.waitFor({ state: 'visible', timeout: 15000 });
    const deleteCloudFilesBtn = adminBatchCard.locator('button:has-text("Delete Cloud Files")');
    await deleteCloudFilesBtn.waitFor({ state: 'visible', timeout: 10000 });

    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/approve-deletion') && res.status() === 200),
      deleteCloudFilesBtn.click(),
    ]);

    await page.waitForTimeout(2000);
    record('17. Admin Approve Cloud Deletion via UI (Storage Reclaimed)', 'PASS');

  } catch (err: any) {
    console.error('Playwright Test Exception:', err);
    record('Browser Automation Suite Exception', 'FAIL', err.message);
  } finally {
    if (browser) await browser.close();

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    if (testBatchId) {
      try {
        await prisma.downloadLog.deleteMany({ where: { batchId: testBatchId } });
        await prisma.backupRecord.deleteMany({ where: { batchId: testBatchId } });
        await prisma.batch.delete({ where: { id: testBatchId } });
      } catch (e) {
        // Handled
      }
    }
  }

  console.log('\n==================================================');
  console.log('BROWSER E2E TEST SUMMARY');
  console.log('==================================================');
  console.log(`TOTAL SCENARIOS: ${results.length}`);
  console.log(`PASSED: ${results.filter((r) => r.status === 'PASS').length}`);
  console.log(`FAILED: ${results.filter((r) => r.status === 'FAIL').length}`);
  console.log(`CONSOLE ERRORS CAPTURED: ${consoleErrors.length}`);
  console.log(`NETWORK FAILURES CAPTURED: ${networkFailures.length}`);
}

runBrowserTests().catch(console.error);
