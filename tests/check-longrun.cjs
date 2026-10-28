const path = require('path');
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));
// 3 小时模拟，检查数值是否出现 NaN / 无穷 / 卡死
for (const cls of ['warrior', 'ranger', 'mage', 'paladin', 'priest']) {
  CORE.setSeed(777);
  const st = CORE.createState(cls);
  let bad = false;
  for (let i = 0; i < 108000; i++) {   // 3 小时
    CORE.tick(st, 0.1);
    if (i % 36000 === 0 && i > 0) {
      const s = st.stats;
      if (!isFinite(s.atk) || !isFinite(s.hpMax) || !isFinite(st.player.gold)) { bad = true; break; }
    }
  }
  const s = st.stats;
  console.log(cls.padEnd(8),
    '3小时: 等级', st.player.level,
    '层数', st.player.floor,
    '击杀', st.player.kills,
    '金币', Math.round(st.player.gold),
    '攻击', Math.round(s.atk),
    '生命', s.hpMax,
    bad ? '!!! 数值异常' : 'OK');
}
