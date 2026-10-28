const path = require('path');
const PW = 'C:/Users/12451/AppData/Local/npm-cache/_npx/4fb06fbc413e8b48/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  // 手机端完整流程
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ROOT, 'shot-mobile-home.png') });
  await page.locator('#btnNewGame').click();
  await page.waitForTimeout(500);
  const cards = await page.locator('.class-card').count();
  console.log('移动端首页职业卡:', cards);
  await page.locator('.class-card.available').first().click();
  await page.waitForTimeout(1500);
  const intro = await page.locator('#introModal.show').count();
  if (intro) await page.locator('#btnIntroOk').click();
  await page.waitForTimeout(8000);
  const st = await page.evaluate(() => {
    const s = window.__game.state;
    return { cls: s.player.cls, lv: s.player.level, kills: s.player.kills };
  });
  console.log('移动端游玩:', JSON.stringify(st));
  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
