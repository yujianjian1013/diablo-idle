/**
 * debug.cjs —— 排查卡死问题
 */
const path = require('path');
const MAP = require(path.join(__dirname, '..', 'js', 'map.js'));
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));

const seed = Number(process.argv[2] || 777);
CORE.setSeed(seed);
const st = CORE.createState();

let lastKills = 0;
for (let i = 0; i < 36000; i++) {
  CORE.tick(st, 0.1);
  if (i % 300 === 0) {
    const r = st.run;
    let alive = 0, nearest = null, nearestD = 1e9;
    for (const m of r.monsters) {
      if (!m.alive) continue;
      alive++;
      const d = CORE.dist(m, r.pos);
      if (d < nearestD) { nearestD = d; nearest = m; }
    }
    const sec = (i / 10).toFixed(0);
    if (i % 3000 === 0 || st.player.kills === lastKills) {
      console.log(`t=${sec}s floor=${st.player.floor} kills=${st.player.kills} 玩家(${r.pos.x.toFixed(1)},${r.pos.y.toFixed(1)}) 存活怪=${alive} 最近怪=${nearestD.toFixed(1)} path=${r.path.length} hp=${st.player.hp.toFixed(0)}`);
    }
    lastKills = st.player.kills;
  }
}

// 分析当前层：玩家和怪物是否在同一连通区域
const r = st.run;
const map = r.map;
console.log('\n--- 连通性分析 ---');
console.log('玩家格:', Math.floor(r.pos.x), Math.floor(r.pos.y));
const reachable = new Set();
const q = [[Math.floor(r.pos.x), Math.floor(r.pos.y)]];
reachable.add(q[0][0] + ',' + q[0][1]);
while (q.length) {
  const [x, y] = q.shift();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    const key = nx + ',' + ny;
    if (reachable.has(key)) continue;
    if (!MAP.isWalkable(map, nx, ny)) continue;
    reachable.add(key);
    q.push([nx, ny]);
  }
}
let unreachable = [];
for (const m of r.monsters) {
  if (!m.alive) continue;
  const key = Math.floor(m.x) + ',' + Math.floor(m.y);
  if (!reachable.has(key)) unreachable.push(key);
}
console.log('玩家可达格数:', reachable.size, '| 不可达怪物:', unreachable.length);
console.log('出口可达:', reachable.has(map.exit.x + ',' + map.exit.y));
