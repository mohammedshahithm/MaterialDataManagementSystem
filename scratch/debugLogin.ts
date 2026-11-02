import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('request', req => console.log('REQ:', req.method(), req.url()));
  page.on('response', async res => {
    console.log('RES:', res.status(), res.url());
    if (res.url().includes('/auth/me')) {
      console.log('AUTH/ME BODY:', await res.text().catch(() => 'could not read'));
    }
  });
  page.on('requestfailed', req => console.log('FAILED REQ:', req.method(), req.url(), req.failure()?.errorText));
  
  await page.goto('http://localhost:5173/login');
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', 'qa-admin@mdms-test.local');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  
  // Wait up to 10 seconds and log URL every second
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    console.log(`Sec ${i + 1} URL:`, page.url());
  }
  
  await browser.close();
}

test().catch(console.error);
