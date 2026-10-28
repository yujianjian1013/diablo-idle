const path = require('path');
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));
CORE.setSeed(2024);
function bare(lv) {
  return CORE.computeStats({ player: { level: lv }, equip: CORE.emptyEquip() });
}
console.log('=== 装备单条攻击词条数值（稀有位，抽 3000 次统计） ===');
for (const ilvl of [1, 5, 10, 25, 50]) {
  let sum = 0, cnt = 0, total = 0;
  for (let i = 0; i < 1200; i++) {
    const it = CORE.createItem('weapon', ilvl, 'rare');
    total += it.affixes.length;
    for (const a of it.affixes) if (a.key === 'atk') { sum += a.value; cnt++; }
  }
  const avg = cnt ? (sum / cnt) : 0;
  console.log(`ilvl ${String(ilvl).padStart(2)}: 平均单条 ${avg.toFixed(0).padStart(5)} 攻击  |  裸装攻击 ${bare(ilvl).atk.toFixed(1).padStart(6)}  |  装备/基础 = ${(avg / Math.max(1, bare(ilvl).atk)).toFixed(1)}x`);
}
console.log('');
console.log('=== 8 件装备的总加成（模拟一件件换装） ===');
for (const ilvl of [1, 10, 25, 50]) {
  let atkSum = 0, hpSum = 0, runs = 300;
  for (let r = 0; r < runs; r++) {
    const st = CORE.createState();
    st.player.level = ilvl;
    for (const slot of ['weapon','helmet','armor','gloves','boots','amulet','ring1','ring2']) {
      st.equip[slot] = CORE.createItem(slot, ilvl, 'rare');
    }
    const withGear = CORE.computeStats(st);
    const b = bare(ilvl);
    atkSum += withGear.atk / b.atk;
    hpSum += withGear.hpMax / b.hpMax;
  }
  console.log(`ilvl ${String(ilvl).padStart(2)}: 全稀有装后 攻击 ${(atkSum/runs).toFixed(1)}x、生命 ${(hpSum/runs).toFixed(1)}x 于裸装`);
}
