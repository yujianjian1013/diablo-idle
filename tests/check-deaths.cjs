const path = require('path');
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));
for (const seed of [11, 22, 33]) {
  CORE.setSeed(seed);
  const st = CORE.createState();
  let deaths = 0;
  for (let i = 0; i < 36000; i++) {
    const evs = CORE.tick(st, 0.1);
    for (const e of evs) if (e.type === 'death') deaths++;
    if (i === 5999) console.log(`种子 ${seed} 10分钟: 等级 ${st.player.level} 层数 ${st.player.floor} 死亡 ${deaths}`);
  }
  console.log(`种子 ${seed} 1小时: 等级 ${st.player.level} 层数 ${st.player.floor} 死亡 ${deaths}`);
}
