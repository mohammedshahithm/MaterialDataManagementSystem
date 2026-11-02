import { chromium } from '../frontend/node_modules/playwright';
import { PrismaClient } from '../backend/node_modules/@prisma/client';
import { subDays, addDays } from 'date-fns';
import { evaluateBatchRetention, calculateBatchLastActivity } from '../backend/src/services/retentionService';
import { runRetentionCheck } from '../backend/src/jobs/retentionJob';

const prisma = new PrismaClient();
const BACKEND_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:5173';

async function main() {
  console.log('====================================================');
  console.log('MDMS RETENTION FUNCTIONALITY VERIFICATION SUITE');
  console.log('====================================================\n');

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      testPassed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      testFailed++;
    }
  }

  // Find or create default user
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

  const timestamp = Date.now();
  const testBatchName = `Retention-Active-Test-${timestamp}`;
  const inactiveBatchName = `Retention-Inactive-Test-${timestamp}`;

  let activeBatchId = '';
  let inactiveBatchId = '';

  try {
    // ----------------------------------------------------
    // CHECK 1: Settings API & UI Description Verification
    // ----------------------------------------------------
    console.log('\n--- 1. Testing Retention Settings & UI Description ---');
    const settingsRes = await fetch(`${BACKEND_URL}/api/admin/retention-settings`);
    const settingsData = await settingsRes.json();
    assert(settingsRes.status === 200, 'Settings API is accessible');
    assert(settingsData.retentionDays === 5, 'Default retention period is 5 days', `Got ${settingsData.retentionDays}`);

    // Browser check for Settings description
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();

    await page.goto(`${FRONTEND_URL}/settings`, { waitUntil: 'networkidle' });
    const settingsText = await page.textContent('body');
    const hasExpectedDesc = settingsText?.includes('Days of inactivity before a batch becomes eligible for deletion.');
    assert(Boolean(hasExpectedDesc), 'Settings page displays exact description: "Days of inactivity before a batch becomes eligible for deletion."');

    // ----------------------------------------------------
    // CHECK 2: Absence of Close Batch Functionality
    // ----------------------------------------------------
    console.log('\n--- 2. Verifying Absence of Close Batch Functionality ---');
    await page.goto(`${FRONTEND_URL}/batches`, { waitUntil: 'networkidle' });
    const lockIcons = await page.locator('svg.lucide-lock').count();
    assert(lockIcons === 0, 'No lock icons present on batch cards');

    // ----------------------------------------------------
    // CHECK 3: Active Batch Creation & Activity Advancement
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Active Batch Creation & Last Activity Tracking ---');
    const createRes = await fetch(`${BACKEND_URL}/api/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchName: testBatchName,
        description: 'Test batch for verifying retention calculations',
      }),
    });
    const createdBatch = await createRes.json();
    activeBatchId = createdBatch.id;
    assert(createRes.status === 201 && Boolean(createdBatch.id), 'Active batch created successfully');

    // Fetch batch detail from API to check initial lastActivityAt
    let getBatchRes = await fetch(`${BACKEND_URL}/api/batches/${activeBatchId}`);
    let batchDetail = await getBatchRes.json();
    assert(Boolean(batchDetail.lastActivityAt), 'API returns lastActivityAt for batch');
    assert(batchDetail.isEligibleForDeletion === false, 'Newly created batch is NOT eligible for deletion');
    assert(batchDetail.inactivityDays === 0, 'Newly created batch inactivityDays is 0');
    assert(batchDetail.retentionDays === 5, 'Batch detail reports 5 retentionDays');

    // Create a date folder
    const dateRes = await fetch(`${BACKEND_URL}/api/batches/${activeBatchId}/dates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDate: '2026-11-02' }),
    });
    const dateFolder = await dateRes.json();
    assert(dateRes.status === 201, 'Date folder created in batch');

    // Create a product
    const productRes = await fetch(`${BACKEND_URL}/api/dates/${dateFolder.id}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: `PRD-${timestamp}`, productName: 'Test Material Sample' }),
    });
    const product = await productRes.json();
    assert(productRes.status === 201, 'Product created in date folder');

    // Verify lastActivityAt reflects the new activity
    getBatchRes = await fetch(`${BACKEND_URL}/api/batches/${activeBatchId}`);
    batchDetail = await getBatchRes.json();
    assert(new Date(batchDetail.lastActivityAt).getTime() >= new Date(dateFolder.createdAt).getTime(), 'lastActivityAt advanced after product/date creation');
    assert(batchDetail.isEligibleForDeletion === false, 'Batch with current activity remains NOT eligible for deletion');

    // ----------------------------------------------------
    // CHECK 4: Inactive Batch (5+ days) Marked as Eligible for Deletion
    // ----------------------------------------------------
    console.log('\n--- 4. Testing 5+ Days Inactive Batch Eligibility & Expiry Warning ---');
    // Create a batch with creation date 6 days ago in DB
    const sixDaysAgo = subDays(new Date(), 6);
    const inactiveBatch = await prisma.batch.create({
      data: {
        batchName: inactiveBatchName,
        description: 'Batch simulating 6 days of inactivity',
        createdById: user.id,
        createdAt: sixDaysAgo,
        status: 'active',
      },
    });
    inactiveBatchId = inactiveBatch.id;

    // Create an old date folder and product 6 days ago
    const oldDateFolder = await prisma.dateFolder.create({
      data: {
        batchId: inactiveBatchId,
        workDate: sixDaysAgo,
        createdById: user.id,
        createdAt: sixDaysAgo,
      },
    });
    const oldProduct = await prisma.product.create({
      data: {
        dateFolderId: oldDateFolder.id,
        productCode: `INACT-${timestamp}`,
        productName: 'Old Product Sample',
        createdById: user.id,
        createdAt: sixDaysAgo,
        updatedAt: sixDaysAgo,
      },
    });

    // Query batch from API
    const getInactiveRes = await fetch(`${BACKEND_URL}/api/batches/${inactiveBatchId}`);
    const inactiveDetail = await getInactiveRes.json();
    assert(inactiveDetail.isEligibleForDeletion === true, 'Batch inactive for 6 days is marked as eligible for deletion');
    assert(inactiveDetail.inactivityDays >= 5, `Inactivity days correctly calculated (>= 5, got ${inactiveDetail.inactivityDays})`);

    // ----------------------------------------------------
    // CHECK 5: UI Expiry Warning in Batch Management
    // ----------------------------------------------------
    console.log('\n--- 5. Testing Expiry Warning Display in Frontend UI ---');
    // Navigate to BatchesPage
    await page.goto(`${FRONTEND_URL}/batches`, { waitUntil: 'networkidle' });
    await page.waitForSelector(`text=${inactiveBatchName}`, { timeout: 10000 });

    const bannerExists = await page.locator('text=Batch Inactivity Expiry Warning').isVisible();
    assert(bannerExists, 'Expiry warning banner is displayed at top of Batch Management');

    const cardBadgeExists = await page.locator('text=ELIGIBLE FOR DELETION').first().isVisible();
    assert(cardBadgeExists, 'Expiry warning badge displayed on inactive batch card');

    // Navigate to BatchDetailPage of the inactive batch
    await page.goto(`${FRONTEND_URL}/batches/${inactiveBatchId}`, { waitUntil: 'networkidle' });
    const detailWarningExists = await page.locator('text=Inactivity Notice: Batch Eligible for Deletion').isVisible();
    assert(detailWarningExists, 'Inactivity expiry warning banner displayed on Batch Detail page');

    // ----------------------------------------------------
    // CHECK 6: Active Batches Do NOT Expire While Workers Use Them
    // ----------------------------------------------------
    console.log('\n--- 6. Verifying Active Batches Do NOT Expire While in Use ---');
    // In our inactive batch, let a worker create a new product today
    const resumeRes = await fetch(`${BACKEND_URL}/api/dates/${oldDateFolder.id}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: `ACTIVE-NOW-${timestamp}`, productName: 'Fresh Active Product' }),
    });
    assert(resumeRes.status === 201, 'Worker created fresh product in batch');

    // Check batch detail again
    const refreshedRes = await fetch(`${BACKEND_URL}/api/batches/${inactiveBatchId}`);
    const refreshedDetail = await refreshedRes.json();
    assert(refreshedDetail.isEligibleForDeletion === false, 'Batch immediately becomes NOT eligible for deletion after fresh activity');
    assert(refreshedDetail.inactivityDays === 0, 'Inactivity days reset to 0 after worker activity');

    // ----------------------------------------------------
    // CHECK 7: Retention Scheduled Job Does NOT Automatically Delete
    // ----------------------------------------------------
    console.log('\n--- 7. Verifying Retention Scheduled Job Does NOT Automatically Delete ---');
    // Create another batch that is 7 days inactive
    const sevenDaysAgo = subDays(new Date(), 7);
    const candidateBatch = await prisma.batch.create({
      data: {
        batchName: `Retention-Cron-Safe-${timestamp}`,
        description: 'Verifying no automatic destructive deletion occurs',
        createdById: user.id,
        createdAt: sevenDaysAgo,
        status: 'active',
      },
    });

    // Run the scheduled retention check
    console.log('Running runRetentionCheck()...');
    await runRetentionCheck();

    // Verify candidateBatch STILL exists in DB and is NOT deleted!
    const batchAfterCron = await prisma.batch.findUnique({ where: { id: candidateBatch.id } });
    assert(Boolean(batchAfterCron), 'Batch still exists in database after retention cron execution');
    assert(batchAfterCron?.status === 'active', 'Batch status remains active (NOT automatically deleted)', `Got ${batchAfterCron?.status}`);

    // ----------------------------------------------------
    // CHECK 8: Manual Deletion via Explicit Confirmation Dialog
    // ----------------------------------------------------
    console.log('\n--- 8. Testing Manual Deletion via Confirmation Dialog ---');
    // Also create a download log for this candidate batch to verify log preservation
    await prisma.downloadLog.create({
      data: {
        batchId: candidateBatch.id,
        downloadedById: user.id,
        downloadType: 'batch_zip',
        filename: `${candidateBatch.batchName}.zip`,
      },
    });

    // Verify deletion summary API
    const summaryRes = await fetch(`${BACKEND_URL}/api/batches/${candidateBatch.id}/deletion-summary`);
    const summaryData = await summaryRes.json();
    assert(summaryRes.status === 200, 'Deletion summary retrieved successfully');
    assert(summaryData.isEligibleForDeletion === true, 'Deletion summary reports isEligibleForDeletion: true');
    assert(summaryData.hasDownloads === true, 'Deletion summary reports recorded download history');

    // Delete candidate batch via API (simulating user confirming dialog)
    const delRes = await fetch(`${BACKEND_URL}/api/batches/${candidateBatch.id}`, { method: 'DELETE' });
    const delData = await delRes.json();
    assert(delRes.status === 200, 'Batch manual deletion completed successfully');

    // Verify batch status is marked deleted
    const batchDeleted = await prisma.batch.findUnique({ where: { id: candidateBatch.id } });
    assert(batchDeleted?.status === 'deleted', 'Batch status updated to deleted');

    // ----------------------------------------------------
    // CHECK 9: Preservation of Download History & Audit Records
    // ----------------------------------------------------
    console.log('\n--- 9. Verifying Preservation of Download History & Audit Trail ---');
    const preservedDownloads = await prisma.downloadLog.findMany({
      where: { batchId: candidateBatch.id },
    });
    assert(preservedDownloads.length === 1, 'Download logs preserved in database after batch deletion');

    const preservedAudit = await prisma.auditLog.findMany({
      where: { entityType: 'batch', entityId: candidateBatch.id, action: 'DELETE_BATCH' },
    });
    assert(preservedAudit.length === 1, 'Audit log recorded for DELETE_BATCH');

    // Clean up temporary test batches
    await prisma.batch.updateMany({
      where: { id: { in: [activeBatchId, inactiveBatchId] } },
      data: { status: 'deleted' },
    });

    await browser.close();

    console.log('\n====================================================');
    console.log(`RETENTION VERIFICATION RESULTS: ${testPassed} PASSED, ${testFailed} FAILED`);
    console.log('====================================================\n');

    if (testFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
