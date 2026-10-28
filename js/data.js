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
  const MONSTERS = [
    { name: '腐尸',     shape: 'slime',    color: '#6b7a45', weight: 12 },
    { name: '骷髅战士', shape: 'skeleton', color: '#cfc7ad', weight: 12 },
    { name: '地狱犬',   shape: 'beast',    color: '#8a3324', weight: 11 },
    { name: '堕落法师', shape: 'mage',     color: '#6a4a8a', weight: 10 },
    { name: '食尸鬼',   shape: 'slime',    color: '#7a6a55', weight: 10 },
    { name: '石像鬼',   shape: 'beast',    color: '#767676', weight: 9 },
    { name: '血族贵胄', shape: 'mage',     color: '#9a1a2e', weight: 8 },
    { name: '深渊魔像', shape: 'golem',    color: '#4a3a3a', weight: 7 },
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
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  root.DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
