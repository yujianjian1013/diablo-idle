/**
 * core.test.js —— v2 等距地牢版核心逻辑测试
 * 运行：node tests/core.test.js
 */
const path = require('path');
const DATA = require(path.join(__dirname, '..', 'js', 'data.js'));
const MAP = require(path.join(__dirname, '..', 'js', 'map.js'));
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  ✗ 失败: ' + msg); }
}
function section(n) { console.log('\n== ' + n + ' =='); }

/* ---------- 1. 地图生成 ---------- */
section('地图生成');
for (let f = 1; f <= 6; f++) {
  const m = MAP.generate(f, Math.random);
  ok(m.rooms.length >= 5, '第 ' + f + ' 层至少 5 个房间，实际 ' + m.rooms.length);
  ok(MAP.isWalkable(m, m.start.x, m.start.y), '第 ' + f + ' 层起点可行走');
  ok(MAP.isWalkable(m, m.exit.x, m.exit.y), '第 ' + f + ' 层出口可行走');
  const p = MAP.findPath(m, m.start.x, m.start.y, m.exit.x, m.exit.y);
  ok(p && p.length > 0, '第 ' + f + ' 层起点到出口可达');
  ok(m.spawns.length >= 4, '第 ' + f + ' 层有刷怪点，实际 ' + m.spawns.length);
  console.log(`  第 ${f} 层: ${m.rooms.length} 房间, ${m.spawns.length} 刷怪点, 路径长度 ${p ? p.length : 0}`);
}

/* ---------- 2. 寻路 ---------- */
section('寻路');
const m1 = MAP.generate(1, Math.random);
const p1 = MAP.findPath(m1, m1.start.x, m1.start.y, m1.exit.x, m1.exit.y);
let contiguous = true;
let cx = m1.start.x, cy = m1.start.y;
for (const step of p1) {
  if (Math.abs(step.x - cx) + Math.abs(step.y - cy) !== 1) contiguous = false;
  cx = step.x; cy = step.y;
}
ok(contiguous, '路径每一步都是相邻格');
ok(cx === m1.exit.x && cy === m1.exit.y, '路径终点是出口');

/* ---------- 3. 战斗模拟（10 分钟） ---------- */
section('战斗模拟 10 分钟');
CORE.setSeed(2026);
const st = CORE.createState();
const t0 = Date.now();
let deaths = 0, kills = 0, hitEvents = 0, swings = 0, aoeCounts = {}, loot = 0;
const steps = 6000; // 0.1s * 6000 = 600s
for (let i = 0; i < steps; i++) {
  const evs = CORE.tick(st, 0.1);
  for (let j = 0; j < evs.length; j++) {
    const e = evs[j];
    if (e.type === 'death') deaths++;
    else if (e.type === 'monsterDied') kills++;
    else if (e.type === 'hit') hitEvents++;
    else if (e.type === 'swing') { swings++; aoeCounts[e.count] = (aoeCounts[e.count] || 0) + 1; }
    else if (e.type === 'equip' || e.type === 'drop') loot++;
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
console.log(`  模拟耗时 ${elapsed}s`);
console.log(`  等级 ${st.player.level} | 层数 ${st.player.floor} | 击杀 ${st.player.kills} | 死亡 ${deaths} | 金币 ${Math.round(st.player.gold)}`);
console.log(`  挥砍 ${swings} 次，命中 ${hitEvents} 次，平均每次命中 ${(hitEvents / Math.max(1, swings)).toFixed(2)} 个目标`);
console.log(`  AOE 命中数分布:`, JSON.stringify(aoeCounts));
console.log(`  掉落/装备 ${loot} 件`);
ok(st.player.kills > 50, '10 分钟应击杀 50+ 只，实际 ' + st.player.kills);
ok(st.player.level > 5, '10 分钟应升到 5 级以上，实际 ' + st.player.level);
ok(hitEvents / Math.max(1, swings) > 1.2, 'AOE 应平均命中 1.2 个以上目标');
ok(st.player.floor >= 2, '10 分钟应至少推进到第 2 层，实际 ' + st.player.floor);

/* ---------- 4. 长时模拟（1 小时） ---------- */
section('战斗模拟 1 小时');
CORE.setSeed(777);
const st2 = CORE.createState();
const t1 = Date.now();
let deaths2 = 0;
for (let i = 0; i < 36000; i++) {
  const evs = CORE.tick(st2, 0.1);
  for (let j = 0; j < evs.length; j++) if (evs[j].type === 'death') deaths2++;
}
console.log(`  耗时 ${((Date.now() - t1) / 1000).toFixed(2)}s`);
console.log(`  等级 ${st2.player.level} | 层数 ${st2.player.floor}(最高 ${st2.player.bestFloor}) | 击杀 ${st2.player.kills} | 死亡 ${deaths2}`);
console.log(`  攻击 ${st2.stats.atk} | 血量 ${st2.stats.hpMax} | 怪物血量 ${Math.round(CORE.monsterHp(st2.player.floor))}`);
ok(st2.player.bestFloor >= 5, '1 小时应推进到第 5 层以上，实际 ' + st2.player.bestFloor);
ok(st2.player.level >= 15, '1 小时应至少 15 级，实际 ' + st2.player.level);

/* ---------- 5. 装备系统 ---------- */
section('装备系统');
CORE.setSeed(42);
for (const qKey of DATA.QUALITY_ORDER) {
  const q = DATA.QUALITY[qKey];
  const it = CORE.createItem('weapon', 10, qKey);
  ok(it.affixes.length >= q.affixes[0] && it.affixes.length <= q.affixes[1],
    qKey + ' 词条数应在 ' + q.affixes.join('~') + '，实际 ' + it.affixes.length);
}

section('宝箱与分解');
CORE.setSeed(555);
const st3 = CORE.createState();
st3.player.gold = 10000;
const chest = CORE.openChest(st3);
ok(chest.ok, '金币足够应能开箱');
ok(chest.item.quality !== 'normal', '宝箱保底魔法品质，实际 ' + chest.item.quality);
const st4 = CORE.createState();
st4.equip.weapon = CORE.createItem('weapon', 30, 'unique');
st4.stats = CORE.computeStats(st4);
for (let i = 0; i < 5; i++) st4.bag.push(CORE.createItem('weapon', 1, 'normal'));
const r = CORE.salvageWorse(st4);
ok(r.count === 5, '5 件低级武器应全被分解，实际 ' + r.count);

/* ---------- 结果 ---------- */
console.log('\n================================');
console.log(`测试结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
