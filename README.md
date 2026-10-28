# 暗黑挂机 · 刷装备

一个参考《暗黑破坏神》的**网页版挂机刷装备小游戏**。纯 HTML + CSS + JavaScript，**零依赖、零安装**——双击 `index.html` 就能玩。

## 怎么玩

1. 双击 `index.html`（推荐 Chrome / Edge）
2. 角色会**自动打怪**，你只需要看着、偶尔点一下
3. 掉落的装备会按品质自动比较，比身上好的自动穿上
4. 打不动了就开宝箱、分解垃圾装备、等变强

## 玩法机制

| 系统 | 说明 |
|---|---|
| **自动战斗** | 角色自动攻击当前层怪物，击杀 8 只小怪后出现 BOSS，击败 BOSS 进入下一层 |
| **装备品质** | 普通（白）→ 魔法（蓝）→ 稀有（黄）→ 传奇（橙）→ 暗金（绿），品质越高词条越多、数值越强 |
| **随机词条** | 攻击力、防御、生命、暴击率、暴击伤害、攻击速度、生命偷取、金币获取、寻宝几率 |
| **自动装备** | 掉落时自动比较评分，更强就穿上；可在侧栏关闭，改为手动从背包挑选 |
| **开宝箱** | 花金币抽装备，保底魔法品质，寻宝几率越高越容易出好东西 |
| **一键分解** | 把比当前装备差的全部换成金币 |
| **离线收益** | 关掉页面后再打开，按当前战力结算离线期间的金币、经验和装备（最多 8 小时） |
| **自动存档** | 每 5 秒自动存 localStorage，关页面也保留进度 |

## 快捷键

- `B`：开宝箱
- `S`：一键分解

## 文件结构

```
diablo-idle/
├── index.html          页面结构
├── css/style.css       暗黑风界面样式
├── js/
│   ├── data.js         静态数据：品质、槽位、词条池、怪物、场景名
│   ├── core.js         核心逻辑：战斗、掉落、装备、存档（纯逻辑，可 Node 测试）
│   ├── audio.js        WebAudio 合成音效（无音频文件）
│   ├── ui.js           DOM 渲染 + Canvas 战斗画面
│   └── main.js         启动、主循环、交互绑定
└── tests/
    ├── core.test.js    数值与掉落逻辑测试 + 20 小时模拟
    ├── e2e.cjs         Playwright 浏览器端到端测试
    ├── e2e-save.cjs    存档 / 离线结算测试
    └── e2e-ui.cjs      tooltip / 装备 / 分解交互测试
```

## 跑测试

```bash
node tests/core.test.js     # 逻辑 + 数值模拟
node tests/e2e.cjs          # 需要本机 Edge，浏览器端验证
node tests/e2e-save.cjs
node tests/e2e-ui.cjs
```

## 想自己改数值

打开 `js/core.js`，顶部这几个函数控制全部成长曲线：

```js
function expToNext(level)        // 升级所需经验
function monsterHp(floor)        // 每层怪物血量
function monsterAtk(floor)       // 每层怪物攻击
function monsterExp(floor)       // 每层怪物经验
function monsterGold(floor)      // 每层怪物金币
```

装备词条成长在 `affixValue()` 里，品质倍率在 `QUALITY_MULT`。

改完刷新页面即可生效（存档里的旧装备数值不会重算，想重来就点「重置存档」）。
