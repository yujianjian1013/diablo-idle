/**
 * e2e-home.cjs —— 首页与职业选择流程测试
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

  const url = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(700);

  const homeVisible = await page.locator('#homeScreen.show').count();
  console.log('首页显示:', homeVisible > 0 ? 'PASS' : 'FAIL');
  console.log('继续游戏按钮:', await page.locator('#btnContinue').isVisible() ? '可见（有存档）' : '隐藏（无存档）');
  await page.screenshot({ path: path.join(ROOT, 'shot-home.png') });

  // 点新游戏
  await page.locator('#btnNewGame').click();
  await page.waitForTimeout(400);
  const cards = await page.locator('.class-card').count();
  const avail = await page.locator('.class-card.available').count();
  console.log('职业卡片:', cards, '| 可玩:', avail);
  await page.screenshot({ path: path.join(ROOT, 'shot-class.png') });

  // 选战士
  await page.locator('.class-card.available').first().click();
  await page.waitForTimeout(1200);
  // 关闭新手引导
  if (await page.locator('#introModal.show').count()) {
    await page.locator('#btnIntroOk').click();
    await page.waitForTimeout(400);
  }
  const inGame = await page.locator('#homeScreen.show').count() === 0;
  const st = await page.evaluate(() => {
    const s = window.__game.state;
    return s ? { cls: s.player.cls, lv: s.player.level, skills: s.player.skills } : null;
  });
  console.log('进入游戏:', inGame ? 'PASS' : 'FAIL', JSON.stringify(st));

  // 返回首页
  await page.locator('#btnHome').click();
  await page.waitForTimeout(500);
  const backHome = await page.locator('#homeScreen.show').count() > 0;
  const hasSave = await page.locator('#btnContinue').isVisible();
  console.log('返回首页:', backHome ? 'PASS' : 'FAIL', '| 继续游戏按钮:', hasSave ? '显示' : '隐藏');

  // 继续游戏（存档应该还在）
  await page.locator('#btnContinue').click();
  await page.waitForTimeout(1200);
  const resumed = await page.evaluate(() => {
    const s = window.__game.state;
    return s ? { cls: s.player.cls, lv: s.player.level } : null;
  });
  console.log('继续游戏:', JSON.stringify(resumed));

  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error('E2E 失败:', e); process.exit(1); });
