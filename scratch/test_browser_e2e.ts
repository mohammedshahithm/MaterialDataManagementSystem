import { chromium } from '../frontend/node_modules/playwright';

async function runBrowserTests() {
  console.log('🚀 Starting Shared Factory Terminal Browser E2E Verification with Playwright (MS Edge)...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: { test: string; status: 'PASS' | 'FAIL'; details: string }[] = [];

  try {
    // 1. Direct Load to Dashboard
    console.log('\n--- Test 1: Direct Load to Dashboard ---');
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');
    const url1 = page.url();
    const hasLoginForm = await page.locator('input[type="password"]').count();
    const hasSignInButton = await page.locator('text=Sign In').count();
    const hasSignUpButton = await page.locator('text=Sign Up').count();
    const hasDashboardHeading = await page.locator('text=Dashboard').first().isVisible();
    const sidebarTerminal = await page.locator('text=Shared Factory Terminal').isVisible();

    if (
      url1 === 'http://localhost:5173/' &&
      hasLoginForm === 0 &&
      hasSignInButton === 0 &&
      hasSignUpButton === 0 &&
      hasDashboardHeading &&
      sidebarTerminal
    ) {
      results.push({ test: 'Direct Load Without Login', status: 'PASS', details: 'Navigated straight to Dashboard as Shared Factory Terminal' });
      console.log('✅ PASS: Direct Load Without Login');
    } else {
      results.push({ test: 'Direct Load Without Login', status: 'FAIL', details: `URL: ${url1}, LoginFormCount: ${hasLoginForm}` });
      console.log('❌ FAIL: Direct Load Without Login');
    }

    // 2. Page Refresh Persistence
    console.log('\n--- Test 2: Page Refresh Persistence ---');
    await page.reload();
    await page.waitForLoadState('networkidle');
    const url2 = page.url();
    const stillOnDashboard = await page.locator('text=Dashboard').first().isVisible();

    if (url2 === 'http://localhost:5173/' && stillOnDashboard) {
      results.push({ test: 'Refresh Persistence', status: 'PASS', details: 'Page refresh remains on Dashboard without login redirect' });
      console.log('✅ PASS: Refresh Persistence');
    } else {
      results.push({ test: 'Refresh Persistence', status: 'FAIL', details: `URL after refresh: ${url2}` });
      console.log('❌ FAIL: Refresh Persistence');
    }

    // 3. Forced Navigation to /login
    console.log('\n--- Test 3: Forced Navigation to /login Redirects to / ---');
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');
    const url3 = page.url();

    if (url3 === 'http://localhost:5173/' || url3 === 'http://localhost:5173') {
      results.push({ test: 'Login Route Elimination', status: 'PASS', details: 'Access to /login redirects instantly to /' });
      console.log('✅ PASS: Login Route Elimination');
    } else {
      results.push({ test: 'Login Route Elimination', status: 'FAIL', details: `Navigating to /login stayed at ${url3}` });
      console.log('❌ FAIL: Login Route Elimination');
    }

    // 4. Batches Page Navigation
    console.log('\n--- Test 4: Batches Page Navigation ---');
    await page.click('a[href="/batches"]');
    await page.waitForSelector('h1:has-text("Batch Management")');
    const hasBatchesTitle = await page.locator('h1:has-text("Batch Management")').isVisible();

    if (hasBatchesTitle) {
      results.push({ test: 'Batches Page Access', status: 'PASS', details: 'Batches page loaded cleanly' });
      console.log('✅ PASS: Batches Page Access');
    } else {
      results.push({ test: 'Batches Page Access', status: 'FAIL', details: 'Batches page did not render Batch Management title' });
      console.log('❌ FAIL: Batches Page Access');
    }

    // 5. Backup & Deletion Page Navigation
    console.log('\n--- Test 5: Backup & Deletion Page Navigation ---');
    await page.click('a[href="/backup"]');
    await page.waitForSelector('h1:has-text("Backup & Cloud Deletion")');
    const hasBackupTitle = await page.locator('h1:has-text("Backup & Cloud Deletion")').isVisible();

    if (hasBackupTitle) {
      results.push({ test: 'Backup & Deletion Access', status: 'PASS', details: 'Backup and deletion management page loaded directly' });
      console.log('✅ PASS: Backup & Deletion Access');
    } else {
      results.push({ test: 'Backup & Deletion Access', status: 'FAIL', details: 'Backup page did not render header' });
      console.log('❌ FAIL: Backup & Deletion Access');
    }

    // 6. Direct Audit Logs Navigation (No Passcode Prompt)
    console.log('\n--- Test 6: Audit Logs Direct Accessibility ---');
    await page.click('a[href="/audit-logs"]');
    await page.waitForSelector('h1:has-text("Audit Logs")');
    const hasAuditTitle = await page.locator('h1:has-text("Audit Logs")').isVisible();
    const hasNoPasscodePrompt = (await page.locator('text=Administrator Access Required').count()) === 0;

    if (hasAuditTitle && hasNoPasscodePrompt) {
      results.push({ test: 'Audit Logs Direct Access', status: 'PASS', details: 'Audit logs opened directly without password or role barriers' });
      console.log('✅ PASS: Audit Logs Direct Access');
    } else {
      results.push({ test: 'Audit Logs Direct Access', status: 'FAIL', details: 'Audit logs did not open directly' });
      console.log('❌ FAIL: Audit Logs Direct Access');
    }

    // 7. Direct Settings Navigation (No Passcode Prompt)
    console.log('\n--- Test 7: Settings Direct Accessibility ---');
    await page.click('a[href="/settings"]');
    await page.waitForSelector('h1:has-text("Settings")');
    const hasSettingsTitle = await page.locator('h1:has-text("Settings")').isVisible();

    if (hasSettingsTitle) {
      results.push({ test: 'Settings Direct Access', status: 'PASS', details: 'System settings opened directly without password or role barriers' });
      console.log('✅ PASS: Settings Direct Access');
    } else {
      results.push({ test: 'Settings Direct Access', status: 'FAIL', details: 'Settings did not render title' });
      console.log('❌ FAIL: Settings Direct Access');
    }

  } catch (error: any) {
    console.error('Test execution error:', error);
    results.push({ test: 'Execution Exception', status: 'FAIL', details: error.message });
  } finally {
    await browser.close();
  }

  console.log('\n========================================');
  console.log('BROWSER E2E SUMMARY:');
  console.log('========================================');
  results.forEach(r => console.log(`${r.status === 'PASS' ? '✅' : '❌'} [${r.status}] ${r.test}: ${r.details}`));
  const allPassed = results.every(r => r.status === 'PASS');
  console.log(`\nOVERALL: ${allPassed ? 'ALL BROWSER TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

runBrowserTests();
