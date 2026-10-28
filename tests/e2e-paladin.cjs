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
  await page.waitForTimeout(600);
  await page.locator('#btnNewGame').click();
  await page.waitForTimeout(400);
  const cards = await page.locator('.class-card.available').count();
  console.log('可玩职业数:', cards);
  const names = await page.locator('.class-card.available .cc-name').allInnerTexts();
  console.log('职业列表:', names.join(' / '));
  // 选骑士（第 4 个）
  await page.locator('.class-card.available').nth(2).click();
  await page.waitForTimeout(1200);
  if (await page.locator('#introModal.show').count()) await page.locator('#btnIntroOk').click();
  await page.waitForTimeout(22000);
  const info = await page.evaluate(() => {
    const s = window.__game.state;
    const st = s.stats;
    return {
      cls: s.player.cls, lv: s.player.level, floor: s.player.floor, kills: s.player.kills,
      atk: st.atk, hp: st.hpMax, mpMax: s.player.rageMax, mp: Math.round(s.player.rage),
      elem: st.elemDmg, shield: st.dmgReduce, skills: s.player.skills,
    };
  });
  console.log('骑士状态:', JSON.stringify(info));
  console.log('资源标签:', await page.locator('#resLabel').innerText());
  await page.screenshot({ path: path.join(ROOT, 'preview-paladin.png') });
  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
