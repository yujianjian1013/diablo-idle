/**
 * core.js —— 核心玩法逻辑（纯逻辑，不碰 DOM，可在 Node 中测试）
 *
 * 设计原则：
 * - 所有随机走可注入种子的 RNG，便于测试复现
 * - tick() 接收固定时间步长，返回事件数组，渲染层只管播
 * - 存档只保留持久字段，运行时状态重建
 */
(function (root) {
  'use strict';

  const DATA = root.DATA || (typeof require === 'function' ? require('./data.js') : null);
  if (!DATA) throw new Error('core.js 需要先加载 data.js');

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
  /** 按 weight 字段加权抽取 */
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
  const VERSION = 1;
  const SAVE_KEY = 'diablo_idle_save_v1';

  const BASE = { atk: 8, hp: 100, def: 0, crit: 5, critDmg: 150 };
  const PLAYER_ATK_INTERVAL = 0.9;   // 秒
  const MONSTER_ATK_INTERVAL = 1.8;  // 秒
  const RESPAWN_DELAY = 0.4;         // 击杀后刷怪延迟
  const KILLS_PER_FLOOR = 8;         // 每层小怪数量，之后刷 BOSS
  const BOSS_EVERY = 1;              // 每层都有 BOSS（保留参数）
  const ATTACK_VARIANCE = 0.12;      // 伤害浮动 ±12%
  const LIFESTEAL_ON_HIT = true;
  const REGEN_PER_SEC = 0.004;       // 每秒自然回血（占最大生命比例）

  /* ==================== 成长曲线 ==================== */
  function expToNext(level) {
    return Math.floor(20 * Math.pow(1.32, level - 1));
  }
  function playerBaseAtk(level) { return BASE.atk + (level - 1) * 2.6; }
  function playerBaseHp(level) { return BASE.hp + (level - 1) * 20; }
  // 成长曲线：怪物与装备词条共用同一个指数底数，保证玩家推进速度稳定
  function monsterHp(floor) { return 20 * Math.pow(1.16, floor - 1); }
  function monsterAtk(floor) { return 3 * Math.pow(1.10, floor - 1); }
  function monsterExp(floor) { return 10 * Math.pow(1.16, floor - 1); }
  function monsterGold(floor) { return 3 * Math.pow(1.16, floor - 1); }

  /** 品质对词条数值的倍率 */
  const QUALITY_MULT = { normal: 1.0, magic: 1.15, rare: 1.32, legendary: 1.5, unique: 1.75 };

  /* ==================== 装备 ==================== */
  function rollQuality(magicFind) {
    const mf = 1 + (magicFind || 0) / 100;
    const list = DATA.QUALITY_ORDER.map(function (k) {
      const q = DATA.QUALITY[k];
      // 寻宝率只放大非普通品质
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
      // 百分比词条（暴击/攻速/吸血等）线性缓增，避免数值失控
      v = base * (1 + Math.max(0, ilvl - 1) * 0.03) * (qMult || 1);
      v = Math.round(v * 10) / 10;
    } else {
      // 数值词条随物品等级指数成长，与怪物血量曲线同底数
      v = base * Math.pow(1.13, Math.max(0, ilvl - 1)) * (qMult || 1);
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
    // 按权重不重复抽词条
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

  /** 装备评分：用于自动比较与排序 */
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

  /** 某槽位当前装备的评分（空槽视为 0） */
  function equippedScore(state, slotKey) {
    const it = state.equip[slotKey];
    return it ? it.score : 0;
  }

  /* ==================== 属性计算 ==================== */
  function computeStats(state) {
    const p = state.player;
    const s = {
      atk: playerBaseAtk(p.level),
      hpMax: playerBaseHp(p.level),
      def: BASE.def,
      crit: BASE.crit,
      critDmg: BASE.critDmg,
      atkSpeedPct: 0,
      lifesteal: 0,
      goldFind: 0,
      magicFind: 0,
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
  function makeMonster(floor, isBoss) {
    if (isBoss) {
      const tpl = DATA.BOSSES[(floor - 1) % DATA.BOSSES.length] || DATA.BOSSES[0];
      const hp = monsterHp(floor) * 6;
      return {
        name: tpl.name,
        shape: tpl.shape,
        color: tpl.color,
        hpMax: Math.round(hp),
        hp: Math.round(hp),
        atk: Math.round(monsterAtk(floor) * 2.2 * 10) / 10,
        isBoss: true,
      };
    }
    // 按楼层解锁怪物种类，前期不会一上来就撞见高级怪
    const unlocked = Math.min(DATA.MONSTERS.length, 3 + Math.floor(floor / 4));
    const tpl = weightedPick(DATA.MONSTERS.slice(0, unlocked));
    const hp = monsterHp(floor);
    return {
      name: tpl.name,
      shape: tpl.shape,
      color: tpl.color,
      hpMax: Math.round(hp),
      hp: Math.round(hp),
      atk: Math.round(monsterAtk(floor) * 10) / 10,
      isBoss: false,
    };
  }

  function floorName(floor) {
    const idx = (floor - 1) % DATA.FLOOR_NAMES.length;
    return DATA.FLOOR_NAMES[idx];
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
      player: { level: 1, exp: 0, expNext: expToNext(1), hp: 100, gold: 0, floor: 1, kills: 0, deaths: 0, bestFloor: 1 },
      equip: emptyEquip(),
      bag: [],
      mode: { autoEquip: true, autoSell: true },
      log: [],
      lastSave: Date.now(),
      // 运行时（不持久化）
      monster: null,
      progress: { killed: 0, need: KILLS_PER_FLOOR },
      timers: { playerAtk: 0, monsterAtk: 0, respawn: 0 },
      stats: null,
    };
    state.stats = computeStats(state);
    state.player.hp = state.stats.hpMax;
    state.monster = makeMonster(1, false);
    return state;
  }

  /* ==================== 日志 ==================== */
  function pushLog(state, text, cls) {
    state.log.unshift({ text: text, cls: cls || '', t: Date.now() });
    if (state.log.length > 60) state.log.length = 60;
  }

  /* ==================== 战斗 ==================== */
  function playerDamage(state) {
    const s = state.stats;
    const crit = rng() * 100 < s.crit;
    let dmg = s.atk * (1 + rnd(-ATTACK_VARIANCE, ATTACK_VARIANCE));
    if (crit) dmg *= s.critDmg / 100;
    return { dmg: Math.max(1, Math.round(dmg)), crit: crit };
  }

  function monsterDamage(state) {
    const s = state.stats;
    const m = state.monster;
    // 防御按递减模型减伤：def / (def + 40 + floor*6)
    const reduce = s.def / (s.def + 30 + state.player.floor * 3);
    let dmg = m.atk * (1 - reduce) * (1 + rnd(-0.1, 0.1));
    return Math.max(1, Math.round(dmg));
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

  function dropItem(state, floor, isBoss) {
    const slot = pick(DATA.SLOT_KEYS);
    const ilvl = Math.max(1, floor + rndInt(-1, 1));
    const qKey = rollQuality(state.stats.magicFind);
    return createItem(slot, Math.max(1, ilvl), qKey);
  }

  /** 处理掉落：自动装备 / 进背包 / 自动分解 */
  function handleDrop(state, item, events) {
    const cur = state.equip[item.slot];
    const better = cur ? item.score > cur.score : item.score > 0;
    if (state.mode.autoEquip && better) {
      if (cur) {
        state.equip[item.slot] = null;
        sellItem(state, cur, events, true);
      }
      state.equip[item.slot] = item;
      state.stats = computeStats(state);
      state.player.hp = Math.min(state.player.hp, state.stats.hpMax);
      pushLog(state, '装备 ' + item.name + '（战力 ' + item.score + '）', 'log-' + item.quality);
      events.push({ type: 'equip', item: item });
      return;
    }
    // 白板垃圾直接换成金币，不占背包
    if (item.score <= 0 && state.mode.autoSell) {
      sellItem(state, item, events, true);
      return;
    }
    state.bag.push(item);
    if (state.bag.length > 40) {
      const oldest = state.bag.shift();
      sellItem(state, oldest, events, true);
    }
    pushLog(state, '拾取 ' + item.name, 'log-' + item.quality);
    events.push({ type: 'drop', item: item });
  }

  function sellItem(state, item, events, silent) {
    const price = Math.max(1, Math.round(item.ilvl * 4 + item.score * 0.6 + (DATA.QUALITY_ORDER.indexOf(item.quality) + 1) * 8));
    state.player.gold += price;
    if (!silent) pushLog(state, '出售 ' + item.name + '，+' + price + ' 金币', 'log-gold');
    events.push({ type: 'sell', item: item, gold: price });
    return price;
  }

  function killMonster(state, events) {
    const m = state.monster;
    const p = state.player;
    const goldGain = Math.round(monsterGold(p.floor) * (1 + state.stats.goldFind / 100) * (m.isBoss ? 8 : 1));
    const expGain = Math.round(monsterExp(p.floor) * (m.isBoss ? 6 : 1));
    p.gold += goldGain;
    p.kills += 1;

    gainExp(state, expGain, events);
    // 击杀回血，保证挂机续航
    p.hp = Math.min(state.stats.hpMax, p.hp + state.stats.hpMax * 0.10);

    events.push({ type: 'monsterDied', monster: m, gold: goldGain, exp: expGain });

    if (m.isBoss) {
      // BOSS 必掉 1~2 件
      const drops = rndInt(1, 2);
      for (let i = 0; i < drops; i++) handleDrop(state, dropItem(state, p.floor, true), events);
      p.floor += 1;
      p.bestFloor = Math.max(p.bestFloor, p.floor);
      state.progress.killed = 0;
      pushLog(state, '击败 ' + m.name + '，进入第 ' + p.floor + ' 层「' + floorName(p.floor) + '」', 'log-boss');
      events.push({ type: 'floorUp', floor: p.floor });
      state.monster = makeMonster(p.floor, false);
      state.timers.respawn = 0.5;
    } else {
      state.progress.killed += 1;
      if (state.progress.killed >= state.progress.need) {
        state.monster = makeMonster(p.floor, true);
        pushLog(state, 'BOSS 出现：' + state.monster.name + '！', 'log-boss');
        events.push({ type: 'bossSpawn', monster: state.monster });
        state.timers.respawn = 0.8;
      } else {
        // 小怪掉落
        if (rng() < 0.15 + state.stats.magicFind / 1000) {
          handleDrop(state, dropItem(state, p.floor, false), events);
        }
        state.monster = makeMonster(p.floor, false);
        state.timers.respawn = RESPAWN_DELAY;
      }
    }
  }

  function playerDies(state, events) {
    const p = state.player;
    p.deaths += 1;
    p.floor = Math.max(1, p.floor - 1);
    state.progress.killed = 0;
    p.hp = state.stats.hpMax;
    pushLog(state, '你被击倒，退回到第 ' + p.floor + ' 层', 'log-death');
    events.push({ type: 'death', floor: p.floor });
    state.monster = makeMonster(p.floor, false);
    state.timers.respawn = 1.2;
  }

  /* ==================== 主循环 ==================== */
  /**
   * 推进游戏时间
   * @param {object} state
   * @param {number} dt 秒
   * @returns {Array} 事件数组
   */
  function tick(state, dt) {
    const events = [];
    if (!isFinite(dt) || dt <= 0) return events;
    // 防止标签页挂起导致一次结算过大
    dt = Math.min(dt, 2);

    const t = state.timers;

    // 刷怪延迟：延迟期间不推进战斗，只走自然回血
    if (t.respawn > 0) {
      t.respawn -= dt;
      if (t.respawn > 0) {
        state.player.hp = Math.min(state.stats.hpMax, state.player.hp + state.stats.hpMax * REGEN_PER_SEC * dt);
        return events;
      }
    }

    // 玩家攻击
    t.playerAtk += dt;
    let guard = 0;
    while (t.playerAtk >= state.stats.attackInterval && guard++ < 200) {
      t.playerAtk -= state.stats.attackInterval;
      if (!state.monster) break;
      const hit = playerDamage(state);
      state.monster.hp -= hit.dmg;
      if (LIFESTEAL_ON_HIT && state.stats.lifesteal > 0) {
        state.player.hp = Math.min(state.stats.hpMax, state.player.hp + hit.dmg * state.stats.lifesteal / 100);
      }
      events.push({ type: 'playerHit', dmg: hit.dmg, crit: hit.crit, targetHp: Math.max(0, state.monster.hp) });
      if (state.monster.hp <= 0) {
        killMonster(state, events);
        t.playerAtk = 0;
        break;
      }
    }

    // 怪物攻击
    t.monsterAtk += dt;
    guard = 0;
    while (t.monsterAtk >= MONSTER_ATK_INTERVAL && guard++ < 200) {
      t.monsterAtk -= MONSTER_ATK_INTERVAL;
      if (!state.monster) break;
      const dmg = monsterDamage(state);
      state.player.hp -= dmg;
      events.push({ type: 'monsterHit', dmg: dmg });
      if (state.player.hp <= 0) {
        playerDies(state, events);
        t.monsterAtk = 0;
        break;
      }
    }

    // 自然回血
    if (state.player.hp > 0) {
      state.player.hp = Math.min(state.stats.hpMax, state.player.hp + state.stats.hpMax * REGEN_PER_SEC * dt);
    }

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
    const events = [];
    return sellItem(state, item, events, false);
  }

  /** 一键分解背包里比当前装备差的 */
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

  /** 开宝箱：花金币抽一件装备 */
  function chestPrice(floor) { return Math.round(80 * Math.pow(1.12, floor - 1)); }
  function openChest(state) {
    const price = chestPrice(state.player.floor);
    if (state.player.gold < price) return { ok: false, price: price };
    state.player.gold -= price;
    const events = [];
    const slot = pick(DATA.SLOT_KEYS);
    // 宝箱品质下限提高：保底魔法
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
      state.lastSave = data.lastSave || Date.now();
      _itemId = Math.max(data.itemId || 1, 1);
      state.stats = computeStats(state);
      state.player.hp = Math.min(state.player.hp, state.stats.hpMax);
      if (state.player.hp <= 0) state.player.hp = state.stats.hpMax;
      state.player.expNext = expToNext(state.player.level);
      state.monster = makeMonster(state.player.floor, false);
      return state;
    } catch (e) { return null; }
  }

  function resetSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  /**
   * 离线结算：页面关掉期间按当前战力折算收益
   * 返回 { seconds, gold, exp, items }
   */
  function settleOffline(state) {
    const elapsed = Math.max(0, (Date.now() - state.lastSave) / 1000);
    if (elapsed < 60) return null;
    const capped = Math.min(elapsed, 8 * 3600); // 最多结算 8 小时
    const s = state.stats;
    const dps = s.atk / s.attackInterval;
    const mhp = monsterHp(state.player.floor);
    // 估算每秒击杀数
    const killsPerSec = Math.min(1, dps / mhp);
    const kills = Math.floor(killsPerSec * capped);
    const gold = Math.floor(kills * monsterGold(state.player.floor) * (1 + s.goldFind / 100) * 0.5);
    const exp = Math.floor(kills * monsterExp(state.player.floor) * 0.5);
    const itemCount = Math.min(20, Math.floor(kills / 40));
    const items = [];
    for (let i = 0; i < itemCount; i++) items.push(dropItem(state, state.player.floor, false));
    return { seconds: capped, gold: gold, exp: exp, items: items };
  }

  /* ==================== 导出 ==================== */
  const CORE = {
    VERSION: VERSION,
    SAVE_KEY: SAVE_KEY,
    BASE: BASE,
    KILLS_PER_FLOOR: KILLS_PER_FLOOR,
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
    makeMonster: makeMonster,
    floorName: floorName,
    createState: createState,
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
    save: save,
    load: load,
    resetSave: resetSave,
    settleOffline: settleOffline,
    serialize: serialize,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  root.CORE = CORE;
})(typeof window !== 'undefined' ? window : globalThis);
