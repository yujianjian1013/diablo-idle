const path = require('path');
const PW = 'C:/Users/12451/AppData/Local/npm-cache/_npx/4fb06fbc413e8b48/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/dist/diablo-idle.html?auto=1');
  await page.waitForTimeout(6000);
  const st = await page.evaluate(() => {
    const s = window.__game && window.__game.state;
    return s ? { cls: s.player.cls, lv: s.player.level, kills: s.player.kills } : null;
  });
  console.log('单文件运行:', JSON.stringify(st));
  console.log('错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
