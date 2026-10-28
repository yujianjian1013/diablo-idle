/**
 * screenshot-v2.cjs —— 技能与展开小地图的演示截图
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
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);

  // 加速成长，画出内容丰富的一帧
  await page.evaluate(() => {
    const s = window.__game.state;
    s.player.gold = 8000;
    window.CORE.gainExp(s, 900, []);
    window.UI.update(s, true);
  });

  // 等玩家周围聚集几只怪
  for (let i = 0; i < 80; i++) {
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
    if (ok) break;
  }

  // 释放旋风斩
  await page.keyboard.press('1');
  await page.waitForTimeout(160);
  await page.screenshot({ path: path.join(ROOT, 'shot-skill.png') });
  const skillState = await page.evaluate(() => {
    const s = window.__game.state;
    return { cd: s.run.skills.whirlwind.toFixed(1), btn: document.getElementById('btnSkill1').textContent };
  });
  console.log('技能状态:', JSON.stringify(skillState));

  // 点开小地图
  const mm = await page.evaluate(() => window.UI.Scene.mmRect);
  const box = await page.locator('#scene').boundingBox();
  if (mm && box) {
    await page.mouse.click(box.x + mm.x + mm.w / 2, box.y + mm.y + mm.h / 2);
    await page.waitForTimeout(400);
    const expanded = await page.evaluate(() => window.UI.Scene.mmExpanded);
    console.log('小地图展开:', expanded ? 'PASS' : 'FAIL');
    await page.screenshot({ path: path.join(ROOT, 'shot-minimap.png') });
  }

  const summary = await page.evaluate(() => {
    const s = window.__game.state;
    let elite = 0, boss = 0, alive = 0;
    for (const m of s.run.monsters) {
      if (!m.alive) continue;
      alive++;
      if (m.isElite) elite++;
      if (m.isBoss) boss++;
    }
    return { lv: s.player.level, floor: s.player.floor, alive, elite, boss, kills: s.player.kills };
  });
  console.log('当前局:', JSON.stringify(summary));
  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
