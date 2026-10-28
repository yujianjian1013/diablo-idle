const path = require('path');
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));
CORE.setSeed(777);
const st = CORE.createState();
for (let i = 0; i < 36000; i++) CORE.tick(st, 0.1);
const s = st.stats;
console.log('1 小时后属性:');
console.log('  攻击', s.atk, '| 暴击', s.crit + '%', '| 溅射', s.splash + '%', '| 溅射范围', s.splashRadius.toFixed(2) + ' 格');
console.log('  层数', st.player.floor, '| 击杀', st.player.kills, '| 等级', st.player.level);
// 统计装备上的溅射词条
let n = 0;
for (const k of Object.keys(st.equip)) {
  const it = st.equip[k];
  if (!it) continue;
  for (const a of it.affixes) if (a.key === 'splash' || a.key === 'splashRadius') n++;
}
console.log('  装备上的溅射词条数:', n);
