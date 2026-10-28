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
  await page.evaluate(() => localStorage.setItem('diablo_intro_seen','1'));
  await page.reload();
  await page.waitForTimeout(2500);
  await page.locator('#btnSettings').click();
  await page.waitForTimeout(400);
  console.log('设置面板:', await page.locator('#settingsModal.show').count() > 0 ? 'PASS' : 'FAIL');
  console.log('版本:', await page.locator('#optVersion').innerText());
  // 调音量
  await page.locator('#optVolume').fill('30');
  await page.waitForTimeout(200);
  const vol = await page.evaluate(() => window.SOUND.getVolume());
  console.log('音量设置:', vol, vol <= 0.31 ? 'PASS' : 'FAIL');
  // 关震动
  await page.evaluate(() => {
    const el = document.getElementById('optShake');
    el.checked = false;
    el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(200);
  const shake = await page.evaluate(() => window.UI.Scene.shakeEnabled);
  console.log('震动开关:', shake === false ? 'PASS' : 'FAIL');
  await page.screenshot({ path: path.join(ROOT, 'preview-settings.png') });
  await page.locator('#btnSettingsClose').click();
  await page.waitForTimeout(300);
  console.log('关闭设置:', await page.locator('#settingsModal.show').count() === 0 ? 'PASS' : 'FAIL');
  console.log('控制台错误:', errors.length ? errors : '无');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
