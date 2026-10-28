const path = require('path');
const MAP = require(path.join(__dirname, '..', 'js', 'map.js'));
const CORE = require(path.join(__dirname, '..', 'js', 'core.js'));
CORE.setSeed(777);
const st = CORE.createState();
for (let i = 0; i < 30000; i++) CORE.tick(st, 0.1);
const r = st.run;
console.log('pos', r.pos, 'path', r.path.slice(0, 3), 'len', r.path.length);
const before = { x: r.pos.x, y: r.pos.y };
for (let k = 0; k < 5; k++) {
  CORE.tick(st, 0.1);
  console.log('frame', k, 'pos', r.pos.x.toFixed(2), r.pos.y.toFixed(2), 'path0', JSON.stringify(r.path[0]), 'len', r.path.length, 'thinkCd', r.thinkCd.toFixed(2));
}
console.log('map.start', r.map.start, 'exit', r.map.exit, 'tileAt pos', MAP.tileAt(r.map, Math.floor(r.pos.x), Math.floor(r.pos.y)));
console.log('path[0] walkable?', r.path[0] ? MAP.isWalkable(r.map, r.path[0].x, r.path[0].y) : 'n/a');
