/**
 * map.js —— 等距地牢生成 + 寻路
 *
 * 地图数据用一维 Uint8Array 存 tiles（行优先），
 * 渲染层负责把格子坐标投影成等距屏幕坐标。
 */
(function (root) {
  'use strict';

  const TILE = { WALL: 0, FLOOR: 1, EXIT: 2 };
  const MAP_W = 34;
  const MAP_H = 34;

  /** 挖一条 L 形走廊（1 格宽） */
  function carveCorridor(tiles, w, x1, y1, x2, y2) {
    let x = x1, y = y1;
    tiles[y * w + x] = TILE.FLOOR;
    const horizFirst = ((x1 + y1) & 1) === 0;
    const stepX = function () {
      while (x !== x2) {
        x += x2 > x ? 1 : -1;
        tiles[y * w + x] = TILE.FLOOR;
      }
    };
    const stepY = function () {
      while (y !== y2) {
        y += y2 > y ? 1 : -1;
        tiles[y * w + x] = TILE.FLOOR;
      }
    };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  }

  /**
   * 生成一层地牢
   * @param {number} floor 层数
   * @param {Function} rnd 0~1 随机函数，便于测试时固定种子
   */
  function generate(floor, rnd) {
    const rand = rnd || Math.random;
    const rint = function (a, b) { return a + Math.floor(rand() * (b - a + 1)); };

    const w = MAP_W, h = MAP_H;
    const tiles = new Uint8Array(w * h);      // 0 = 墙
    const explored = new Uint8Array(w * h);

    // 1. 随机房间（互不重叠，留 1 格间隔）
    const rooms = [];
    const targetRooms = 7 + Math.min(3, Math.floor(floor / 3));
    for (let attempt = 0; attempt < 160 && rooms.length < targetRooms; attempt++) {
      const rw = rint(5, 9);
      const rh = rint(5, 9);
      const rx = rint(1, w - rw - 2);
      const ry = rint(1, h - rh - 2);
      let overlap = false;
      for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i];
        if (rx < r.x + r.w + 1 && rx + rw + 1 > r.x &&
            ry < r.y + r.h + 1 && ry + rh + 1 > r.y) { overlap = true; break; }
      }
      if (overlap) continue;
      rooms.push({
        x: rx, y: ry, w: rw, h: rh,
        cx: rx + (rw >> 1), cy: ry + (rh >> 1),
        cleared: false,
      });
    }

    // 至少保证两个房间，极端情况下退化成一个大厅
    if (rooms.length < 2) {
      rooms.length = 0;
      rooms.push({ x: 4, y: 4, w: 12, h: 10, cx: 10, cy: 9, cleared: false });
      rooms.push({ x: 18, y: 18, w: 10, h: 10, cx: 23, cy: 23, cleared: false });
    }

    // 2. 挖出房间
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) tiles[y * w + x] = TILE.FLOOR;
      }
    }

    // 3. 顺序连接房间，保证整层连通
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i - 1], b = rooms[i];
      carveCorridor(tiles, w, a.cx, a.cy, b.cx, b.cy);
    }

    // 4. 终点房 = 离起点最远的房间（保证 BOSS 不在出生点旁边）
    if (rooms.length > 2) {
      let farIdx = 1, farD = -1;
      for (let i = 1; i < rooms.length; i++) {
        const d = Math.abs(rooms[i].cx - rooms[0].cx) + Math.abs(rooms[i].cy - rooms[0].cy);
        if (d > farD) { farD = d; farIdx = i; }
      }
      const tmp = rooms[farIdx];
      rooms[farIdx] = rooms[rooms.length - 1];
      rooms[rooms.length - 1] = tmp;
    }

    // 5. 起点与出口
    const start = { x: rooms[0].cx, y: rooms[0].cy };
    const last = rooms[rooms.length - 1];
    const exit = { x: last.cx, y: last.cy };
    tiles[exit.y * w + exit.x] = TILE.EXIT;

    // 6. 刷怪点：每个房间随机若干地板格
    const spawns = [];
    for (let ri = 1; ri < rooms.length; ri++) {
      const r = rooms[ri];
      const count = (ri === rooms.length - 1) ? 1 : rint(3, 6);
      const used = {};
      for (let k = 0; k < count; k++) {
        let x = 0, y = 0, guard = 0;
        do {
          x = rint(r.x, r.x + r.w - 1);
          y = rint(r.y, r.y + r.h - 1);
          guard++;
        } while (guard < 40 && (tiles[y * w + x] !== TILE.FLOOR || used[y * w + x]));
        if (tiles[y * w + x] !== TILE.FLOOR) continue;
        used[y * w + x] = true;
        spawns.push({ x: x, y: y, room: ri, boss: ri === rooms.length - 1 });
      }
    }

    return {
      w: w, h: h,
      tiles: tiles,
      explored: explored,
      rooms: rooms,
      start: start,
      exit: exit,
      spawns: spawns,
      floor: floor,
    };
  }

  function idxOf(map, x, y) { return y * map.w + x; }

  function inBounds(map, x, y) {
    return x >= 0 && y >= 0 && x < map.w && y < map.h;
  }

  function tileAt(map, x, y) {
    if (!inBounds(map, x, y)) return TILE.WALL;
    return map.tiles[y * map.w + x];
  }

  function isWalkable(map, x, y) {
    const t = tileAt(map, x, y);
    return t === TILE.FLOOR || t === TILE.EXIT;
  }

  /** 网格坐标四舍五入到最近格 */
  function toTile(v) { return Math.floor(v); }

  /**
   * BFS 寻路，返回 [{x,y}, ...]（不含起点），不可达返回 null
   */
  function findPath(map, sx, sy, tx, ty) {
    sx = Math.floor(sx); sy = Math.floor(sy);
    tx = Math.floor(tx); ty = Math.floor(ty);
    if (sx === tx && sy === ty) return [];
    if (!isWalkable(map, tx, ty) || !isWalkable(map, sx, sy)) return null;

    const w = map.w, h = map.h;
    const total = w * h;
    const prev = new Int32Array(total).fill(-2);
    const queue = new Int32Array(total);
    let head = 0, tail = 0;
    const s = sy * w + sx;
    prev[s] = -1;
    queue[tail++] = s;

    const dx = [1, -1, 0, 0];
    const dy = [0, 0, 1, -1];
    let found = false;

    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % w;
      const cy = (cur / w) | 0;
      if (cx === tx && cy === ty) { found = true; break; }
      for (let i = 0; i < 4; i++) {
        const nx = cx + dx[i], ny = cy + dy[i];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (prev[ni] !== -2) continue;
        if (map.tiles[ni] === TILE.WALL) continue;
        prev[ni] = cur;
        queue[tail++] = ni;
      }
    }
    if (!found) return null;

    const path = [];
    let cur = ty * w + tx;
    while (cur !== -1 && cur !== s) {
      path.push({ x: cur % w, y: (cur / w) | 0 });
      cur = prev[cur];
    }
    path.reverse();
    return path;
  }

  /** 圆形范围标记已探索 */
  function reveal(map, cx, cy, radius) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(map.w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(map.h - 1, Math.ceil(cy + radius));
    const r2 = radius * radius;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) map.explored[y * map.w + x] = 1;
      }
    }
  }

  function exploredRatio(map) {
    let total = 0, seen = 0;
    for (let i = 0; i < map.tiles.length; i++) {
      if (map.tiles[i] !== TILE.WALL) {
        total++;
        if (map.explored[i]) seen++;
      }
    }
    return total === 0 ? 0 : seen / total;
  }

  const API = {
    TILE: TILE,
    MAP_W: MAP_W,
    MAP_H: MAP_H,
    generate: generate,
    tileAt: tileAt,
    isWalkable: isWalkable,
    toTile: toTile,
    findPath: findPath,
    reveal: reveal,
    exploredRatio: exploredRatio,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.MAP = API;
})(typeof window !== 'undefined' ? window : globalThis);
