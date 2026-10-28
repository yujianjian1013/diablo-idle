const path = require('path');
const PW = 'C:/Users/12451/AppData/Local/npm-cache/_npx/4fb06fbc413e8b48/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html?auto=1');
  await page.evaluate(() => localStorage.setItem('diablo_intro_seen', '1'));
  await page.reload();
  await page.waitForTimeout(12000);
  const info = await page.evaluate(() => {
    const s = window.__game.state;
    const el = document.getElementById('skillBar');
    return {
      cls: s && s.player.cls, lv: s && s.player.level,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      skillBarW: el ? el.getBoundingClientRect().width : 0,
      skillBtnH: el && el.firstElementChild ? el.firstElementChild.getBoundingClientRect().height : 0,
    };
  });
  console.log('移动端:', JSON.stringify(info));
  await page.screenshot({ path: path.join(ROOT, 'shot-mobile.png'), fullPage: false });
  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
