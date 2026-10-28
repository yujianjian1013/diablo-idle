const path = require('path');
const PW = 'C:/Users/12451/AppData/Local/npm-cache/_npx/4fb06fbc413e8b48/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html?auto=1');
  await page.evaluate(() => localStorage.setItem('diablo_intro_seen','1'));
  await page.reload();
  await page.waitForTimeout(3000);
  // 测 2 秒内的帧数
  const fps = await page.evaluate(() => new Promise(resolve => {
    let frames = 0;
    const t0 = performance.now();
    function tick() {
      frames++;
      if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
      else resolve(Math.round(frames / 2));
    }
    requestAnimationFrame(tick);
  }));
  console.log('FPS:', fps, fps >= 50 ? 'PASS' : 'LOW');
  // 对象数量
  const counts = await page.evaluate(() => {
    const S = window.UI.Scene;
    return {
      floats: S.floats.length, parts: S.parts.length,
      projectiles: S.projectiles.length, lootBeams: S.lootBeams.length,
      dying: S.dying.length, monsters: window.__game.state.run.monsters.length,
    };
  });
  console.log('场景对象:', JSON.stringify(counts));
  console.log('错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
