const path = require('path');
const PW = 'C:/Users/12451/AppData/Local/npm-cache/_npx/4fb06fbc413e8b48/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);
  await page.locator('#btnNewGame').click();
  await page.waitForTimeout(400);
  console.log('职业数:', await page.locator('.class-card.available').count());
  await page.screenshot({ path: path.join(ROOT, 'preview-classes.png') });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
