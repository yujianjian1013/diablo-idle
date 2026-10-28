/**
 * e2e-ui.cjs —— 交互与 tooltip 测试
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
  await page.waitForTimeout(1500);

  // 关闭自动装备，让装备进背包
  await page.locator('#btnAutoEquip').click();
  console.log('自动装备按钮文案:', await page.locator('#btnAutoEquip').innerText());

  // 给点金币，开箱制造装备
  await page.evaluate(() => {
    const s = window.__game.state;
    s.player.gold = 50000;
    window.UI.update(s, true);
  });
  for (let i = 0; i < 6; i++) {
    await page.locator('#btnChest').click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);

  const bagCount = await page.locator('.bag-item').count();
  console.log('背包物品数:', bagCount);

  // hover 物品看 tooltip
  if (bagCount > 0) {
    await page.locator('.bag-item').first().hover();
    await page.waitForTimeout(300);
    const tt = await page.locator('#tooltip.show').count();
    const ttText = tt ? await page.locator('#tooltip').innerText() : '';
    console.log('背包 tooltip:', tt > 0 ? 'PASS' : 'FAIL');
    console.log('tooltip 内容:', ttText.replace(/\n/g, ' | '));
    await page.screenshot({ path: path.join(ROOT, 'shot-bag.png') });
  }

  // 点击装备
  if (bagCount > 0) {
    await page.locator('.bag-item').first().click();
    await page.waitForTimeout(300);
    const equipped = await page.evaluate(() =>
      Object.keys(window.__game.state.equip).filter(k => window.__game.state.equip[k]).length);
    console.log('点击装备后已穿戴槽位:', equipped);
  }

  // 装备格 tooltip
  const filled = await page.locator('.slot.filled').count();
  if (filled > 0) {
    await page.locator('.slot.filled').first().hover();
    await page.waitForTimeout(300);
    const tt2 = await page.locator('#tooltip.show').count();
    console.log('装备格 tooltip:', tt2 > 0 ? 'PASS' : 'FAIL', '| 已穿戴格子:', filled);
  }

  // 一键分解
  await page.locator('#btnSalvage').click();
  await page.waitForTimeout(400);
  console.log('分解后背包:', await page.evaluate(() => window.__game.state.bag.length));

  // 打开自动装备再跑一会儿，拍战斗图
  await page.locator('#btnAutoEquip').click();
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(ROOT, 'shot-final.png') });
  const final = await page.evaluate(() => {
    const s = window.__game.state;
    return { lv: s.player.level, floor: s.player.floor, kills: s.player.kills, gold: Math.round(s.player.gold), equip: Object.keys(s.equip).filter(k => s.equip[k]).length };
  });
  console.log('最终状态:', JSON.stringify(final));

  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error('E2E 失败:', e); process.exit(1); });
