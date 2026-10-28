const path = require('path');
const PW = 'C:/Users/12451/AppData/Local/npm-cache/_npx/4fb06fbc413e8b48/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html?auto=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(600);
  await page.waitForTimeout(45000);
  const st = await page.evaluate(() => {
    const s = window.__game.state;
    const keys = Object.keys(s.achievements || {});
    return {
      lv: s.player.level, floor: s.player.floor, kills: s.player.kills,
      unlocked: keys, bonus: s.achBonus,
      items: s.player.itemsFound, elite: s.player.elitesKilled,
    };
  });
  console.log('状态:', JSON.stringify(st, null, 1));
  await page.locator('#btnAch').click();
  await page.waitForTimeout(500);
  console.log('成就弹窗:', await page.locator('#achModal.show').count() > 0 ? 'PASS' : 'FAIL');
  await page.screenshot({ path: path.join(ROOT, 'preview-ach.png') });
  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
