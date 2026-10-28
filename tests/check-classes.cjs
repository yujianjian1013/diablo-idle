const path = require('path');
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));
for (const cls of ['warrior', 'ranger', 'mage', 'paladin']) {
  CORE.setSeed(4242);
  const st = CORE.createState(cls);
  let deaths = 0, casts = 0;
  for (let i = 0; i < 36000; i++) {
    const evs = CORE.tick(st, 0.1);
    for (const e of evs) {
      if (e.type === 'death') deaths++;
      if (e.type === 'skill') casts++;
    }
    if (i === 5999) {
      console.log(`${cls} 10分钟: 等级 ${st.player.level} 层数 ${st.player.floor} 击杀 ${st.player.kills} 死亡 ${deaths}`);
    }
  }
  const s = st.stats;
  console.log(`${cls} 1小时: 等级 ${st.player.level} 层数 ${st.player.floor} 击杀 ${st.player.kills} 死亡 ${deaths} 技能释放 ${casts}`);
  console.log(`   面板: 攻击 ${s.atk.toFixed(0)} 生命 ${s.hpMax} 暴击 ${s.crit}% 攻速 ${s.attackInterval.toFixed(2)}s 闪避 ${s.evade}%`);
}
