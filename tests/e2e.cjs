/**
 * e2e.cjs —— 浏览器端到端验证（v2 等距版）
 */
const path = require('path');
const PW = 'C:/Users/12451/AppData/Local/npm-cache/_npx/4fb06fbc413e8b48/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html?auto=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1200);

  const snapshot = () => page.evaluate(() => {
    const s = window.__game.state;
    const r = s.run;
    let alive = 0;
    if (r) for (const m of r.monsters) if (m.alive) alive++;
    let explored = 0;
    if (r) for (let i = 0; i < r.map.explored.length; i++) if (r.map.explored[i]) explored++;
    return {
      lv: s.player.level, floor: s.player.floor, kills: s.player.kills,
      gold: Math.round(s.player.gold), hp: Math.round(s.player.hp),
      alive,
      pos: r ? { x: Math.round(r.pos.x * 10) / 10, y: Math.round(r.pos.y * 10) / 10 } : null,
      pathLen: r ? r.path.length : 0,
      rooms: r ? r.map.rooms.length : 0,
      explored,
      equipped: Object.keys(s.equip).filter(k => s.equip[k]).length,
      bag: s.bag.length,
      log: s.log.slice(0, 5).map(l => l.text),
    };
  });

  console.log('初始:', JSON.stringify(await snapshot()));

  await page.waitForTimeout(6000);
  const a = await snapshot();
  console.log('6 秒:', JSON.stringify(a));

  await page.waitForTimeout(14000);
  const b = await snapshot();
  console.log('20 秒:', JSON.stringify(b));
  await page.screenshot({ path: path.join(ROOT, 'shot-iso-1.png') });

  const moved = a.pos && b.pos && (a.pos.x !== b.pos.x || a.pos.y !== b.pos.y);
  console.log('玩家在移动:', moved ? 'PASS' : 'FAIL');
  console.log('探索区域扩大:', b.explored > a.explored ? 'PASS' : 'FAIL');

  await page.waitForTimeout(40000);
  const c = await snapshot();
  console.log('60 秒:', JSON.stringify(c));
  await page.screenshot({ path: path.join(ROOT, 'shot-iso-2.png') });

  const ui = await page.evaluate(() => {
    const s = window.__game.state;
    s.player.gold = 100000;
    window.UI.update(s, true);
    document.getElementById('btnChest').click();
    return { gold: Math.round(window.__game.state.player.gold) };
  });
  console.log('开宝箱后金币:', JSON.stringify(ui));

  console.log('\n控制台错误:', errors.length ? errors : '无');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('E2E 失败:', e); process.exit(1); });
