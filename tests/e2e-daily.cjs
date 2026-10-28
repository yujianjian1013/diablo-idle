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
  await page.evaluate(() => localStorage.setItem('diablo_intro_seen','1'));
  await page.reload();
  await page.waitForTimeout(2500);
  await page.locator('#btnDaily').click();
  await page.waitForTimeout(400);
  console.log('每日面板:', await page.locator('#dailyModal.show').count() > 0 ? 'PASS' : 'FAIL');
  console.log('目标数:', await page.locator('#dailyList .ach-item').count());
  console.log('日期:', await page.locator('#dailyDate').innerText());
  await page.screenshot({ path: path.join(ROOT, 'preview-daily.png') });
  // 模拟完成一个目标并领取
  const claim = await page.evaluate(() => {
    const s = window.__game.state;
    s.daily.progress.floors = 25;
    window.UI.renderDaily(s);
    const btn = document.querySelector('.daily-claim');
    if (!btn) return { found: false };
    const goldBefore = s.player.gold;
    btn.click();
    return { found: true, goldBefore: Math.round(goldBefore), goldAfter: Math.round(s.player.gold) };
  });
  console.log('领取测试:', JSON.stringify(claim));
  await page.waitForTimeout(400);
  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
