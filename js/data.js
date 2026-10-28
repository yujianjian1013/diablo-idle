/**
 * data.js —— 游戏静态数据
 * 品质、装备槽、词条池、怪物、关卡名。
 * 纯数据，不含逻辑，浏览器与 Node 均可加载。
 */
(function (root) {
  'use strict';

  /* ---------------- 品质 ---------------- */
  // 颜色沿用暗黑经典：白 / 蓝 / 黄 / 橙 / 绿
  const QUALITY = {
    normal:    { key: 'normal',    name: '普通', color: '#c8c8c8', weight: 62,  affixes: [0, 1] },
    magic:     { key: 'magic',     name: '魔法', color: '#5a7dff', weight: 26,  affixes: [1, 2] },
    rare:      { key: 'rare',      name: '稀有', color: '#f0d000', weight: 8.0, affixes: [2, 3] },
    legendary: { key: 'legendary', name: '传奇', color: '#ff8a00', weight: 2.8, affixes: [3, 4] },
    unique:    { key: 'unique',    name: '暗金', color: '#2ad16b', weight: 0.6, affixes: [4, 4] },
  };
  const QUALITY_ORDER = ['normal', 'magic', 'rare', 'legendary', 'unique'];

  /* ---------------- 装备槽 ---------------- */
  // 图标用汉字，保证任何系统字体都能稳定显示
  const SLOTS = [
    { key: 'weapon', name: '武器', icon: '剑' },
    { key: 'helmet', name: '头盔', icon: '盔' },
    { key: 'armor',  name: '胸甲', icon: '甲' },
    { key: 'gloves', name: '手套', icon: '手' },
    { key: 'boots',  name: '战靴', icon: '靴' },
    { key: 'amulet', name: '项链', icon: '链' },
    { key: 'ring1',  name: '戒指', icon: '戒' },
    { key: 'ring2',  name: '戒指', icon: '戒' },
  ];
  const SLOT_KEYS = SLOTS.map(function (s) { return s.key; });

  /* ---------------- 词条 ---------------- */
  // weight = 出现权重；base = 基础数值区间；scale = 随物品等级成长系数
  const AFFIXES = {
    atk:       { key: 'atk',       name: '攻击力',   weight: 32, base: [2, 5],    scale: 1.00, pct: false, prefix: ['锋锐的', '残暴的', '杀戮的'], suffix: ['之力', '之刃'] },
    def:       { key: 'def',       name: '防御',     weight: 24, base: [1, 3],    scale: 0.80, pct: false, prefix: ['坚固的', '铁壁的', '磐石的'], suffix: ['之护'] },
    hp:        { key: 'hp',        name: '生命',     weight: 28, base: [10, 24],  scale: 1.20, pct: false, prefix: ['强健的', '生机的', '不朽的'], suffix: ['之躯'] },
    crit:      { key: 'crit',      name: '暴击率',   weight: 11, base: [1, 3],    scale: 0.45, pct: true,  prefix: ['致命的', '精准的'], suffix: ['之眼'] },
    critDmg:   { key: 'critDmg',   name: '暴击伤害', weight: 11, base: [5, 15],   scale: 0.60, pct: true,  prefix: ['残酷的', '狂暴的'], suffix: ['之怒'] },
    atkSpeed:  { key: 'atkSpeed',  name: '攻击速度', weight: 9,  base: [2, 5],    scale: 0.30, pct: true,  prefix: ['迅捷的', '疾风的'], suffix: ['之速'] },
    lifesteal: { key: 'lifesteal', name: '生命偷取', weight: 7,  base: [1, 2],    scale: 0.30, pct: true,  prefix: ['嗜血的', '饮魂的'], suffix: ['之血'] },
    goldFind:  { key: 'goldFind',  name: '金币获取', weight: 9,  base: [3, 8],    scale: 0.50, pct: true,  prefix: ['贪财的', '富饶的'], suffix: ['之财'] },
    magicFind: { key: 'magicFind', name: '寻宝几率', weight: 7,  base: [2, 6],    scale: 0.50, pct: true,  prefix: ['幸运的', '探宝者的'], suffix: ['之幸'] },
    splash:       { key: 'splash',       name: '溅射伤害', weight: 15, base: [3, 6],   scale: 0.50, pct: true, prefix: ['裂开的', '震荡的', '回响的'], suffix: ['之裂'] },
    splashRadius: { key: 'splashRadius', name: '溅射范围', weight: 10, base: [8, 14],   scale: 0.35, pct: true, prefix: ['扩散的', '波及的', '环流的'], suffix: ['之散'] },
  };
  const AFFIX_KEYS = Object.keys(AFFIXES);

  /* ---------------- 基础物品名 ---------------- */
  const BASE_NAMES = {
    weapon: ['长剑', '战斧', '巨锤', '弯刀', '法杖', '钉头锤'],
    helmet: ['头盔', '兜帽', '面罩', '王冠', '头环'],
    armor:  ['胸甲', '板甲', '皮甲', '法袍', '锁子甲'],
    gloves: ['手套', '护腕', '裹手', '指套'],
    boots:  ['战靴', '长靴', '铁履', '踏云靴'],
    amulet: ['护符', '项链', '吊坠', '圣徽'],
    ring1:  ['指环', '戒指', '扳指'],
    ring2:  ['指环', '戒指', '扳指'],
  };

  /* ---------------- 传奇/暗金 独特名 ---------------- */
  const UNIQUE_NAMES = {
    weapon: ['末日之刃', '血饮者', '碎骨者', '风暴之牙', '哀恸'],
    helmet: ['铁王冠', '亡者之颅', '灰烬面具', '先知之眼'],
    armor:  ['不灭铁衣', '黑曜石护甲', '龙鳞胸甲', '亡者之拥'],
    gloves: ['屠夫之握', '燃血护手', '影缚之爪'],
    boots:  ['嗜血战靴', '风行者', '深渊之履'],
    amulet: ['灵魂契约', '塔拉夏的誓言', '血月挂坠'],
    ring1:  ['乔丹之石', '虚空之戒', '贪欲指环'],
    ring2:  ['乔丹之石', '虚空之戒', '贪欲指环'],
  };

  /* ---------------- 怪物 ---------------- */
  // shape 交给渲染层决定画法
  // ranged: 远程怪，保持在 range 外射击；近战怪必须贴脸
  const MONSTERS = [
    { name: '腐尸',     shape: 'slime',    color: '#6b7a45', weight: 12, ranged: false },
    { name: '骷髅战士', shape: 'skeleton', color: '#cfc7ad', weight: 12, ranged: false },
    { name: '地狱犬',   shape: 'beast',    color: '#8a3324', weight: 11, ranged: false },
    { name: '堕落法师', shape: 'mage',     color: '#6a4a8a', weight: 8, ranged: true, range: 5.5 },
    { name: '食尸鬼',   shape: 'slime',    color: '#7a6a55', weight: 10, ranged: false },
    { name: '石像鬼',   shape: 'beast',    color: '#767676', weight: 9,  ranged: false },
    { name: '血族贵胄', shape: 'mage',     color: '#9a1a2e', weight: 7, ranged: true, range: 6.0 },
    { name: '深渊魔像', shape: 'golem',    color: '#4a3a3a', weight: 7,  ranged: false },
  ];

  const BOSSES = [
    { name: '屠夫',         shape: 'boss', color: '#a01a1a' },
    { name: '骨骸领主',     shape: 'boss', color: '#b09a5a' },
    { name: '安达利尔之影', shape: 'boss', color: '#7a1a7a' },
    { name: '沉沦魔领主',   shape: 'boss', color: '#b0601a' },
    { name: '深渊守望者',   shape: 'boss', color: '#2a4a8a' },
    { name: '痛苦女王',     shape: 'boss', color: '#8a1a4a' },
    { name: '毁灭者巴尔',   shape: 'boss', color: '#a03a1a' },
    { name: '恐惧之王',     shape: 'boss', color: '#5a1a1a' },
  ];

  /* ---------------- 场景名 ---------------- */
  const FLOOR_NAMES = [
    '荒废庭院', '哭泣洞穴', '血鸦巢穴', '腐骨墓穴', '地牢二层',
    '石矿深处', '遗忘教堂', '黑暗回廊', '枯骨平原', '深渊之门',
    '烈焰裂谷', '哀嚎深渊', '亡者大厅', '虚空回廊', '末日王座',
  ];


  /* ---------------- 职业 ---------------- */
  const CLASSES = {
    warrior: {
      key: 'warrior',
      name: '战士',
      desc: '以怒气为资源，近战高血，擅长范围清场与正面硬刚。',
      mainStat: 'str',
      resource: 'rage',
      base: { str: 18, agi: 12, vit: 16, int: 6 },
      growth: { str: 2.8, agi: 1.2, vit: 1.8, int: 1.0 },
      atkCoef: 2.0,
      sight: 10,
      skillPool: [
        'heroicStrike', 'whirlwind', 'charge', 'thunderClap', 'mortalStrike', 'recklessness',
        'secondWind', 'splatter', 'brutalCrit', 'bloodthirst',
      ],
      defaultSkills: ['whirlwind', 'thunderClap', 'recklessness', 'splatter', 'brutalCrit'],
    },
    ranger: {
      key: 'ranger',
      name: '游侠',
      desc: '以集中值为资源，远程高攻速，擅长单体点杀与风筝。',
      mainStat: 'agi',
      resource: 'energy',
      base: { str: 12, agi: 18, vit: 12, int: 10 },
      growth: { str: 1.2, agi: 2.4, vit: 1.2, int: 1.0 },
      atkCoef: 1.55,
      attackRange: 4.2,
      sight: 10,
      skillPool: [
        'steadyShot', 'multiShot', 'serpentSting', 'disengage', 'trap', 'rapidFire',
        'precision', 'combo', 'evasion', 'huntersMark',
      ],
      defaultSkills: ['steadyShot', 'multiShot', 'serpentSting', 'rapidFire', 'precision'],
    },
    mage: {
      key: 'mage',
      name: '法师',
      desc: '以魔法为资源，远程爆发与大范围法术，血薄但输出最高。',
      mainStat: 'int',
      resource: 'mana',
      base: { str: 6, agi: 10, vit: 10, int: 20 },
      growth: { str: 0.8, agi: 1.0, vit: 0.6, int: 3.0 },
      atkCoef: 1.78,
      attackRange: 5.0,
      sight: 10,
      skillPool: [
        'fireball', 'arcaneMissile', 'frostCone', 'blizzard', 'blink', 'arcanePower',
        'manaSurge', 'elementalMastery', 'arcaneShield', 'frostBlood',
      ],
      defaultSkills: ['fireball', 'frostCone', 'blizzard', 'arcanePower', 'elementalMastery'],
    },
  };

  /* ---------------- 技能 ---------------- */
  // type: active / passive
  // 主动技能：cost 为资源消耗，cd 为冷却（秒，0 表示无 CD）
  // 被动技能：效果数值按等级线性成长，见 PASSIVE_GROWTH
  const SKILLS = {
    heroicStrike: {
      key: 'heroicStrike', name: '英勇打击', type: 'active',
      cost: 15, cd: 0, range: 'single', dmg: 1.5,
      desc: '对主目标造成 150% 伤害',
    },
    whirlwind: {
      key: 'whirlwind', name: '旋风斩', type: 'active',
      cost: 25, cd: 0, range: 'aoe', radius: 3.6, dmg: 2.6,
      desc: '对周围 3.6 格内所有敌人造成 260% 伤害',
    },
    charge: {
      key: 'charge', name: '冲锋', type: 'active',
      cost: 20, cd: 0, range: 'charge', radius: 2.3, dmg: 1.8,
      desc: '冲向目标，落地对 2.3 格内敌人造成 180% 伤害',
    },
    thunderClap: {
      key: 'thunderClap', name: '雷霆一击', type: 'active',
      cost: 30, cd: 0, range: 'aoe', radius: 2.8, dmg: 1.2, slow: 5,
      desc: '对周围 2.8 格内敌人造成 120% 伤害并减速 5 秒',
    },
    mortalStrike: {
      key: 'mortalStrike', name: '致死打击', type: 'active',
      cost: 35, cd: 0, range: 'single', dmg: 2.0,
      dot: { ratio: 0.6, dur: 5 },
      desc: '对主目标造成 200% 伤害，并附加 5 秒重伤',
    },
    recklessness: {
      key: 'recklessness', name: '狂暴', type: 'active',
      cost: 40, cd: 26, range: 'buff',
      desc: '8 秒内攻击速度 +80%、攻击力 +35%',
    },

    secondWind: {
      key: 'secondWind', name: '二次打击', type: 'passive',
      desc: '普通攻击有几率追加一次 50% 伤害的攻击',
    },
    splatter: {
      key: 'splatter', name: '溅射', type: 'passive',
      desc: '攻击附带溅射伤害',
    },
    brutalCrit: {
      key: 'brutalCrit', name: '暴击', type: 'passive',
      desc: '提升暴击率与暴击伤害',
    },
    bloodthirst: {
      key: 'bloodthirst', name: '吸血', type: 'passive',
      desc: '攻击时按伤害回复生命',
    },

    /* ---- 游侠 ---- */
    steadyShot: {
      key: 'steadyShot', name: '稳固射击', type: 'active',
      cost: 20, cd: 0, range: 'single', dmg: 1.8,
      desc: '对主目标造成 180% 伤害',
    },
    multiShot: {
      key: 'multiShot', name: '多重射击', type: 'active',
      cost: 30, cd: 0, range: 'cone', radius: 4.5, dmg: 1.5, maxTargets: 3,
      desc: '对前方最多 3 个敌人各造成 150% 伤害',
    },
    serpentSting: {
      key: 'serpentSting', name: '毒蛇钉刺', type: 'active',
      cost: 25, cd: 0, range: 'single', dmg: 0.3,
      dot: { ratio: 0.4, dur: 5 },
      desc: '造成少量伤害并附加 5 秒中毒',
    },
    disengage: {
      key: 'disengage', name: '后跳', type: 'active',
      cost: 15, cd: 8, range: 'escape', distance: 3, dmg: 1.2,
      desc: '向后弹开 3 格并射击一次',
    },
    trap: {
      key: 'trap', name: '陷阱', type: 'active',
      cost: 35, cd: 15, range: 'trap', radius: 2.5, dmg: 2.0,
      desc: '在脚下布置陷阱，命中的敌人受 200% 伤害并减速',
    },
    rapidFire: {
      key: 'rapidFire', name: '急速射击', type: 'active',
      cost: 40, cd: 26, range: 'buff',
      desc: '8 秒内攻击速度 +100%、暴击率 +15%',
    },

    /* ---- 游侠被动 ---- */
    precision: {
      key: 'precision', name: '精准', type: 'passive',
      desc: '提升暴击率',
    },
    combo: {
      key: 'combo', name: '连击', type: 'passive',
      desc: '连续命中同一目标时伤害递增',
    },
    evasion: {
      key: 'evasion', name: '闪避', type: 'passive',
      desc: '受到攻击有几率完全闪避',
    },
    huntersMark: {
      key: 'huntersMark', name: '猎手印记', type: 'passive',
      desc: '对高生命值目标造成额外伤害',
    },

    /* ---- 法师 ---- */
    arcaneMissile: {
      key: 'arcaneMissile', name: '奥术飞弹', type: 'active',
      cost: 15, cd: 0, range: 'single', dmg: 1.2,
      desc: '对主目标造成 120% 奥术伤害，消耗低',
    },
    fireball: {
      key: 'fireball', name: '火球术', type: 'active',
      cost: 25, cd: 0, range: 'single', dmg: 2.2,
      desc: '对主目标造成 220% 火焰伤害',
    },
    frostCone: {
      key: 'frostCone', name: '冰锥术', type: 'active',
      cost: 30, cd: 0, range: 'cone', radius: 4.5, dmg: 1.6, maxTargets: 3,
      desc: '对前方最多 3 个敌人造成 160% 冰霜伤害',
    },
    blizzard: {
      key: 'blizzard', name: '暴风雪', type: 'active',
      cost: 45, cd: 12, range: 'aoe', radius: 3.6, dmg: 1.5,
      desc: '对周围 3.6 格内所有敌人造成 150% 伤害',
    },
    blink: {
      key: 'blink', name: '闪现', type: 'active',
      cost: 15, cd: 10, range: 'escape', distance: 4, dmg: 0,
      desc: '瞬间拉开 4 格距离',
    },
    arcanePower: {
      key: 'arcanePower', name: '奥术强化', type: 'active',
      cost: 40, cd: 26, range: 'buff',
      desc: '8 秒内攻击速度 +50%、攻击力 +40%',
    },

    /* ---- 法师被动 ---- */
    manaSurge: {
      key: 'manaSurge', name: '法力涌动', type: 'passive',
      desc: '提升魔法值上限',
    },
    elementalMastery: {
      key: 'elementalMastery', name: '元素精通', type: 'passive',
      desc: '所有伤害提升',
    },
    arcaneShield: {
      key: 'arcaneShield', name: '奥术护盾', type: 'passive',
      desc: '受到的伤害降低',
    },
    frostBlood: {
      key: 'frostBlood', name: '冰冷血脉', type: 'passive',
      desc: '提升暴击伤害',
    },
  };

  // 被动按 1 级 → 50 级线性插值
  const PASSIVE_GROWTH = {
    secondWind: { chance: [15, 40], dmg: [0.5, 0.75] },
    splatter: { splash: [20, 40] },
    brutalCrit: { crit: [3, 13], critDmg: [15, 35] },
    bloodthirst: { lifesteal: [3, 15] },
    precision: { crit: [3, 13] },
    combo: { comboPerHit: [2, 2] },
    evasion: { evade: [8, 18] },
    huntersMark: { markDmg: [10, 30] },
    manaSurge: { mpPct: [10, 30] },
    elementalMastery: { elemDmg: [3, 10] },
    arcaneShield: { dmgReduce: [3, 12] },
    frostBlood: { critDmg: [10, 30] },
  };
  const PASSIVE_MAX_LEVEL = 50;

  /* ---------------- 职业属性系数 ---------------- */
  const STAT_COEF = {
    str: { atkPerPoint: 1.5 },
    agi: { armorPerPoint: 0.2, atkSpeedPerPoint: 0.1 },
    vit: { hpPerPoint: 8 },
    int: { mpPerPoint: 4, mpRegenPerPoint: 0.12, skillEffectPerPoint: 0.2, mpRegenBase: 3 },
  };

  const CLASS_KEYS = Object.keys(CLASSES);

  /* ---------------- 成就 ---------------- */
  // type: floor / kills / level / gold / elite / boss / unique / ascension
  const ACHIEVEMENTS = [
    { key: 'firstStep',  name: '初入地牢', desc: '到达第 1 层',        type: 'floor', value: 1,    reward: { atkPct: 1 } },
    { key: 'deep10',     name: '深入者',   desc: '到达第 10 层',       type: 'floor', value: 10,   reward: { atkPct: 2 } },
    { key: 'deep25',     name: '探索者',   desc: '到达第 25 层',       type: 'floor', value: 25,   reward: { hpPct: 2 } },
    { key: 'deep50',     name: '深渊行者', desc: '到达第 50 层',       type: 'floor', value: 50,   reward: { atkPct: 3, hpPct: 3 } },
    { key: 'kill100',    name: '屠戮者',   desc: '累计击杀 100 只怪物', type: 'kills', value: 100,  reward: { atkPct: 1 } },
    { key: 'kill1000',   name: '杀戮机器', desc: '累计击杀 1000 只怪物', type: 'kills', value: 1000, reward: { atkPct: 2 } },
    { key: 'kill5000',   name: '万人斩',   desc: '累计击杀 5000 只怪物', type: 'kills', value: 5000, reward: { atkPct: 4 } },
    { key: 'lv20',       name: '独当一面', desc: '达到 20 级',         type: 'level', value: 20,   reward: { hpPct: 2 } },
    { key: 'lv40',       name: '身经百战', desc: '达到 40 级',         type: 'level', value: 40,   reward: { hpPct: 3 } },
    { key: 'elite50',    name: '精英猎人', desc: '击杀 50 只精英怪',   type: 'elite', value: 50,   reward: { mfPct: 10 } },
    { key: 'boss10',     name: '首领终结者', desc: '击杀 10 个 BOSS',  type: 'boss',  value: 10,   reward: { atkPct: 2 } },
    { key: 'gold100k',   name: '富甲一方', desc: '累计获得 10 万金币', type: 'gold',  value: 100000, reward: { goldPct: 10 } },
    { key: 'unique1',    name: '暗金收藏家', desc: '获得 1 件暗金装备', type: 'unique', value: 1,  reward: { mfPct: 5 } },
    { key: 'item200',    name: '装备达人', desc: '累计拾取 200 件装备', type: 'items', value: 200,  reward: { mfPct: 5 } },
  ];

  /* ---------------- 部位专属词条池 ---------------- */
  // 每件装备只从对应部位的池子里抽词条，避免"所有装备都一样"
  const SLOT_AFFIX_POOL = {
    weapon: ['atk', 'crit', 'critDmg', 'atkSpeed', 'lifesteal', 'splash'],
    helmet: ['hp', 'def', 'crit', 'magicFind'],
    armor:  ['hp', 'def', 'magicFind'],
    gloves: ['atk', 'atkSpeed', 'crit', 'critDmg', 'splash'],
    boots:  ['hp', 'def', 'splashRadius', 'goldFind'],
    amulet: ['crit', 'critDmg', 'goldFind', 'magicFind', 'splash'],
    ring1:  ['atk', 'crit', 'splash', 'splashRadius', 'goldFind', 'magicFind', 'lifesteal'],
    ring2:  ['atk', 'crit', 'splash', 'splashRadius', 'goldFind', 'magicFind', 'lifesteal'],
  };
  const DATA = {
    QUALITY: QUALITY,
    QUALITY_ORDER: QUALITY_ORDER,
    SLOTS: SLOTS,
    SLOT_KEYS: SLOT_KEYS,
    AFFIXES: AFFIXES,
    AFFIX_KEYS: AFFIX_KEYS,
    BASE_NAMES: BASE_NAMES,
    UNIQUE_NAMES: UNIQUE_NAMES,
    MONSTERS: MONSTERS,
    BOSSES: BOSSES,
    FLOOR_NAMES: FLOOR_NAMES,
    CLASSES: CLASSES,
    CLASS_KEYS: CLASS_KEYS,
    SKILLS: SKILLS,
    PASSIVE_GROWTH: PASSIVE_GROWTH,
    PASSIVE_MAX_LEVEL: PASSIVE_MAX_LEVEL,
    STAT_COEF: STAT_COEF,
    ACHIEVEMENTS: ACHIEVEMENTS,
    SLOT_AFFIX_POOL: SLOT_AFFIX_POOL,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  root.DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
