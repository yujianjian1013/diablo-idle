/**
 * e2e.cjs —— 用本机 Edge 跑真实页面，验证游戏循环与界面
 * 运行：node tests/e2e.cjs
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

  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html');
  await page.waitForTimeout(1000);

  // 首帧状态
  const s0 = await page.evaluate(() => {
    const s = window.__game.state;
    return {
      level: s.player.level, floor: s.player.floor, kills: s.player.kills,
      mon: s.monster && { name: s.monster.name, hp: Math.round(s.monster.hp), max: s.monster.hpMax },
      scene: !!document.getElementById('scene').getContext,
    };
  });
  console.log('初始状态:', JSON.stringify(s0));

  // 让游戏跑 8 秒
  await page.waitForTimeout(8000);
  const s1 = await page.evaluate(() => {
    const s = window.__game.state;
    return {
      level: s.player.level, floor: s.player.floor, kills: s.player.kills,
      gold: Math.round(s.player.gold), hp: Math.round(s.player.hp),
      exp: Math.round(s.player.exp),
      bag: s.bag.length,
      equip: Object.keys(s.equip).filter(k => s.equip[k]).map(k => k + ':' + s.equip[k].quality + ':' + s.equip[k].score),
      log: s.log.slice(0, 6).map(l => l.text),
      progress: s.progress.killed + '/' + s.progress.need,
    };
  });
  console.log('8 秒后:', JSON.stringify(s1, null, 2));

  await page.screenshot({ path: path.join(ROOT, 'shot2.png') });

  // 等到 40 秒，看是否持续推进 + 掉落
  await page.waitForTimeout(22000);
  const s2 = await page.evaluate(() => {
    const s = window.__game.state;
    return {
      level: s.player.level, floor: s.player.floor, best: s.player.bestFloor,
      kills: s.player.kills, gold: Math.round(s.player.gold), deaths: s.player.deaths,
      bag: s.bag.length,
      equipped: Object.keys(s.equip).filter(k => s.equip[k]).length,
      log: s.log.slice(0, 8).map(l => l.text),
    };
  });
  console.log('30 秒后:', JSON.stringify(s2, null, 2));

  await page.screenshot({ path: path.join(ROOT, 'shot3.png') });

  // 测试按钮：开宝箱 / 一键分解
  const ui = await page.evaluate(() => {
    const s = window.__game.state;
    s.player.gold = 100000;
    window.UI.update(s, true);
    document.getElementById('btnChest').click();
    document.getElementById('btnSalvage').click();
    return { gold: Math.round(window.__game.state.player.gold) };
  });
  console.log('按钮测试:', JSON.stringify(ui));

  // 背包 hover tooltip
  await page.waitForTimeout(500);
  const bagCount = await page.locator('.bag-item').count();
  if (bagCount > 0) {
    await page.locator('.bag-item').first().hover();
    await page.waitForTimeout(300);
    const ttVisible = await page.locator('#tooltip.show').count();
    console.log('背包物品数:', bagCount, 'tooltip 显示:', ttVisible > 0);
  }

  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ROOT, 'shot4.png') });

  console.log('\n控制台错误:', errors.length ? errors : '无');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('E2E 失败:', e); process.exit(1); });
