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
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => {
    const s = window.__game.state;
    s.player.gold = 500000;
    // 确保有装备
    if (!s.equip.weapon) s.equip.weapon = window.CORE.createItem('weapon', 20, 'rare');
    s.stats = window.CORE.computeStats(s);
    window.UI.update(s, true);
    return { gold: Math.round(s.player.gold), enhance: s.equip.weapon.enhance || 0, score: s.equip.weapon.score };
  });
  console.log('强化前:', JSON.stringify(before));
  // 点装备格
  await page.locator('.slot.filled').first().click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const s = window.__game.state;
    return { gold: Math.round(s.player.gold), enhance: s.equip.weapon.enhance || 0, score: s.equip.weapon.score };
  });
  console.log('强化后:', JSON.stringify(after));
  console.log('强化生效:', (after.enhance > before.enhance && after.gold < before.gold) ? 'PASS' : 'FAIL');
  await page.locator('.slot.filled').first().hover();
  await page.waitForTimeout(400);
  const tip = await page.locator('#tooltip').innerText();
  console.log('tooltip:', tip.replace(/\n/g, ' | '));
  await page.screenshot({ path: path.join(ROOT, 'preview-enhance.png') });
  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
