const path = require('path');
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));
for (const seed of [11, 22]) {
  CORE.setSeed(seed);
  const st = CORE.createState();
  let deaths = 0;
  for (let i = 0; i < 18000; i++) {
    const evs = CORE.tick(st, 0.1);
    for (const e of evs) if (e.type === 'death') deaths++;
  }
  console.log(`种子 ${seed} 30分钟: 等级 ${st.player.level} 层数 ${st.player.floor} 死亡 ${deaths}`);
}
