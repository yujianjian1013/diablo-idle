/**
 * screenshot.cjs —— 生成展示截图
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

  // 加速：直接给一些金币和等级，让画面更丰富（仅截图用）
  await page.evaluate(() => {
    const s = window.__game.state;
    s.player.gold = 20000;
    window.CORE.gainExp(s, 400, []);
    window.UI.update(s, true);
  });

  await page.waitForTimeout(70000);

  const st = await page.evaluate(() => {
    const s = window.__game.state;
    return {
      lv: s.player.level, floor: s.player.floor, kills: s.player.kills,
      equipped: Object.keys(s.equip).filter(k => s.equip[k]).length,
      mon: s.monster && s.monster.name,
      respawn: s.timers.respawn,
    };
  });
  console.log('截图时状态:', JSON.stringify(st));

  await page.screenshot({ path: path.join(ROOT, 'preview.png') });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
