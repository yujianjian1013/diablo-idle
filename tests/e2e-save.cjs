/**
 * e2e-save.cjs —— 验证存档持久化与离线结算
 */
const path = require('path');
const PW = 'C:/Users/12451/AppData/Local/npm-cache/_npx/4fb06fbc413e8b48/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  const url = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';

  // 清空旧存档
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(3000);

  const before = await page.evaluate(() => {
    const s = window.__game.state;
    return { level: s.player.level, kills: s.player.kills, gold: Math.round(s.player.gold), floor: s.player.floor };
  });
  console.log('刷新前:', JSON.stringify(before));
  await page.evaluate(() => window.__game.save());

  // 刷新
  await page.reload();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => {
    const s = window.__game.state;
    return { level: s.player.level, kills: s.player.kills, gold: Math.round(s.player.gold), floor: s.player.floor };
  });
  console.log('刷新后:', JSON.stringify(after));
  console.log('存档校验:', (after.level >= before.level && after.kills >= before.kills) ? 'PASS' : 'FAIL');

  // 模拟离线 2 小时
  await page.evaluate(() => {
    window.__skipSave = true;
    const raw = JSON.parse(localStorage.getItem(window.CORE.SAVE_KEY));
    raw.lastSave = Date.now() - 2 * 3600 * 1000;
    raw.player.gold = 500;
    localStorage.setItem(window.CORE.SAVE_KEY, JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForTimeout(1200);
  const diag = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem(window.CORE.SAVE_KEY) || 'null');
    return {
      savedLastSave: raw && raw.lastSave,
      now: Date.now(),
      diffSec: raw ? Math.round((Date.now() - raw.lastSave) / 1000) : null,
      stateLastSave: window.__game.state.lastSave,
      modalClass: document.getElementById('offlineModal').className,
      skipFlag: window.__skipSave,
    };
  });
  console.log('诊断:', JSON.stringify(diag));
  const modalVisible = await page.locator('#offlineModal.show').count();
  const rows = modalVisible ? await page.locator('#offlineRows').innerText() : '';
  console.log('离线弹窗:', modalVisible > 0 ? 'PASS' : 'FAIL');
  console.log('离线内容:', rows.replace(/\n/g, ' | '));

  if (modalVisible) {
    await page.locator('#btnOfflineOk').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(ROOT, 'shot5.png') });
    const goldAfter = await page.evaluate(() => Math.round(window.__game.state.player.gold));
    console.log('离线领取后金币:', goldAfter, goldAfter > after.gold ? '(PASS)' : '(FAIL)');
  }

  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error('E2E 失败:', e); process.exit(1); });
