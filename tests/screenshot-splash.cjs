/**
 * screenshot-splash.cjs —— 溅射效果展示截图
 */
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
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);

  // 注入一件高溅射武器，方便观察效果
  await page.evaluate(() => {
    const s = window.__game.state;
    s.equip.weapon = {
      id: 90001, slot: 'weapon', quality: 'legendary', ilvl: 12, enhance: 0,
      affixes: [
        { key: 'splash', value: 55 },
        { key: 'splashRadius', value: 90 },
        { key: 'atk', value: 40 },
      ],
      name: '裂开的长剑· 血誓', score: 300,
    };
    s.stats = window.CORE.computeStats(s);
    window.CORE.gainExp(s, 400, []);
    window.UI.update(s, true);
  });

  // 等怪聚集到主目标身边
  let shot = false;
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(350);
    const ok = await page.evaluate(() => {
      const s = window.__game.state;
      if (!s.run) return false;
      const monsters = s.run.monsters.filter(m => m.alive);
      // 找一对距离很近的怪
      for (let a = 0; a < monsters.length; a++) {
        for (let b = a + 1; b < monsters.length; b++) {
          if (window.CORE.dist(monsters[a], monsters[b]) < 1.6) return true;
        }
      }
      return false;
    });
    if (ok) { shot = true; break; }
  }

  // 把角色传送到怪最密集的位置，方便观察溅射
  await page.evaluate(() => {
    const s = window.__game.state;
    const r = s.run;
    const ms = r.monsters.filter(m => m.alive);
    let best = null, bestScore = -1;
    for (const m of ms) {
      let cnt = 0;
      for (const o of ms) if (o !== m && window.CORE.dist(m, o) < 2.2) cnt++;
      if (cnt > bestScore) { bestScore = cnt; best = m; }
    }
    if (best) {
      r.pos.x = best.x + 0.6;
      r.pos.y = best.y + 0.6;
      r.path = [];
      r.target = null;
      if (window.MAP) window.MAP.reveal(r.map, r.pos.x, r.pos.y, 9);
    }
  });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: path.join(ROOT, 'preview-splash.png') });

  const info = await page.evaluate((shotOk) => {
    const s = window.__game.state;
    return {
      splash: s.stats.splash,
      radius: s.stats.splashRadius,
      geared: shotOk,
      lv: s.player.level,
    };
  }, shot);
  console.log('溅射展示:', JSON.stringify(info));
  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
