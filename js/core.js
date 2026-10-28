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
  const VERSION = 3;
  const SAVE_KEY = 'diablo_idle_save_v3';

  const BASE = { atk: 8, hp: 100, def: 0, crit: 5, critDmg: 150 };
  const PLAYER_ATK_INTERVAL = 0.9;
  const PLAYER_ATTACK_RANGE = 2.25;   // 玩家挥砍半径（格）
  const SPLASH_BASE_RADIUS = 0.9;     // 有溅射时的基础波及半径（格）

  /** 当前职业的攻击距离 */
  function attackRangeOf(state) {
    const cls = DATA.CLASSES[state.player.cls];
    return (cls && cls.attackRange) || PLAYER_ATTACK_RANGE;
  }

  /** 当前职业的视野半径（格） */
  function sightOf(state) {
    const cls = DATA.CLASSES[state.player.cls];
    return (cls && cls.sight) || 6;
  }

  function isRanged(state) {
    return attackRangeOf(state) > 3.5;
  }
  const MONSTER_ATTACK_RANGE = 1.25;  // 怪物近战半径
  const MONSTER_ATK_INTERVAL = 1.7;
  const MONSTER_AGGRO_RANGE = 9;      // 仇恨范围
  const PLAYER_SPEED = 6.8;           // 格 / 秒（测试期翻倍，原 3.4）
  const MONSTER_SPEED = 1.7;
  const ATTACK_VARIANCE = 0.12;
  const REGEN_PER_SEC = 0.004;
  const REPATH_INTERVAL = 0.35;

  /* ==================== 成长曲线 ==================== */
  function expToNext(level) { return Math.floor(20 * Math.pow(1.30, level - 1)); }
  function playerBaseAtk(level) { return BASE.atk + (level - 1) * 2.6; }
  function playerBaseHp(level) { return BASE.hp + (level - 1) * 20; }
  function monsterHp(floor) { return 105 * Math.pow(1.158, floor - 1); }
  function monsterAtk(floor) { return 7 * Math.pow(1.132, floor - 1); }
  function monsterExp(floor) { return 9 * Math.pow(1.15, floor - 1); }
  function monsterGold(floor) { return 2.2 * Math.pow(1.14, floor - 1); }

  const QUALITY_MULT = { normal: 1.0, magic: 1.15, rare: 1.32, legendary: 1.5, unique: 1.75 };

  /* ==================== 技能与资源 ==================== */
  const GLOBAL_CAST_CD = 0.4;      // 公共施法间隔
  const RAGE_MAX = 100;
  const RAGE_ON_HIT = 2;           // 命中获得怒气
  const RAGE_ON_HURT = 4;          // 受击获得怒气
  const BERSERK_DURATION = 8;
  const BERSERK_ATK_MUL = 1.35;
  const BERSERK_SPEED_MUL = 1.8;
  const CLASS_DEFAULT = 'warrior';

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
    const slotPool = DATA.SLOT_AFFIX_POOL[slotKey] || DATA.AFFIX_KEYS;
    const pool = slotPool.slice();
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
      atkSpeed: 6.5, lifesteal: 13, goldFind: 0.8, magicFind: 1.6, splash: 3.2, splashRadius: 2.0,
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
  /** 某等级下的基础四属性（不含装备加成） */
  function baseStats(level, clsKey) {
    const c = DATA.CLASSES[clsKey] || DATA.CLASSES[CLASS_DEFAULT];
    const keys = ['str', 'agi', 'vit', 'int'];
    const out = {};
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      out[k] = Math.round((c.base[k] + Math.max(0, level - 1) * c.growth[k]) * 10) / 10;
    }
    return out;
  }

  /** 已装配被动技能带来的面板加成（按等级线性成长） */
  function passiveBonuses(state) {
    const p = state.player;
    const lv = Math.max(1, Math.min(p.level, DATA.PASSIVE_MAX_LEVEL));
    const t = (lv - 1) / Math.max(1, DATA.PASSIVE_MAX_LEVEL - 1);
    const out = { crit: 0, critDmg: 0, lifesteal: 0, splash: 0, secondChance: 0, secondDmg: 0, evade: 0, markDmg: 0, comboPerHit: 0, mpPct: 0, elemDmg: 0, dmgReduce: 0, hpPct: 0, thorns: 0, blockChance: 0, mpRegenPct: 0 };
    const pool = p.skills || [];
    const lerp = function (a) { return a[0] + (a[1] - a[0]) * t; };
    for (let i = 0; i < pool.length; i++) {
      const g = DATA.PASSIVE_GROWTH[pool[i]];
      if (!g) continue;
      if (g.crit) out.crit += lerp(g.crit);
      if (g.critDmg) out.critDmg += lerp(g.critDmg);
      if (g.lifesteal) out.lifesteal += lerp(g.lifesteal);
      if (g.splash) out.splash += lerp(g.splash);
      if (g.chance) out.secondChance += lerp(g.chance);
      if (g.dmg) out.secondDmg = lerp(g.dmg);
      if (g.evade) out.evade += lerp(g.evade);
      if (g.markDmg) out.markDmg += lerp(g.markDmg);
      if (g.comboPerHit) out.comboPerHit += lerp(g.comboPerHit);
      if (g.mpPct) out.mpPct += lerp(g.mpPct);
      if (g.elemDmg) out.elemDmg += lerp(g.elemDmg);
      if (g.dmgReduce) out.dmgReduce += lerp(g.dmgReduce);
      if (g.hpPct) out.hpPct += lerp(g.hpPct);
      if (g.thorns) out.thorns += lerp(g.thorns);
      if (g.blockChance) out.blockChance += lerp(g.blockChance);
      if (g.mpRegenPct) out.mpRegenPct += lerp(g.mpRegenPct);
    }
    return out;
  }

  function computeStats(state) {
    const p = state.player;
    const cls = DATA.CLASSES[p.cls || CLASS_DEFAULT] || DATA.CLASSES[CLASS_DEFAULT];
    const S = DATA.STAT_COEF;

    // 1. 四属性 = 等级成长 + 装备属性词条
    const st = Object.assign({}, p.stats || baseStats(p.level, p.cls));
    const pas = passiveBonuses(state);

    const s = {
      stats: st,
      mainStat: cls.mainStat,
      atk: BASE.atk + st[cls.mainStat] * cls.atkCoef,
      hpMax: BASE.hp + st.vit * S.vit.hpPerPoint,
      def: st.agi * S.agi.armorPerPoint,
      crit: BASE.crit + pas.crit,
      critDmg: BASE.critDmg + pas.critDmg,
      atkSpeedPct: st.agi * S.agi.atkSpeedPerPoint,
      lifesteal: pas.lifesteal,
      goldFind: 0, magicFind: 0,
      splash: pas.splash, splashRadiusPct: 0,
      mpMax: Math.round(st.int * S.int.mpPerPoint),
      mpRegen: (S.int.mpRegenBase || 0) + st.int * S.int.mpRegenPerPoint,
      skillEffect: Math.round(st.int * S.int.skillEffectPerPoint * 10) / 10,
      secondChance: pas.secondChance,
      secondDmg: pas.secondDmg,
      evade: Math.min(40, pas.evade),
      markDmg: pas.markDmg,
      comboPerHit: pas.comboPerHit,
      elemDmg: pas.elemDmg,
      dmgReduce: Math.min(50, pas.dmgReduce),
      thorns: pas.thorns,
      blockChance: Math.min(40, pas.blockChance),
    };

    // 2. 装备词条叠加
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
          case 'splash': s.splash += v; break;
          case 'splashRadius': s.splashRadiusPct += v; break;
        }
      }
    }

    // 被动：最大生命百分比
    if (pas.hpPct) s.hpMax *= (1 + pas.hpPct / 100);

    // 成就永久加成
    const ab = state.achBonus || {};
    if (ab.atkPct) s.atk *= (1 + ab.atkPct / 100);
    if (ab.hpPct) s.hpMax *= (1 + ab.hpPct / 100);
    if (ab.goldPct) s.goldFind += ab.goldPct;
    if (ab.mfPct) s.magicFind += ab.mfPct;

    s.atk = Math.round(s.atk * 10) / 10;
    s.hpMax = Math.round(s.hpMax);
    s.def = Math.round(s.def * 10) / 10;
    s.crit = Math.min(75, Math.round(s.crit * 10) / 10);
    s.critDmg = Math.round(s.critDmg);
    s.lifesteal = Math.min(30, Math.round(s.lifesteal * 10) / 10);
    s.splash = Math.min(100, Math.round(s.splash * 10) / 10);
    s.splashRadius = Math.round(SPLASH_BASE_RADIUS * (1 + s.splashRadiusPct / 100) * 100) / 100;
    s.attackInterval = PLAYER_ATK_INTERVAL / (1 + s.atkSpeedPct / 100);
    s.secondChance = Math.round(s.secondChance * 10) / 10;
    // 法师：魔法上限吃智力与「法力涌动」被动
    s.mpMax = Math.round(s.mpMax * (1 + (pas.mpPct || 0) / 100));
    s.mpRegen = Math.round(s.mpRegen * (1 + (pas.mpRegenPct || 0) / 100) * 10) / 10;
    // 资源上限同步到 player（法师用魔法，其他职业 100）
    const clsd = DATA.CLASSES[p.cls || CLASS_DEFAULT];
    if (clsd && clsd.resource === 'mana') {
      p.rageMax = Math.max(20, s.mpMax);
    } else {
      p.rageMax = RAGE_MAX;
    }
    return s;
  }


  /* ==================== 成就 ==================== */
  function checkAchievements(state) {
    const p = state.player;
    const unlocked = [];
    for (let i = 0; i < DATA.ACHIEVEMENTS.length; i++) {
      const a = DATA.ACHIEVEMENTS[i];
      if (state.achievements[a.key]) continue;
      let ok = false;
      switch (a.type) {
        case 'floor': ok = p.bestFloor >= a.value; break;
        case 'kills': ok = p.kills >= a.value; break;
        case 'level': ok = p.level >= a.value; break;
        case 'gold': ok = (p.goldEarned || 0) >= a.value; break;
        case 'elite': ok = (p.elitesKilled || 0) >= a.value; break;
        case 'boss': ok = (p.bossesKilled || 0) >= a.value; break;
        case 'items': ok = (p.itemsFound || 0) >= a.value; break;
        case 'unique': ok = (p.uniquesFound || 0) >= a.value; break;
      }
      if (ok) {
        state.achievements[a.key] = true;
        const rw = a.reward || {};
        for (const k in rw) state.achBonus[k] = (state.achBonus[k] || 0) + rw[k];
        unlocked.push(a);
        pushLog(state, '成就解锁：' + a.name, 'log-legendary');
      }
    }
    if (unlocked.length) state.stats = computeStats(state);
    return unlocked;
  }

  /* ==================== 怪物 ==================== */
  function createMonster(floor, x, y, isBoss) {
    let tpl;
    if (isBoss) {
      tpl = DATA.BOSSES[(floor - 1) % DATA.BOSSES.length] || DATA.BOSSES[0];
    } else {
      const unlocked = Math.min(DATA.MONSTERS.length, 4 + Math.floor(floor / 5));
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
      ranged: !!tpl.ranged,
      range: tpl.range || 5,
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

  function createState(clsKey) {
    const cls = DATA.CLASSES[clsKey] ? clsKey : CLASS_DEFAULT;
    const def = DATA.CLASSES[cls];
    const state = {
      version: VERSION,
      player: {
        cls: cls,
        level: 1, exp: 0, expNext: expToNext(1), hp: 100,
        gold: 0, floor: 1, kills: 0, deaths: 0, bestFloor: 1,
        goldEarned: 0, itemsFound: 0, elitesKilled: 0, bossesKilled: 0, uniquesFound: 0,
        stats: baseStats(1, cls),
        rage: 0, rageMax: RAGE_MAX,
        skills: def.defaultSkills.slice(),
      },
      equip: emptyEquip(),
      bag: [],
      mode: { autoEquip: true, autoSell: true, autoCast: true },
      achievements: {},
      achBonus: { atkPct: 0, hpPct: 0, goldPct: 0, mfPct: 0 },
      log: [],
      lastSave: Date.now(),
      stats: null,
      run: null,
    };
    state.stats = computeStats(state);
    state.player.hp = state.stats.hpMax;
    state.player.rage = 0;
    enterFloor(state, 1);
    pushLog(state, '你以「' + def.name + '」的身份踏入「' + floorName(1) + '」。', '');
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
      skillCds: {},
      gcd: 0,
      buffs: { berserk: 0, rapidFire: 0, divineShield: 0 },
      comboTarget: -1,
      comboCount: 0,
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
    state.player.rage = state.player.rageMax;
    MAP.reveal(map, run.pos.x, run.pos.y, sightOf(state));
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
      p.stats = baseStats(p.level, p.cls);
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
    const p0 = state.player;
    p0.itemsFound = (p0.itemsFound || 0) + 1;
    if (item.quality === 'unique') p0.uniquesFound = (p0.uniquesFound || 0) + 1;
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
    if (nearestMonster(r, attackRangeOf(state))) { r.path = []; return; }

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
        MAP.reveal(r.map, r.pos.x, r.pos.y, sightOf(state));
      } else {
        r.pos.x += (dx / d) * remain;
        r.pos.y += (dy / d) * remain;
        remain = 0;
      }
    }
  }

  /** 选主目标：优先当前锁定目标，其次最近的 */
  function pickMainTarget(r, range) {
    const rng2 = range || 99;
    if (r.target && r.target.alive && dist(r.target, r.pos) <= rng2) return r.target;
    const near = nearestMonster(r, rng2);
    return near ? near.monster : null;
  }

  /**
   * 玩家挥砍：主目标吃全额伤害，主目标周围溅射半径内的敌人吃溅射伤害。
   * 溅射独立判定暴击，也参与吸血。
   */
  function playerSwing(state, events, mainTarget) {
    const r = state.run;
    const s = state.stats;
    const m = mainTarget;
    if (!m || !m.alive) return false;
    if (dist(m, r.pos) > attackRangeOf(state)) return false;

    r.swingT = 0.32;
    r.swingX = r.pos.x;
    r.swingY = r.pos.y;

    // 普通攻击命中获得怒气
    const rcls = DATA.CLASSES[state.player.cls];
    const hitGain = (rcls && rcls.resource === 'holy') ? 2 : RAGE_ON_HIT;
    state.player.rage = Math.min(state.player.rageMax, (state.player.rage || 0) + hitGain);

    let atkMul = (r.buffs && r.buffs.berserk > 0) ? BERSERK_ATK_MUL : 1;
    if (r.buffs && r.buffs.avengingWrath > 0) atkMul *= 1.5;
    let atk = s.atk * atkMul * (1 + (s.elemDmg || 0) / 100);

    // 猎手印记：对高生命目标增伤
    if (s.markDmg > 0 && m.hpMax > 0 && m.hp / m.hpMax > 0.7) {
      atk *= (1 + s.markDmg / 100);
    }
    // 连击：连续命中同一目标时伤害递增
    if (s.comboPerHit > 0) {
      if (r.comboTarget === m.id) r.comboCount = Math.min(10, (r.comboCount || 0) + 1);
      else { r.comboTarget = m.id; r.comboCount = 1; }
      atk *= (1 + Math.max(0, r.comboCount - 1) * s.comboPerHit / 100);
    }
    const critChance = s.crit + ((r.buffs && r.buffs.rapidFire > 0) ? 15 : 0);

    // 主目标
    const hit = rollDamage(atk, critChance, s.critDmg);
    m.hp -= hit.dmg;
    m.hurtT = 0.25;
    let totalLeech = hit.dmg;
    events.push({ type: 'swing', x: r.pos.x, y: r.pos.y, tx: m.x, ty: m.y, ranged: isRanged(state), count: 1 + (s.splash > 0 ? 1 : 0) });
    events.push({ type: 'hit', monster: m, dmg: hit.dmg, crit: hit.crit, main: true });
    if (m.hp <= 0) killMonster(state, m, events);

    // 二次打击（被动）：对主目标追加一次攻击
    if (m.alive && s.secondChance > 0 && rng() * 100 < s.secondChance) {
      const extra = rollDamage(atk * (s.secondDmg || 0.5), s.crit, s.critDmg);
      m.hp -= extra.dmg;
      m.hurtT = 0.25;
      totalLeech += extra.dmg;
      events.push({ type: 'hit', monster: m, dmg: extra.dmg, crit: extra.crit, extra: true });
      if (m.hp <= 0) killMonster(state, m, events);
    }

    // 溅射：以主目标为圆心
    let splashCount = 0;
    if (s.splash > 0) {
      const radius = s.splashRadius;
      const base = hit.dmg * (s.splash / 100);
      for (let i = 0; i < r.monsters.length; i++) {
        const o = r.monsters[i];
        if (o === m || !o.alive) continue;
        if (dist(o, m) > radius) continue;
        const sh = rollDamage(base, s.crit, s.critDmg);
        o.hp -= sh.dmg;
        o.hurtT = 0.2;
        totalLeech += sh.dmg;
        splashCount++;
        events.push({ type: 'hit', monster: o, dmg: sh.dmg, crit: sh.crit, splash: true });
        if (o.hp <= 0) killMonster(state, o, events);
      }
      if (splashCount > 0) {
        events.push({ type: 'splash', x: m.x, y: m.y, radius: radius, count: splashCount });
      }
    }

    if (s.lifesteal > 0 && totalLeech > 0) {
      const heal = totalLeech * s.lifesteal / 100;
      state.player.hp = Math.min(s.hpMax, state.player.hp + heal);
      if (heal >= 1) events.push({ type: 'heal', amount: Math.round(heal) });
    }
    return true;
  }

  /* ==================== 技能释放 ==================== */
  /** 释放第 index 个技能槽（0~4），失败返回 null */
  function castSkillSlot(state, index) {
    const p = state.player;
    const r = state.run;
    if (!r) return null;
    const key = (p.skills || [])[index];
    if (!key) return null;
    const def = DATA.SKILLS[key];
    if (!def || def.type !== 'active') return null;
    if ((r.gcd || 0) > 0) return null;
    if ((r.skillCds[key] || 0) > 0) return null;
    if ((p.rage || 0) < def.cost) return null;

    const s = state.stats;
    const events = [];
    const atkMul = (r.buffs && r.buffs.berserk > 0) ? BERSERK_ATK_MUL : 1;
    const atk = s.atk * atkMul * (1 + (s.skillEffect || 0) / 100) * (1 + (s.elemDmg || 0) / 100);
    const pos = { x: r.pos.x, y: r.pos.y };

    if (def.range === 'buff') {
      if (key === 'rapidFire') r.buffs.rapidFire = BERSERK_DURATION;
      else if (key === 'avengingWrath') r.buffs.avengingWrath = BERSERK_DURATION;
      else r.buffs.berserk = BERSERK_DURATION;
      events.push({ type: 'skill', key: key, x: pos.x, y: pos.y, duration: BERSERK_DURATION });

    } else if (def.range === 'single') {
      const t = pickMainTarget(r, attackRangeOf(state));
      if (!t) return null;
      const hit = rollDamage(atk * def.dmg, s.crit, s.critDmg);
      t.hp -= hit.dmg;
      t.hurtT = 0.25;
      events.push({ type: 'hit', monster: t, dmg: hit.dmg, crit: hit.crit, skill: true });
      if (def.dot && t.alive) {
        t.dot = { dps: atk * def.dot.ratio, dur: def.dot.dur };
        events.push({ type: 'dot', monster: t, dur: def.dot.dur });
      }
      if (t.hp <= 0) killMonster(state, t, events);
      events.push({ type: 'skill', key: key, x: t.x, y: t.y, ranged: isRanged(state), tx: t.x, ty: t.y });

    } else if (def.range === 'charge') {
      const near = nearestMonster(r, 12, r.blacklist, true);
      if (!near) return null;
      const t = near.monster;
      const dx = t.x - pos.x, dy = t.y - pos.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const travel = Math.min(4, Math.max(0, d - 1.3));
      if (travel > 0.2) {
        const nx = pos.x + (dx / d) * travel;
        const ny = pos.y + (dy / d) * travel;
        if (MAP.isWalkable(r.map, Math.floor(nx), Math.floor(ny))) {
          r.pos.x = nx;
          r.pos.y = ny;
          r.path = [];
          MAP.reveal(r.map, nx, ny, sightOf(state));
        }
      }
      let n = 0;
      for (let i = 0; i < r.monsters.length; i++) {
        const m = r.monsters[i];
        if (!m.alive) continue;
        if (dist(m, r.pos) > def.radius) continue;
        const hit = rollDamage(atk * def.dmg, s.crit, s.critDmg);
        m.hp -= hit.dmg;
        m.hurtT = 0.25;
        n++;
        events.push({ type: 'hit', monster: m, dmg: hit.dmg, crit: hit.crit, skill: true });
        if (m.hp <= 0) killMonster(state, m, events);
      }
      events.push({ type: 'skill', key: key, x: r.pos.x, y: r.pos.y, count: n });

    } else if (def.range === 'aoe') {
      let n = 0;
      for (let i = 0; i < r.monsters.length; i++) {
        const m = r.monsters[i];
        if (!m.alive) continue;
        if (dist(m, pos) > def.radius) continue;
        const hit = rollDamage(atk * def.dmg, s.crit, s.critDmg);
        m.hp -= hit.dmg;
        m.hurtT = 0.25;
        n++;
        events.push({ type: 'hit', monster: m, dmg: hit.dmg, crit: hit.crit, skill: true });
        if (m.hp <= 0) killMonster(state, m, events);
      }
      if (n === 0) return null;
      events.push({ type: 'skill', key: key, x: pos.x, y: pos.y, radius: def.radius, count: n });

    } else if (def.range === 'cone') {
      // 多重射击：最近的 N 个目标
      const cand = [];
      for (let i = 0; i < r.monsters.length; i++) {
        const m = r.monsters[i];
        if (!m.alive) continue;
        const d = dist(m, pos);
        if (d > def.radius) continue;
        cand.push({ m: m, d: d });
      }
      if (!cand.length) return null;
      cand.sort(function (a, b) { return a.d - b.d; });
      const picks = cand.slice(0, def.maxTargets || 3);
      for (let i = 0; i < picks.length; i++) {
        const m = picks[i].m;
        const hit = rollDamage(atk * def.dmg, s.crit, s.critDmg);
        m.hp -= hit.dmg;
        m.hurtT = 0.25;
        events.push({ type: 'hit', monster: m, dmg: hit.dmg, crit: hit.crit, skill: true });
        if (m.hp <= 0) killMonster(state, m, events);
      }
      events.push({ type: 'skill', key: key, x: pos.x, y: pos.y, radius: def.radius, count: picks.length, ranged: isRanged(state), tx: picks[0].m.x, ty: picks[0].m.y });

    } else if (def.range === 'escape') {
      // 后跳：远离最近的敌人
      const nearE = nearestMonster(r, 99);
      let dx = 1, dy = 1;
      if (nearE) { dx = pos.x - nearE.monster.x; dy = pos.y - nearE.monster.y; }
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = pos.x + (dx / dd) * def.distance;
      const ny = pos.y + (dy / dd) * def.distance;
      if (MAP.isWalkable(r.map, Math.floor(nx), Math.floor(ny))) {
        r.pos.x = nx;
        r.pos.y = ny;
        r.path = [];
        MAP.reveal(r.map, nx, ny, 5);
      }
      if (nearE) {
        const m = nearE.monster;
        const hit = rollDamage(atk * def.dmg, s.crit, s.critDmg);
        m.hp -= hit.dmg;
        m.hurtT = 0.25;
        events.push({ type: 'hit', monster: m, dmg: hit.dmg, crit: hit.crit, skill: true });
        if (m.hp <= 0) killMonster(state, m, events);
      }
      events.push({ type: 'skill', key: key, x: r.pos.x, y: r.pos.y });

    } else if (def.range === 'heal') {
      const healAmt = Math.round(state.stats.hpMax * (def.healPct || 0.25));
      const beforeHp = state.player.hp;
      state.player.hp = Math.min(state.stats.hpMax, state.player.hp + healAmt);
      const realHeal = Math.round(state.player.hp - beforeHp);
      events.push({ type: 'heal', amount: realHeal });
      events.push({ type: 'skill', key: key, x: pos.x, y: pos.y });

    } else if (def.range === 'shield') {
      r.buffs.divineShield = def.duration || 8;
      events.push({ type: 'skill', key: key, x: pos.x, y: pos.y, duration: def.duration });

    } else if (def.range === 'trap') {
      // 陷阱（简化：立刻在脚下引爆）
      let n = 0;
      for (let i = 0; i < r.monsters.length; i++) {
        const m = r.monsters[i];
        if (!m.alive) continue;
        if (dist(m, pos) > def.radius) continue;
        const hit = rollDamage(atk * def.dmg, s.crit, s.critDmg);
        m.hp -= hit.dmg;
        m.hurtT = 0.25;
        n++;
        events.push({ type: 'hit', monster: m, dmg: hit.dmg, crit: hit.crit, skill: true });
        if (m.hp <= 0) killMonster(state, m, events);
      }
      if (n === 0) return null;
      events.push({ type: 'skill', key: key, x: pos.x, y: pos.y, radius: def.radius, count: n });

    } else {
      return null;
    }

    p.rage = Math.max(0, (p.rage || 0) - def.cost);
    r.skillCds[key] = def.cd || 0;
    r.gcd = GLOBAL_CAST_CD;
    return events;
  }

  /** 自动施法：按技能槽顺序找第一个能放的 */
  function autoCast(state) {
    const r = state.run;
    if (!r) return null;
    if ((r.gcd || 0) > 0) return null;
    const p = state.player;
    const skills = p.skills || [];
    for (let i = 0; i < skills.length; i++) {
      const key = skills[i];
      const def = DATA.SKILLS[key];
      if (!def || def.type !== 'active') continue;
      if ((r.skillCds[key] || 0) > 0) continue;
      if ((p.rage || 0) < def.cost) continue;
      if (def.range === 'buff') {
        if (!nearestMonster(r, 8)) continue;
      } else if (def.range === 'single') {
        if (!nearestMonster(r, attackRangeOf(state))) continue;
      } else if (def.range === 'aoe') {
        if (!nearestMonster(r, def.radius)) continue;
      } else if (def.range === 'charge') {
        if (!nearestMonster(r, 10)) continue;
      } else if (def.range === 'cone' || def.range === 'trap') {
        if (!nearestMonster(r, def.radius)) continue;
      } else if (def.range === 'escape') {
        if (!nearestMonster(r, 3)) continue;
      } else if (def.range === 'heal') {
        if (state.player.hp > state.stats.hpMax * 0.6) continue;
      } else if (def.range === 'shield') {
        if (!nearestMonster(r, 6)) continue;
      }
      const evs = castSkillSlot(state, i);
      if (evs) return evs;
    }
    return null;
  }
  function killMonster(state, m, events) {
    m.alive = false;
    m.hp = 0;
    const p = state.player;
    const gold = Math.round(monsterGold(p.floor) * (1 + state.stats.goldFind / 100) * (m.isBoss ? 10 : 1));
    const exp = Math.round(monsterExp(p.floor) * (m.isBoss ? 7 : 1));
    p.gold += gold;
    p.goldEarned = (p.goldEarned || 0) + gold;
    p.kills += 1;
    if (m.isElite) p.elitesKilled = (p.elitesKilled || 0) + 1;
    if (m.isBoss) p.bossesKilled = (p.bossesKilled || 0) + 1;
    gainExp(state, exp, events);

    events.push({ type: 'monsterDied', monster: m, gold: gold, exp: exp });

    const dropChance = (m.isBoss || m.isElite) ? 1 : 0.16 + state.stats.magicFind / 1000;
    const dropCount = m.isBoss ? rndInt(2, 3) : (m.isElite ? 1 : (rng() < dropChance ? 1 : 0));
    for (let i = 0; i < dropCount; i++) {
      const item = dropItem(state, p.floor);
      events.push({ type: 'drop', item: item, x: m.x, y: m.y });
      handleDrop(state, item, events);
    }
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

  /** 远程怪被贴脸时后撤 */
  function retreatMonster(state, m, dt) {
    const r = state.run;
    const dx = m.x - r.pos.x;
    const dy = m.y - r.pos.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const step = MONSTER_SPEED * 0.9 * dt;
    const nx = m.x + (dx / d) * step;
    const ny = m.y + (dy / d) * step;
    if (MAP.isWalkable(r.map, Math.floor(nx), Math.floor(ny))) {
      m.x = nx;
      m.y = ny;
    }
  }

  function monsterAttack(state, m, events) {
    const s = state.stats;
    // 闪避（游侠被动）
    if (s.evade > 0 && rng() * 100 < s.evade) {
      state.player.rage = Math.min(state.player.rageMax, (state.player.rage || 0) + 2);
      events.push({ type: 'dodge', source: m });
      return;
    }
    const reduce = s.def / (s.def + 26 + state.player.floor * 5);
    let shieldMul = 1 - Math.min(50, s.dmgReduce || 0) / 100;
    // 骑士：格挡（概率减伤 50%）
    if (s.blockChance > 0 && rng() * 100 < s.blockChance) {
      shieldMul *= 0.5;
      events.push({ type: 'block' });
    }
    // 骑士：神圣护盾 buff
    if (state.run && state.run.buffs && state.run.buffs.divineShield > 0) {
      shieldMul *= 0.6;
    }
    let dmg = m.atk * (1 - reduce) * shieldMul * (1 + rnd(-0.1, 0.1));
    dmg = Math.max(1, Math.round(dmg));
    state.player.hp -= dmg;
    const hcls = DATA.CLASSES[state.player.cls];
    const hurtGain = (hcls && hcls.resource === 'holy') ? 2 : RAGE_ON_HURT;
    state.player.rage = Math.min(state.player.rageMax, (state.player.rage || 0) + hurtGain);
    m.attackAnim = 0.3;
    if (m.ranged) {
      events.push({ type: 'monsterShot', from: m, dmg: dmg });
    }
    events.push({ type: 'playerHurt', dmg: dmg, source: m });

    // 骑士：反伤（复仇之怒期间翻倍）
    if (s.thorns > 0) {
      let mul = 1;
      if (state.run && state.run.buffs && state.run.buffs.avengingWrath > 0) mul = 2;
      const reflect = Math.max(1, Math.round(s.atk * s.thorns / 100 * mul));
      m.hp -= reflect;
      events.push({ type: 'thorns', monster: m, dmg: reflect });
      if (m.hp <= 0) killMonster(state, m, events);
    }
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

    // 成就检查（每秒一次）
    r.achCd = (r.achCd || 0) - dt;
    if (r.achCd <= 0) {
      r.achCd = 1;
      const unlocked = checkAchievements(state);
      for (let ai = 0; ai < unlocked.length; ai++) events.push({ type: 'achievement', a: unlocked[ai] });
    }

    // 资源自然回复（游侠集中值）
    const clsDef = DATA.CLASSES[state.player.cls];
    if (clsDef && clsDef.resource === 'energy') {
      state.player.rage = Math.min(state.player.rageMax, (state.player.rage || 0) + 8 * dt);
    } else if (clsDef && clsDef.resource === 'mana') {
      state.player.rage = Math.min(state.player.rageMax, (state.player.rage || 0) + (s.mpRegen || 1) * dt);
    } else if (clsDef && clsDef.resource === 'holy') {
      state.player.rage = Math.min(state.player.rageMax, (state.player.rage || 0) + 3 * dt);
    }

    // 玩家思考
    r.thinkCd -= dt;
    if (r.thinkCd <= 0) {
      r.thinkCd = 0.28;
      playerThink(state);
    }

    // 玩家移动
    moveAlong(state, dt);
    if (r.swingT > 0) r.swingT = Math.max(0, r.swingT - dt);

    // 技能冷却 / 公共施法间隔 / buff
    if (!r.skillCds) r.skillCds = {};
    if (!r.buffs) r.buffs = { berserk: 0 };
    if (r.gcd > 0) r.gcd = Math.max(0, r.gcd - dt);
    for (const k in r.skillCds) if (r.skillCds[k] > 0) r.skillCds[k] = Math.max(0, r.skillCds[k] - dt);
    if (r.buffs.berserk > 0) r.buffs.berserk = Math.max(0, r.buffs.berserk - dt);
    if (r.buffs.rapidFire > 0) r.buffs.rapidFire = Math.max(0, r.buffs.rapidFire - dt);
    if (r.buffs.divineShield > 0) r.buffs.divineShield = Math.max(0, r.buffs.divineShield - dt);

    // 自动施法（优先于普通攻击）
    if (state.mode.autoCast) {
      const castEvs = autoCast(state);
      if (castEvs) for (let ci = 0; ci < castEvs.length; ci++) events.push(castEvs[ci]);
    }

    // 玩家攻击
    r.attackCd -= dt;
    if (r.attackCd <= 0) {
      const mainT = pickMainTarget(r, attackRangeOf(state));
      if (mainT && playerSwing(state, events, mainT)) {
        let speedMul = 1;
        if (r.buffs.berserk > 0) speedMul *= BERSERK_SPEED_MUL;
        if (r.buffs.rapidFire > 0) speedMul *= 2;
        r.attackCd = s.attackInterval / speedMul;
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

      // 持续伤害（致死打击的重伤）
      if (m.dot && m.dot.dur > 0) {
        m.dot.dur -= dt;
        m.hp -= m.dot.dps * dt;
        if (m.hp <= 0) { killMonster(state, m, events); continue; }
      }

      const d = dist(m, r.pos);
      if (d > MONSTER_AGGRO_RANGE && !m.ranged) continue;

      const mRange = m.ranged ? (m.range || 5) : MONSTER_ATTACK_RANGE;
      const mMin = m.ranged ? 2.2 : 0;

      if (m.ranged && d < mMin) {
        // 远程怪被贴脸：后撤
        retreatMonster(state, m, dt);
      } else if (d > mRange) {
        if (d > MONSTER_AGGRO_RANGE) continue;
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
      achievements: state.achievements,
      achBonus: state.achBonus,
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
      if (!state.player.cls || !DATA.CLASSES[state.player.cls]) state.player.cls = CLASS_DEFAULT;
      if (!state.player.stats || typeof state.player.stats.str !== 'number') {
        state.player.stats = baseStats(state.player.level || 1, state.player.cls);
      }
      if (!Array.isArray(state.player.skills) || !state.player.skills.length) {
        state.player.skills = DATA.CLASSES[state.player.cls].defaultSkills.slice();
      }
      if (typeof state.player.rage !== 'number') state.player.rage = 0;
      if (!state.player.rageMax) state.player.rageMax = RAGE_MAX;
      state.equip = Object.assign(emptyEquip(), data.equip || {});
      state.bag = Array.isArray(data.bag) ? data.bag : [];
      state.mode = Object.assign(state.mode, data.mode || {});
      state.achievements = data.achievements || {};
      state.achBonus = Object.assign({ atkPct: 0, hpPct: 0, goldPct: 0, mfPct: 0 }, data.achBonus || {});
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
    CLASSES: DATA.CLASSES,
    CLASS_DEFAULT: CLASS_DEFAULT,
    SKILLS: DATA.SKILLS,
    BERSERK_DURATION: BERSERK_DURATION,
    RAGE_MAX: RAGE_MAX,
    baseStats: baseStats,
    passiveBonuses: passiveBonuses,
    castSkillSlot: castSkillSlot,
    autoCast: autoCast,
    checkAchievements: checkAchievements,
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
