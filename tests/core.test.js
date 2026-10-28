/**
 * core.test.js —— 核心逻辑测试 + 数值模拟
 * 运行：node tests/core.test.js
 */
const path = require('path');
const DATA = require(path.join(__dirname, '..', 'js', 'data.js'));
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ 失败: ' + msg); }
}
function section(name) { console.log('\n== ' + name + ' =='); }

/* ---------- 1. 装备生成 ---------- */
section('装备生成');
CORE.setSeed(42);
for (const qKey of DATA.QUALITY_ORDER) {
  const q = DATA.QUALITY[qKey];
  let minA = 99, maxA = -1;
  for (let i = 0; i < 50; i++) {
    const it = CORE.createItem('weapon', 10, qKey);
    ok(it.affixes.length >= q.affixes[0] && it.affixes.length <= q.affixes[1],
      qKey + ' 词条数应在 ' + q.affixes.join('~') + '，实际 ' + it.affixes.length);
    const keys = it.affixes.map(a => a.key);
    ok(new Set(keys).size === keys.length, qKey + ' 词条不应重复');
    minA = Math.min(minA, it.affixes.length);
    maxA = Math.max(maxA, it.affixes.length);
  }
  console.log(`  ${q.name}(${qKey}) 词条数范围: ${minA}~${maxA}`);
}

/* ---------- 2. 词条数值随等级成长 ---------- */
section('词条成长');
CORE.setSeed(7);
const low = CORE.createItem('weapon', 1, 'magic');
const high = CORE.createItem('weapon', 30, 'magic');
console.log('  ilvl1 :', low.affixes.map(a => a.key + '+' + a.value).join(', '));
console.log('  ilvl30:', high.affixes.map(a => a.key + '+' + a.value).join(', '));

/* ---------- 3. 属性计算 ---------- */
section('属性计算');
const st = CORE.createState();
ok(st.player.hp === st.stats.hpMax, '初始血量应满');
ok(st.stats.atk === 8, '1 级基础攻击应为 8，实际 ' + st.stats.atk);
ok(Math.abs(st.stats.attackInterval - 0.9) < 1e-9, '初始攻击间隔 0.9s');
// 装一件武器后攻击应提升
const w = CORE.createItem('weapon', 25, 'legendary');
st.equip.weapon = w;
const st2 = CORE.computeStats(st);
ok(st2.atk > st.stats.atk, '装备武器后攻击应提升');
console.log('  装备「' + w.name + '」后攻击 ' + st.stats.atk + ' → ' + st2.atk);

/* ---------- 4. 战斗与推进模拟 ---------- */
section('10 分钟战斗模拟');
CORE.setSeed(2026);
const sim = CORE.createState();
const minutes = 10;
const steps = minutes * 60 * 10; // 每 0.1s 一步
let totalEvents = 0, drops = 0, sells = 0, levelups = 0, deaths = 0, floorUps = 0;
const dropQuality = {};
for (let i = 0; i < steps; i++) {
  const evs = CORE.tick(sim, 0.1);
  totalEvents += evs.length;
  for (const e of evs) {
    if (e.type === 'drop' || e.type === 'equip') {
      drops++;
      dropQuality[e.item.quality] = (dropQuality[e.item.quality] || 0) + 1;
    }
    if (e.type === 'sell') sells++;
    if (e.type === 'levelUp') levelups++;
    if (e.type === 'death') deaths++;
    if (e.type === 'floorUp') floorUps++;
  }
  if (!isFinite(sim.player.hp)) throw new Error('HP 变成非数字！');
}
console.log(`  等级 ${sim.player.level} | 层数 ${sim.player.floor}(最高 ${sim.player.bestFloor}) | 金币 ${sim.player.gold} | 击杀 ${sim.player.kills} | 死亡 ${deaths}`);
console.log('  掉落分布:', JSON.stringify(dropQuality));
console.log('  装备评分:', Object.keys(sim.equip).filter(k => sim.equip[k]).map(k => k + ':' + sim.equip[k].score).join(' '));
ok(sim.player.level >= 5, '10 分钟应至少升到 5 级，实际 ' + sim.player.level);
ok(sim.player.floor >= 3, '10 分钟应至少打到第 3 层，实际 ' + sim.player.floor);
ok(drops > 0, '应掉落装备');
ok(sim.player.kills > 30, '应击杀超过 30 只怪，实际 ' + sim.player.kills);

/* ---------- 5. 长期平衡（2 小时） ---------- */
section('2 小时模拟');
CORE.setSeed(99);
const sim2 = CORE.createState();
const steps2 = 2 * 3600 * 10;
let deaths2 = 0;
const t0 = Date.now();
for (let i = 0; i < steps2; i++) {
  const evs = CORE.tick(sim2, 0.1);
  for (const e of evs) if (e.type === 'death') deaths2++;
}
console.log(`  等级 ${sim2.player.level} | 层数 ${sim2.player.floor}(最高 ${sim2.player.bestFloor}) | 金币 ${sim2.player.gold} | 击杀 ${sim2.player.kills} | 死亡 ${deaths2}`);
console.log(`  战力: 攻击 ${sim2.stats.atk} DPS ${(sim2.stats.atk / sim2.stats.attackInterval).toFixed(1)} | 血量 ${sim2.stats.hpMax} | 暴击 ${sim2.stats.crit}% | 怪物血量 ${CORE.monsterHp(sim2.player.floor).toFixed(0)}`);
ok(sim2.player.bestFloor >= 8, '2 小时应能推进到第 8 层以上，实际 ' + sim2.player.bestFloor);
ok(sim2.player.level >= 15, '2 小时应至少 15 级，实际 ' + sim2.player.level);

/* ---------- 6. 后期平衡（20 小时） ---------- */
section('20 小时模拟');
CORE.setSeed(1234);
const sim3 = CORE.createState();
const steps3 = 20 * 3600 * 10;
for (let i = 0; i < steps3; i++) CORE.tick(sim3, 0.1);
console.log(`  等级 ${sim3.player.level} | 层数 ${sim3.player.floor}(最高 ${sim3.player.bestFloor}) | 击杀 ${sim3.player.kills}`);
console.log(`  攻击 ${sim3.stats.atk} | 血量 ${sim3.stats.hpMax} | 暴击 ${sim3.stats.crit}% | 攻速加成 ${sim3.stats.atkSpeedPct}%`);
ok(sim3.player.bestFloor >= 15, '20 小时应推进到第 15 层以上，实际 ' + sim3.player.bestFloor);

/* ---------- 7. 宝箱 ---------- */
section('宝箱');
CORE.setSeed(555);
const st3 = CORE.createState();
st3.player.gold = 10000;
const before = st3.player.gold;
const chest = CORE.openChest(st3);
ok(chest.ok, '金币足够时应能开箱');
ok(st3.player.gold < before, '开箱应扣金币');
ok(chest.item.quality !== 'normal', '宝箱保底魔法品质，实际 ' + chest.item.quality);
console.log('  开出:', chest.item.name, '(' + chest.item.quality + ') 花费 ' + chest.price);

/* ---------- 8. 分解 ---------- */
section('一键分解');
const st4 = CORE.createState();
// 先穿一件高等级暗金武器作为基准，背包里放 5 件 1 级普通武器
st4.equip.weapon = CORE.createItem('weapon', 30, 'unique');
st4.stats = CORE.computeStats(st4);
for (let i = 0; i < 5; i++) st4.bag.push(CORE.createItem('weapon', 1, 'normal'));
const r = CORE.salvageWorse(st4);
ok(r.count === 5, '5 件 1 级普通武器应全部被分解，实际 ' + r.count);
console.log('  分解', r.count, '件，获得', r.gold, '金币');

/* ---------- 结果 ---------- */
console.log('\n================================');
console.log(`测试结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
