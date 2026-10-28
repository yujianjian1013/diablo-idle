/**
 * screenshot.cjs —— 生成展示截图（等到画面里有怪在战斗时再拍）
 */
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
  await page.waitForTimeout(1000);

  // 给一点初始资源，让画面更有内容（仅截图用）
  await page.evaluate(() => {
    const s = window.__game.state;
    s.player.gold = 5000;
    window.CORE.gainExp(s, 300, []);
    window.UI.update(s, true);
  });

  let shot = false;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(400);
    const ok = await page.evaluate(() => {
      const s = window.__game.state;
      if (!s.run) return false;
      let near = 0;
      for (const m of s.run.monsters) {
        if (m.alive && window.CORE.dist(m, s.run.pos) < 5) near++;
      }
      return near >= 3 && s.player.kills >= 8;
    });
    if (ok) { shot = true; break; }
  }

  const st = await page.evaluate(() => {
    const s = window.__game.state;
    let near = 0, alive = 0;
    for (const m of s.run.monsters) {
      if (m.alive) { alive++; if (window.CORE.dist(m, s.run.pos) < 6) near++; }
    }
    return { lv: s.player.level, floor: s.player.floor, kills: s.player.kills, alive, near, gold: Math.round(s.player.gold) };
  });
  console.log('截图时机:', shot ? 'OK' : '超时', JSON.stringify(st));

  await page.screenshot({ path: path.join(ROOT, 'preview.png') });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
