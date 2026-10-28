/**
 * core.js —— 核心玩法逻辑（v2：等距地牢 + 多单位战斗）
 *
 * 与 v1 的区别：
 * - 不再是 1v1，而是一张地牢地图上的多只怪物
 * - 角色在地图上自动移动、自动寻路、自动探索
 * - 攻击是范围 AOE，一次打中攻击半径内所有敌人
 *
 * 纯逻辑，不碰 DOM，可在 Node 中测试。
 */
(function (root) {
  'use strict';

  const DATA = root.DATA || (typeof require === 'function' ? require('./data.js') : null);
  const MAP = root.MAP || (typeof require === 'function' ? require('./map.js') : null);
  if (!DATA || !MAP) throw new Error('core.js 需要先加载 data.js 与 map.js');

  /* ==================== 随机数 ==================== */
  let _seed = (Math.random() * 1e9) >>> 0;
  function setSeed(s) { _seed = s >>> 0; }
  function rng() {
    _seed = (_seed + 0x6D2B79F5) >>> 0;
    let t = _seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rnd(a, b) { return a + rng() * (b - a); }
  function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(list) { return list[Math.floor(rng() * list.length)]; }
  function weightedPick(list) {
    let total = 0;
    for (let i = 0; i < list.length; i++) total += list[i].weight;
    let r = rng() * total;
    for (let i = 0; i < list.length; i++) {
      r -= list[i].weight;
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  /* ==================== 常量 ==================== */
  const VERSION = 2;
  const SAVE_KEY = 'diablo_idle_save_v2';

  const BASE = { atk: 8, hp: 100, def: 0, crit: 5, critDmg: 150 };
  const PLAYER_ATK_INTERVAL = 0.9;
  const PLAYER_ATTACK_RANGE = 2.25;   // 玩家挥砍半径（格）
  const MONSTER_ATTACK_RANGE = 1.25;  // 怪物近战半径
  const MONSTER_ATK_INTERVAL = 1.7;
  const MONSTER_AGGRO_RANGE = 9;      // 仇恨范围
  const PLAYER_SPEED = 3.4;           // 格 / 秒
  const MONSTER_SPEED = 1.7;
  const ATTACK_VARIANCE = 0.12;
  const REGEN_PER_SEC = 0.004;
  const REPATH_INTERVAL = 0.35;

  /* ==================== 成长曲线 ==================== */
  function expToNext(level) { return Math.floor(20 * Math.pow(1.30, level - 1)); }
  function playerBaseAtk(level) { return BASE.atk + (level - 1) * 2.6; }
  function playerBaseHp(level) { return BASE.hp + (level - 1) * 20; }
  function monsterHp(floor) { return 30 * Math.pow(1.16, floor - 1); }
  function monsterAtk(floor) { return 1.4 * Math.pow(1.125, floor - 1); }
  function monsterExp(floor) { return 9 * Math.pow(1.15, floor - 1); }
  function monsterGold(floor) { return 2.2 * Math.pow(1.14, floor - 1); }

  const QUALITY_MULT = { normal: 1.0, magic: 1.15, rare: 1.32, legendary: 1.5, unique: 1.75 };

  /* ==================== 主动技能 ==================== */
  const SKILLS = {
    whirlwind: { key: '1', name: '旋风斩', cd: 9,  desc: '对 3.6 格内所有敌人造成 260% 伤害' },
    charge:    { key: '2', name: '冲锋',   cd: 14, desc: '冲向目标并击伤路径上的敌人（180%）' },
    berserk:   { key: '3', name: '狂暴',   cd: 26, desc: '8 秒内攻速 +80%、攻击力 +35%' },
  };
  const BERSERK_DURATION = 8;
  const BERSERK_ATK_MUL = 1.35;
  const BERSERK_SPEED_MUL = 1.8;

  /* ==================== 装备 ==================== */
  function rollQuality(magicFind) {
    const mf = 1 + (magicFind || 0) / 100;
    const list = DATA.QUALITY_ORDER.map(function (k) {
      const q = DATA.QUALITY[k];
      const w = k === 'normal' ? q.weight : q.weight * (k === 'unique' ? 1 + (mf - 1) * 0.6 : mf);
      return { key: k, weight: w };
    });
    return weightedPick(list).key;
  }

  function affixValue(key, ilvl, qMult) {
    const a = DATA.AFFIXES[key];
    const base = rnd(a.base[0], a.base[1]);
    let v;
    if (a.pct) {
      v = base * (1 + Math.max(0, ilvl - 1) * 0.03) * (qMult || 1);
      v = Math.round(v * 10) / 10;
    } else {
      v = base * Math.pow(1.14, Math.max(0, ilvl - 1)) * (qMult || 1);
      v = Math.max(1, Math.round(v));
    }
    return v;
  }

  let _itemId = 1;
  function createItem(slotKey, ilvl, forcedQuality) {
    const qKey = forcedQuality || rollQuality(0);
    const q = DATA.QUALITY[qKey];
    const qMult = QUALITY_MULT[qKey] || 1;
    const count = rndInt(q.affixes[0], q.affixes[1]);
    const pool = DATA.AFFIX_KEYS.slice();
    const affixes = [];
    for (let i = 0; i < count && pool.length; i++) {
      const weighted = pool.map(function (k) { return { key: k, weight: DATA.AFFIXES[k].weight }; });
      const chosen = weightedPick(weighted).key;
      pool.splice(pool.indexOf(chosen), 1);
      affixes.push({ key: chosen, value: affixValue(chosen, ilvl, qMult) });
    }
    affixes.sort(function (a, b) { return DATA.AFFIXES[a.key].weight - DATA.AFFIXES[b.key].weight; });
    const item = {
      id: _itemId++,
      slot: slotKey,
      quality: qKey,
      ilvl: ilvl,
      enhance: 0,
      affixes: affixes,
      name: makeItemName(slotKey, qKey, affixes),
    };
    item.score = itemScore(item);
    return item;
  }

  function makeItemName(slotKey, qKey, affixes) {
    const base = pick(DATA.BASE_NAMES[slotKey] || ['物品']);
    if (qKey === 'unique') {
      const names = DATA.UNIQUE_NAMES[slotKey];
      return names ? pick(names) : '传说中的' + base;
    }
    const main = affixes[0];
    const first = main ? pick(DATA.AFFIXES[main.key].prefix) : '';
    if (qKey === 'legendary') {
      const suffix = pick(['· 裁决', '· 血誓', '· 天启', '· 黄昏', '· 破晓']);
      return (first || '远古的') + base + suffix;
    }
    if (qKey === 'rare') {
      const last = affixes.length > 1 ? pick(DATA.AFFIXES[affixes[1].key].suffix) : '';
      return first + base + last;
    }
    if (qKey === 'magic') return first + base;
    return base;
  }

  function itemScore(item) {
    const W = {
      atk: 3.2, def: 2.0, hp: 0.42, crit: 7, critDmg: 2.6,
      atkSpeed: 6.5, lifesteal: 13, goldFind: 0.8, magicFind: 1.6,
    };
    let s = 0;
    for (let i = 0; i < item.affixes.length; i++) {
      const a = item.affixes[i];
      s += a.value * (W[a.key] || 1);
    }
    return Math.round(s * (1 + (item.enhance || 0) * 0.1) * 10) / 10;
  }

  function equippedScore(state, slotKey) {
    const it = state.equip[slotKey];
    return it ? it.score : 0;
  }

  /* ==================== 属性 ==================== */
  function computeStats(state) {
    const p = state.player;
    const s = {
      atk: playerBaseAtk(p.level),
      hpMax: playerBaseHp(p.level),
      def: 0, crit: BASE.crit, critDmg: BASE.critDmg,
      atkSpeedPct: 0, lifesteal: 0, goldFind: 0, magicFind: 0,
    };
    for (let i = 0; i < DATA.SLOT_KEYS.length; i++) {
      const it = state.equip[DATA.SLOT_KEYS[i]];
      if (!it) continue;
      const enh = 1 + (it.enhance || 0) * 0.1;
      for (let j = 0; j < it.affixes.length; j++) {
        const a = it.affixes[j];
        const v = a.value * enh;
        switch (a.key) {
          case 'atk': s.atk += v; break;
          case 'def': s.def += v; break;
          case 'hp': s.hpMax += v; break;
          case 'crit': s.crit += v; break;
          case 'critDmg': s.critDmg += v; break;
          case 'atkSpeed': s.atkSpeedPct += v; break;
          case 'lifesteal': s.lifesteal += v; break;
          case 'goldFind': s.goldFind += v; break;
          case 'magicFind': s.magicFind += v; break;
        }
      }
    }
    s.atk = Math.round(s.atk * 10) / 10;
    s.hpMax = Math.round(s.hpMax);
    s.def = Math.round(s.def * 10) / 10;
    s.crit = Math.min(75, Math.round(s.crit * 10) / 10);
    s.critDmg = Math.round(s.critDmg);
    s.lifesteal = Math.min(30, Math.round(s.lifesteal * 10) / 10);
    s.attackInterval = PLAYER_ATK_INTERVAL / (1 + s.atkSpeedPct / 100);
    return s;
  }

  /* ==================== 怪物 ==================== */
  function createMonster(floor, x, y, isBoss) {
    let tpl;
    if (isBoss) {
      tpl = DATA.BOSSES[(floor - 1) % DATA.BOSSES.length] || DATA.BOSSES[0];
    } else {
      const unlocked = Math.min(DATA.MONSTERS.length, 3 + Math.floor(floor / 4));
      tpl = weightedPick(DATA.MONSTERS.slice(0, unlocked));
    }
    // 12% 概率出现精英怪：更硬、更疼、必掉装备
    const isElite = !isBoss && rng() < 0.12;
    const hp = monsterHp(floor) * (isBoss ? 9 : 1) * (isElite ? 2.6 : 1);
    return {
      id: _itemId++,
      x: x, y: y,
      hp: Math.round(hp),
      hpMax: Math.round(hp),
      atk: Math.round(monsterAtk(floor) * (isBoss ? 2.2 : 1) * (isElite ? 1.3 : 1) * 10) / 10,
      isElite: isElite,
      name: tpl.name,
      shape: tpl.shape,
      color: tpl.color,
      isBoss: !!isBoss,
      alive: true,
      atkCd: rnd(0.6, 1.6),
      path: [],
      pathGoal: null,
      repathCd: 0,
      hurtT: 0,
      attackAnim: 0,
    };
  }

  function floorName(floor) {
    return DATA.FLOOR_NAMES[(floor - 1) % DATA.FLOOR_NAMES.length];
  }

  /* ==================== 状态 ==================== */
  function emptyEquip() {
    const e = {};
    for (let i = 0; i < DATA.SLOT_KEYS.length; i++) e[DATA.SLOT_KEYS[i]] = null;
    return e;
  }

  function createState() {
    const state = {
      version: VERSION,
      player: {
        level: 1, exp: 0, expNext: expToNext(1), hp: 100,
        gold: 0, floor: 1, kills: 0, deaths: 0, bestFloor: 1,
      },
      equip: emptyEquip(),
      bag: [],
      mode: { autoEquip: true, autoSell: true },
      log: [],
      lastSave: Date.now(),
      stats: null,
      run: null,
    };
    state.stats = computeStats(state);
    state.player.hp = state.stats.hpMax;
    enterFloor(state, 1);
    pushLog(state, '你踏入「' + floorName(1) + '」，火把在石壁上摇曳。', '');
    return state;
  }

  /** 进入某一层：生成地图、放置怪物、把角色放到入口 */
  function enterFloor(state, floor) {
    const map = MAP.generate(floor, rng);
    const run = {
      map: map,
      pos: { x: map.start.x + 0.5, y: map.start.y + 0.5 },
      path: [],
      pathGoal: null,
      monsters: [],
      attackCd: 0.4,
      thinkCd: 0,
      swingT: 0,
      swingX: 0,
      swingY: 0,
      boss: null,
      target: null,
      blacklist: {},
      skills: { whirlwind: 0, charge: 0, berserk: 0 },
      buffs: { berserk: 0 },
    };
    for (let i = 0; i < map.spawns.length; i++) {
      const sp = map.spawns[i];
      const m = createMonster(floor, sp.x + 0.5, sp.y + 0.5, sp.boss);
      run.monsters.push(m);
      if (sp.boss) run.boss = m;
    }
    state.run = run;
    state.player.floor = floor;
    state.player.bestFloor = Math.max(state.player.bestFloor, floor);
    state.player.hp = state.stats.hpMax;
    MAP.reveal(map, run.pos.x, run.pos.y, 6);
    return run;
  }

  function pushLog(state, text, cls) {
    state.log.unshift({ text: text, cls: cls || '', t: Date.now() });
    if (state.log.length > 60) state.log.length = 60;
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ==================== 战斗 ==================== */
  function rollDamage(atk, critChance, critDmg) {
    const crit = rng() * 100 < critChance;
    let dmg = atk * (1 + rnd(-ATTACK_VARIANCE, ATTACK_VARIANCE));
    if (crit) dmg *= critDmg / 100;
    return { dmg: Math.max(1, Math.round(dmg)), crit: crit };
  }

  function gainExp(state, amount, events) {
    const p = state.player;
    p.exp += amount;
    while (p.exp >= p.expNext) {
      p.exp -= p.expNext;
      p.level += 1;
      p.expNext = expToNext(p.level);
      state.stats = computeStats(state);
      p.hp = state.stats.hpMax;
      pushLog(state, '升到 ' + p.level + ' 级！', 'log-levelup');
      events.push({ type: 'levelUp', level: p.level });
    }
  }

  function dropItem(state, floor) {
    const slot = pick(DATA.SLOT_KEYS);
    const ilvl = Math.max(1, floor + rndInt(-1, 1));
    return createItem(slot, Math.max(1, ilvl), rollQuality(state.stats.magicFind));
  }

  function sellItem(state, item, events, silent) {
    const price = Math.max(1, Math.round(item.ilvl * 4 + item.score * 0.6 + (DATA.QUALITY_ORDER.indexOf(item.quality) + 1) * 8));
    state.player.gold += price;
    if (!silent) pushLog(state, '出售 ' + item.name + '，+' + price + ' 金币', 'log-gold');
    events.push({ type: 'sell', item: item, gold: price });
    return price;
  }

  function handleDrop(state, item, events) {
    const cur = state.equip[item.slot];
    const better = cur ? item.score > cur.score : item.score > 0;
    if (state.mode.autoEquip && better) {
      if (cur) sellItem(state, cur, events, true);
      state.equip[item.slot] = item;
      state.stats = computeStats(state);
      state.player.hp = Math.min(state.player.hp, state.stats.hpMax);
      pushLog(state, '装备 ' + item.name + '（战力 ' + item.score + '）', 'log-' + item.quality);
      events.push({ type: 'equip', item: item });
      return;
    }
    if (item.score <= 0 && state.mode.autoSell) {
      sellItem(state, item, events, true);
      return;
    }
    state.bag.push(item);
    if (state.bag.length > 40) sellItem(state, state.bag.shift(), events, true);
    pushLog(state, '拾取 ' + item.name, 'log-' + item.quality);
    events.push({ type: 'drop', item: item });
  }

  /* ---------- 玩家 AI ---------- */
  function nearestMonster(run, range, blacklist, penalizeBoss) {
    let best = null, bestD = range;
    for (let i = 0; i < run.monsters.length; i++) {
      const m = run.monsters[i];
      if (!m.alive) continue;
      if (blacklist && blacklist[m.id]) continue;
      const d = dist(m, run.pos) + (penalizeBoss && m.isBoss ? 9 : 0);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best ? { monster: best, dist: bestD } : null;
  }

  function playerThink(state) {
    const r = state.run;
    const p = r.pos;

    // 1. 攻击范围内有怪：停下来打
    if (nearestMonster(r, PLAYER_ATTACK_RANGE)) { r.path = []; return; }

    // 2. 目标锁定：只有目标死亡 / 不可达时才换目标，避免在两只怪之间来回震荡
    let target = r.target;
    if (!target || !target.alive || r.blacklist[target.id]) {
      const near = nearestMonster(r, 999, r.blacklist, true);
      target = near ? near.monster : null;
      r.target = target;
      r.path = [];
    }

    if (target) {
      // 只有路径走完才重新寻路
      if (!r.path.length) {
        const path = MAP.findPath(r.map, p.x, p.y, target.x, target.y);
        if (path === null) {
          r.blacklist[target.id] = true;
          r.target = null;
          return;
        }
        if (path.length) r.path = path;
      }
      return;
    }

    // 3. 全清干净了：去出口
    if (!r.path.length) {
      const path = MAP.findPath(r.map, p.x, p.y, r.map.exit.x, r.map.exit.y);
      if (path) r.path = path;
    }
  }

  function moveAlong(state, dt) {
    const r = state.run;
    let remain = PLAYER_SPEED * dt;
    let guard = 0;
    while (remain > 1e-6 && r.path.length && guard++ < 40) {
      const next = r.path[0];
      const tx = next.x + 0.5, ty = next.y + 0.5;
      const dx = tx - r.pos.x, dy = ty - r.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= remain) {
        r.pos.x = tx; r.pos.y = ty;
        r.path.shift();
        remain -= d;
        MAP.reveal(r.map, r.pos.x, r.pos.y, 5);
      } else {
        r.pos.x += (dx / d) * remain;
        r.pos.y += (dy / d) * remain;
        remain = 0;
      }
    }
  }

  /** 玩家挥砍：攻击半径内所有怪物 */
  function playerSwing(state, events) {
    const r = state.run;
    const s = state.stats;
    const targets = [];
    for (let i = 0; i < r.monsters.length; i++) {
      const m = r.monsters[i];
      if (!m.alive) continue;
      if (dist(m, r.pos) <= PLAYER_ATTACK_RANGE) targets.push(m);
    }
    if (!targets.length) return false;

    r.swingT = 0.32;
    r.swingX = r.pos.x;
    r.swingY = r.pos.y;
    events.push({ type: 'swing', x: r.pos.x, y: r.pos.y, count: targets.length });

    const atkMul = (r.buffs && r.buffs.berserk > 0) ? BERSERK_ATK_MUL : 1;
    let totalLeech = 0;
    for (let i = 0; i < targets.length; i++) {
      const m = targets[i];
      const hit = rollDamage(s.atk * atkMul, s.crit, s.critDmg);
      m.hp -= hit.dmg;
      m.hurtT = 0.25;
      totalLeech += hit.dmg;
      events.push({ type: 'hit', monster: m, dmg: hit.dmg, crit: hit.crit });
      if (m.hp <= 0) killMonster(state, m, events);
    }
    if (s.lifesteal > 0 && totalLeech > 0) {
      state.player.hp = Math.min(s.hpMax, state.player.hp + totalLeech * s.lifesteal / 100);
    }
    return true;
  }

  function killMonster(state, m, events) {
    m.alive = false;
    m.hp = 0;
    const p = state.player;
    const gold = Math.round(monsterGold(p.floor) * (1 + state.stats.goldFind / 100) * (m.isBoss ? 10 : 1));
    const exp = Math.round(monsterExp(p.floor) * (m.isBoss ? 7 : 1));
    p.gold += gold;
    p.kills += 1;
    gainExp(state, exp, events);
    p.hp = Math.min(state.stats.hpMax, p.hp + state.stats.hpMax * 0.05);

    events.push({ type: 'monsterDied', monster: m, gold: gold, exp: exp });

    const dropChance = (m.isBoss || m.isElite) ? 1 : 0.16 + state.stats.magicFind / 1000;
    const dropCount = m.isBoss ? rndInt(2, 3) : (m.isElite ? 1 : (rng() < dropChance ? 1 : 0));
    for (let i = 0; i < dropCount; i++) {
      const item = dropItem(state, p.floor);
      events.push({ type: 'drop', item: item, x: m.x, y: m.y });
      handleDrop(state, item, events);
    }
  }

  /** 释放主动技能，返回事件数组（失败返回 null 且不进入冷却） */
  function useSkill(state, key) {
    const r = state.run;
    if (!r || !SKILLS[key]) return null;
    if (r.skills && r.skills[key] > 0) return null;

    const s = state.stats;
    const p = r.pos;
    const events = [];

    if (key === 'whirlwind') {
      const RAD = 3.6;
      let n = 0;
      for (let i = 0; i < r.monsters.length; i++) {
        const m = r.monsters[i];
        if (!m.alive) continue;
        if (dist(m, p) > RAD) continue;
        const hit = rollDamage(s.atk * 2.6, s.crit, s.critDmg);
        m.hp -= hit.dmg;
        m.hurtT = 0.25;
        n++;
        events.push({ type: 'hit', monster: m, dmg: hit.dmg, crit: hit.crit, skill: true });
        if (m.hp <= 0) killMonster(state, m, events);
      }
      events.push({ type: 'skill', key: key, x: p.x, y: p.y, radius: RAD, count: n });

    } else if (key === 'charge') {
      const near = nearestMonster(r, 12, r.blacklist, true);
      if (!near) return null;
      const t = near.monster;
      const dx = t.x - p.x, dy = t.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const travel = Math.min(4, Math.max(0, d - 1.3));
      let moved = false;
      if (travel > 0.2) {
        const nx = p.x + (dx / d) * travel;
        const ny = p.y + (dy / d) * travel;
        if (MAP.isWalkable(r.map, Math.floor(nx), Math.floor(ny))) {
          p.x = nx;
          p.y = ny;
          r.path = [];
          r.target = t;
          MAP.reveal(r.map, p.x, p.y, 5);
          moved = true;
        }
      }
      let n = 0;
      for (let i = 0; i < r.monsters.length; i++) {
        const m = r.monsters[i];
        if (!m.alive) continue;
        if (dist(m, p) > 2.3) continue;
        const hit = rollDamage(s.atk * 1.8, s.crit, s.critDmg);
        m.hp -= hit.dmg;
        m.hurtT = 0.25;
        n++;
        events.push({ type: 'hit', monster: m, dmg: hit.dmg, crit: hit.crit, skill: true });
        if (m.hp <= 0) killMonster(state, m, events);
      }
      events.push({ type: 'skill', key: key, x: p.x, y: p.y, radius: 2.3, count: n, moved: moved });

    } else if (key === 'berserk') {
      r.buffs.berserk = BERSERK_DURATION;
      events.push({ type: 'skill', key: key, x: p.x, y: p.y, duration: BERSERK_DURATION });
    }

    r.skills[key] = SKILLS[key].cd;
    return events;
  }

  /* ---------- 怪物 AI ---------- */
  function moveMonster(state, m, dt) {
    const r = state.run;
    m.repathCd -= dt;
    if (m.repathCd <= 0) {
      m.repathCd = REPATH_INTERVAL + rng() * 0.2;
      const path = MAP.findPath(r.map, m.x, m.y, r.pos.x, r.pos.y);
      if (path) m.path = path;
    }
    if (!m.path.length) return;
    let remain = MONSTER_SPEED * dt;
    let guard = 0;
    while (remain > 1e-6 && m.path.length && guard++ < 20) {
      const next = m.path[0];
      const tx = next.x + 0.5, ty = next.y + 0.5;
      const dx = tx - m.x, dy = ty - m.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= remain) {
        m.x = tx; m.y = ty;
        m.path.shift();
        remain -= d;
      } else {
        m.x += (dx / d) * remain;
        m.y += (dy / d) * remain;
        remain = 0;
      }
    }
  }

  function monsterAttack(state, m, events) {
    const s = state.stats;
    const reduce = s.def / (s.def + 26 + state.player.floor * 5);
    let dmg = m.atk * (1 - reduce) * (1 + rnd(-0.1, 0.1));
    dmg = Math.max(1, Math.round(dmg));
    state.player.hp -= dmg;
    m.attackAnim = 0.3;
    events.push({ type: 'playerHurt', dmg: dmg, source: m });
  }

  function playerDies(state, events) {
    const p = state.player;
    p.deaths += 1;
    p.hp = state.stats.hpMax;
    const r = state.run;
    r.pos.x = r.map.start.x + 0.5;
    r.pos.y = r.map.start.y + 0.5;
    r.path = [];
    r.target = null;
    for (let i = 0; i < r.monsters.length; i++) {
      const m = r.monsters[i];
      if (m.alive) m.path = [];
    }
    pushLog(state, '你被击倒，在入口处苏醒。', 'log-death');
    events.push({ type: 'death' });
  }

  /* ---------- 到达出口 ---------- */
  function checkExit(state, events) {
    const r = state.run;
    const ex = r.map.exit;
    const d = dist(r.pos, { x: ex.x + 0.5, y: ex.y + 0.5 });
    if (d > 0.7) return;
    const alive = r.monsters.some(function (m) { return m.alive; });
    if (alive) return;

    const next = state.player.floor + 1;
    enterFloor(state, next);
    pushLog(state, '进入第 ' + next + ' 层「' + floorName(next) + '」', 'log-boss');
    events.push({ type: 'floorUp', floor: next });
  }

  /* ==================== 主循环 ==================== */
  function tick(state, dt) {
    const events = [];
    if (!isFinite(dt) || dt <= 0) return events;
    dt = Math.min(dt, 1);

    if (!state.run) enterFloor(state, state.player.floor || 1);
    const r = state.run;
    const s = state.stats;

    // 玩家思考
    r.thinkCd -= dt;
    if (r.thinkCd <= 0) {
      r.thinkCd = 0.28;
      playerThink(state);
    }

    // 玩家移动
    moveAlong(state, dt);
    if (r.swingT > 0) r.swingT = Math.max(0, r.swingT - dt);

    // 技能冷却与 buff
    if (r.skills) {
      for (const k in r.skills) if (r.skills[k] > 0) r.skills[k] = Math.max(0, r.skills[k] - dt);
    } else {
      r.skills = { whirlwind: 0, charge: 0, berserk: 0 };
    }
    if (!r.buffs) r.buffs = { berserk: 0 };
    if (r.buffs.berserk > 0) r.buffs.berserk = Math.max(0, r.buffs.berserk - dt);

    // 玩家攻击
    r.attackCd -= dt;
    if (r.attackCd <= 0 && nearestMonster(r, PLAYER_ATTACK_RANGE)) {
      if (playerSwing(state, events)) {
        const berserk = r.buffs.berserk > 0;
        r.attackCd = s.attackInterval / (berserk ? BERSERK_SPEED_MUL : 1);
      }
    }

    // 怪物
    let aliveCount = 0;
    for (let i = 0; i < r.monsters.length; i++) {
      const m = r.monsters[i];
      if (!m.alive) continue;
      aliveCount++;
      if (m.hurtT > 0) m.hurtT -= dt;
      if (m.attackAnim > 0) m.attackAnim -= dt;

      const d = dist(m, r.pos);
      if (d > MONSTER_AGGRO_RANGE) continue;

      if (d > MONSTER_ATTACK_RANGE) {
        moveMonster(state, m, dt);
      } else {
        m.path = [];
        m.atkCd -= dt;
        if (m.atkCd <= 0) {
          m.atkCd = MONSTER_ATK_INTERVAL;
          monsterAttack(state, m, events);
        }
      }
    }

    // 死亡判定
    if (state.player.hp <= 0) playerDies(state, events);

    // 自然回血
    if (state.player.hp > 0) {
      state.player.hp = Math.min(s.hpMax, state.player.hp + s.hpMax * REGEN_PER_SEC * dt);
    }

    // 出口
    if (aliveCount === 0) checkExit(state, events);

    return events;
  }

  /* ==================== 装备操作 ==================== */
  function equipFromBag(state, itemId) {
    const idx = state.bag.findIndex(function (it) { return it.id === itemId; });
    if (idx < 0) return false;
    const item = state.bag[idx];
    const cur = state.equip[item.slot];
    state.bag.splice(idx, 1);
    if (cur) state.bag.push(cur);
    state.equip[item.slot] = item;
    state.stats = computeStats(state);
    state.player.hp = Math.min(state.player.hp, state.stats.hpMax);
    return true;
  }

  function sellFromBag(state, itemId) {
    const idx = state.bag.findIndex(function (it) { return it.id === itemId; });
    if (idx < 0) return 0;
    const item = state.bag[idx];
    state.bag.splice(idx, 1);
    return sellItem(state, item, [], false);
  }

  function salvageWorse(state) {
    const events = [];
    let count = 0, gold = 0;
    const keep = [];
    for (let i = 0; i < state.bag.length; i++) {
      const it = state.bag[i];
      if (it.score <= equippedScore(state, it.slot)) {
        gold += sellItem(state, it, events, true);
        count += 1;
      } else {
        keep.push(it);
      }
    }
    state.bag = keep;
    if (count > 0) pushLog(state, '分解 ' + count + ' 件垃圾装备，+' + gold + ' 金币', 'log-gold');
    return { count: count, gold: gold };
  }

  function chestPrice(floor) { return Math.round(80 * Math.pow(1.12, floor - 1)); }

  function openChest(state) {
    const price = chestPrice(state.player.floor);
    if (state.player.gold < price) return { ok: false, price: price };
    state.player.gold -= price;
    const events = [];
    const slot = pick(DATA.SLOT_KEYS);
    let q = rollQuality(state.stats.magicFind + 60);
    if (q === 'normal') q = 'magic';
    const item = createItem(slot, state.player.floor + 1, q);
    handleDrop(state, item, events);
    return { ok: true, item: item, price: price, events: events };
  }

  /* ==================== 存档 ==================== */
  function serialize(state) {
    return {
      version: VERSION,
      player: state.player,
      equip: state.equip,
      bag: state.bag,
      mode: state.mode,
      log: state.log.slice(0, 30),
      lastSave: Date.now(),
      itemId: _itemId,
    };
  }

  function save(state) {
    try {
      const data = serialize(state);
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      state.lastSave = data.lastSave;
      return true;
    } catch (e) { return false; }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== VERSION) return null;
      const state = createState();
      state.player = Object.assign(state.player, data.player || {});
      state.equip = Object.assign(emptyEquip(), data.equip || {});
      state.bag = Array.isArray(data.bag) ? data.bag : [];
      state.mode = Object.assign(state.mode, data.mode || {});
      state.log = Array.isArray(data.log) ? data.log : [];
      state.lastSave = data.lastSave || Date.now();
      _itemId = Math.max(data.itemId || 1, 1);
      state.stats = computeStats(state);
      state.player.expNext = expToNext(state.player.level);
      enterFloor(state, state.player.floor || 1);
      state.player.hp = state.stats.hpMax;
      return state;
    } catch (e) { return null; }
  }

  function resetSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  /** 离线结算：按当前战力估算挂机收益 */
  function settleOffline(state) {
    const elapsed = Math.max(0, (Date.now() - state.lastSave) / 1000);
    if (elapsed < 60) return null;
    const capped = Math.min(elapsed, 8 * 3600);
    const s = state.stats;
    const dps = s.atk / s.attackInterval;
    const mhp = monsterHp(state.player.floor);
    const killsPerSec = Math.min(0.8, (dps / mhp) * 0.55);
    const kills = Math.floor(killsPerSec * capped);
    const gold = Math.floor(kills * monsterGold(state.player.floor) * (1 + s.goldFind / 100) * 0.5);
    const exp = Math.floor(kills * monsterExp(state.player.floor) * 0.5);
    const itemCount = Math.min(20, Math.floor(kills / 12));
    const items = [];
    for (let i = 0; i < itemCount; i++) items.push(dropItem(state, state.player.floor));
    return { seconds: capped, gold: gold, exp: exp, items: items };
  }

  /* ==================== 导出 ==================== */
  const CORE = {
    VERSION: VERSION,
    SAVE_KEY: SAVE_KEY,
    BASE: BASE,
    PLAYER_ATTACK_RANGE: PLAYER_ATTACK_RANGE,
    SKILLS: SKILLS,
    BERSERK_DURATION: BERSERK_DURATION,
    useSkill: useSkill,
    setSeed: setSeed,
    rng: rng,
    rnd: rnd,
    rndInt: rndInt,
    pickup: pick,
    expToNext: expToNext,
    playerBaseAtk: playerBaseAtk,
    playerBaseHp: playerBaseHp,
    monsterHp: monsterHp,
    monsterAtk: monsterAtk,
    monsterExp: monsterExp,
    monsterGold: monsterGold,
    createItem: createItem,
    itemScore: itemScore,
    computeStats: computeStats,
    createState: createState,
    enterFloor: enterFloor,
    emptyEquip: emptyEquip,
    tick: tick,
    gainExp: gainExp,
    handleDrop: handleDrop,
    sellItem: sellItem,
    dropItem: dropItem,
    equipFromBag: equipFromBag,
    sellFromBag: sellFromBag,
    salvageWorse: salvageWorse,
    chestPrice: chestPrice,
    openChest: openChest,
    pushLog: pushLog,
    floorName: floorName,
    dist: dist,
    save: save,
    load: load,
    resetSave: resetSave,
    settleOffline: settleOffline,
    serialize: serialize,
    createMonster: createMonster,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  root.CORE = CORE;
})(typeof window !== 'undefined' ? window : globalThis);
