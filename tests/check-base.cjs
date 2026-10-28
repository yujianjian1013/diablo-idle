const path = require('path');
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));

function bare(lv) {
  const s = { player: { level: lv }, equip: CORE.emptyEquip() };
  return CORE.computeStats(s);
}

console.log('=== 裸装玩家基础属性 ===');
console.log('等级\t攻击\t生命\tDPS\t攻击间隔\t暴击\t暴伤\t升级所需经验\t到达该级累计');
let acc = 0;
const rows = [];
for (let lv = 1; lv <= 50; lv++) {
  const st = bare(lv);
  if ([1, 5, 10, 15, 20, 25, 30, 40, 50].includes(lv)) {
    rows.push({
      lv,
      atk: st.atk,
      hp: st.hpMax,
      dps: (st.atk / st.attackInterval).toFixed(1),
      int: st.attackInterval.toFixed(2),
      crit: st.crit,
      cd: st.critDmg,
      need: CORE.expToNext(lv),
      acc: Math.round(acc)
    });
  }
  acc += CORE.expToNext(lv);
}
for (const r of rows) {
  console.log(`${r.lv}\t${r.atk}\t${r.hp}\t${r.dps}\t${r.int}s\t${r.crit}%\t${r.cd}%\t${r.need}\t${r.acc}`);
}

console.log('\n=== 裸装战斗参数 ===');
console.log('攻击间隔 0.9s | 攻击距离 2.25 格 | 移动速度 3.4 格/秒');
console.log('自然回血 0.4%最大生命/秒 | 击杀回血 5%最大生命');
console.log('暴击率 5% | 暴击伤害 150% | 防御减伤 = def/(def+26+层数*5)');

console.log('\n=== 怪物数值（对比参考） ===');
console.log('层数\t血量\t攻击\t经验\t金币');
for (const f of [1, 5, 10, 20, 30, 40, 50]) {
  console.log(`${f}\t${Math.round(CORE.monsterHp(f))}\t${CORE.monsterAtk(f).toFixed(1)}\t${Math.round(CORE.monsterExp(f))}\t${Math.round(CORE.monsterGold(f))}`);
}

console.log('\n=== 装备能提供多少（当前词条成长） ===');
for (const ilvl of [1, 10, 25, 50]) {
  const it = CORE.createItem('weapon', ilvl, 'legendary');
  const atkAffix = it.affixes.find(a => a.key === 'atk');
  const atkVal = atkAffix ? atkAffix.value : 0;
  console.log(`物品等级 ${ilvl}: 单条攻击词条 ≈ ${atkVal}（裸装攻击 ${bare(ilvl).atk}）`);
}
