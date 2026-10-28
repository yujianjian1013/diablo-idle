/**
 * check-classes-avg.cjs —— 每个职业跑 5 次取平均，减少装备随机性影响
 */
const path = require('path');
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));

const RUNS = 5;
const classes = ['warrior', 'ranger', 'mage', 'paladin', 'priest'];

for (const cls of classes) {
  let sumFloor = 0, sumKills = 0, sumDeaths = 0, sumLv = 0;
  for (let run = 0; run < RUNS; run++) {
    CORE.setSeed(1000 + run * 137);
    const st = CORE.createState(cls);
    let deaths = 0;
    for (let i = 0; i < 36000; i++) {
      const evs = CORE.tick(st, 0.1);
      for (const e of evs) if (e.type === 'death') deaths++;
    }
    sumFloor += st.player.floor;
    sumKills += st.player.kills;
    sumDeaths += deaths;
    sumLv += st.player.level;
  }
  console.log(
    cls.padEnd(8),
    '层数', (sumFloor / RUNS).toFixed(1).padStart(5),
    '| 击杀', (sumKills / RUNS).toFixed(0).padStart(5),
    '| 死亡', (sumDeaths / RUNS).toFixed(1).padStart(5),
    '| 等级', (sumLv / RUNS).toFixed(1)
  );
}
