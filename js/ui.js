/**
 * ui.js —— DOM 界面 + 等距（2.5D）地牢渲染
 * 只负责“表现”，数值与状态全部来自 core.js
 */
(function () {
  'use strict';
  const D = window.DATA;
  const C = window.CORE;
  const M = window.MAP;

  /* ============================================================
     工具
     ============================================================ */
  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    n = Number(n);
    if (n < 1000) return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
    if (n < 1e4) return (Math.round(n / 100) / 10) + 'K';
    if (n < 1e8) return (Math.round(n / 1e4 * 100) / 100) + '万';
    if (n < 1e12) return (Math.round(n / 1e8 * 100) / 100) + '亿';
    if (n < 1e16) return (Math.round(n / 1e12 * 100) / 100) + '万亿';
    return n.toExponential(2);
  }
  function pct(n) { return (Math.round(n * 10) / 10) + '%'; }
  function qColor(k) { return (D.QUALITY[k] || D.QUALITY.normal).color; }
  function affixText(a) {
    const def = D.AFFIXES[a.key];
    const v = def.pct ? pct(a.value) : '+' + fmt(a.value);
    return v + ' ' + def.name;
  }
  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ============================================================
     等距场景
     ============================================================ */
  const TW = 68;
  const TH = 34;
  const WALL_H = 58;

  const Scene = {
    canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
    t: 0,
    cam: { x: 0, y: 0 },
    camInit: false,
    shake: 0,
    floats: [],
    parts: [],
    ripples: [],
    dying: [],
    projectiles: [],
    flash: 0,
    flashColor: '255,220,140',
    hurtFlash: 0,
    playerHurtT: 0,
    healFlash: 0,
    levelGlow: 0,
    swingT: 0,
    _px: 0, _py: 0,
    mmDirty: true,
    mmLastX: 0, mmLastY: 0,
    mmCanvas: null, mmCtx: null,
    mmW: 158, mmH: 93,
    mmExpanded: false,
    mmRect: null,
    _mmMap: null,

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.mmCanvas = document.createElement('canvas');
      this.mmCtx = this.mmCanvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas.parentElement);

      // 点击小地图切换展开 / 收起
      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const r = this.mmRect;
        if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          this.mmExpanded = !this.mmExpanded;
          this.mmDirty = true;
        } else if (this.mmExpanded) {
          this.mmExpanded = false;
        }
      });
    },

    resize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.W = Math.max(320, rect.width);
      this.H = Math.max(240, rect.height);
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.mmW = Math.round(Math.max(110, Math.min(168, this.W * 0.28)));
      this.mmH = Math.round(this.mmW / 2 + 14);
      if (this.mmCanvas) {
        this.mmCanvas.width = Math.round(512 * this.dpr);
        this.mmCanvas.height = Math.round(276 * this.dpr);
        this.mmDirty = true;
      }
    },

    iso(gx, gy) { return { x: (gx - gy) * TW / 2, y: (gx + gy) * TH / 2 }; },

    worldToScreen(gx, gy) {
      const p = this.iso(gx, gy);
      return { x: p.x - this.cam.x + this.W / 2, y: p.y - this.cam.y + this.H / 2 };
    },

    addFloat(gx, gy, text, color, size, dy) {
      const p = this.worldToScreen(gx, gy);
      this.floats.push({
        x: p.x + (Math.random() * 36 - 18),
        y: p.y - (dy || 30) + (Math.random() * 8 - 4),
        text, color, size: size || 15, vy: -52, life: 1,
      });
      if (this.floats.length > 36) this.floats.shift();
    },
    addParts(gx, gy, color, n, power) {
      const p = this.worldToScreen(gx, gy);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.3 + Math.random()) * (power || 90);
        this.parts.push({
          x: p.x, y: p.y - 14,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          life: 0.45 + Math.random() * 0.5,
          size: 1 + Math.random() * 2.4, color,
        });
      }
      if (this.parts.length > 200) this.parts.splice(0, this.parts.length - 200);
    },

    handle(ev) {
      switch (ev.type) {
        case 'swing':
          this.swingT = 0.35;
          if (ev.ranged && ev.tx !== undefined) {
            this.projectiles.push({ x1: ev.x, y1: ev.y, x2: ev.tx, y2: ev.ty, t: 0 });
          } else {
            this.ripples.push({ x: ev.x, y: ev.y, t: 0 });
          }
          break;
        case 'hit':
          if (ev.splash) {
            // 溅射：小一号的橙色数字，避免和主伤害混淆
            this.addFloat(ev.monster.x, ev.monster.y, '-' + fmt(ev.dmg), ev.crit ? '#ffb030' : '#e08a50', ev.crit ? 14 : 11, 34);
          } else {
            this.addFloat(ev.monster.x, ev.monster.y, '-' + fmt(ev.dmg), ev.crit ? '#ffcf4a' : '#f2e8d6', ev.crit ? 21 : 15, 42);
            this.addParts(ev.monster.x, ev.monster.y, ev.crit ? '#ffb347' : '#c8b89a', ev.crit ? 8 : 4, 110);
            if (ev.crit) this.shake = Math.max(this.shake, 3);
          }
          break;
        case 'splash':
          this.ripples.push({ x: ev.x, y: ev.y, t: 0, splash: true });
          break;
        case 'monsterDied':
          this.dying.push({ m: ev.monster, t: 1 });
          this.addParts(ev.monster.x, ev.monster.y, ev.monster.color, 16, 140);
          this.addFloat(ev.monster.x, ev.monster.y, '+' + fmt(ev.gold) + ' 金币', '#e8c04a', 14, 56);
          break;
        case 'monsterShot':
          if (ev.from) {
            this.projectiles.push({
              x1: ev.from.x, y1: ev.from.y,
              x2: this._px, y2: this._py,
              t: 0, enemy: true,
            });
          }
          break;
        case 'playerHurt':
          this.hurtFlash = 1;
          this.playerHurtT = 1;
          this.shake = Math.max(this.shake, 5);
          // 伤害数字打在玩家头上
          this.addFloat(this._px, this._py, '-' + fmt(ev.dmg), '#ff5252', 18, 52);
          this.addParts(this._px, this._py, '#a01818', 6, 90);
          break;
        case 'dodge':
          this.addFloat(this._px, this._py, '闪避', '#7ae0d0', 16, 50);
          break;
        case 'heal':
          this.healFlash = 1;
          this.addFloat(this._px, this._py, '+' + fmt(ev.amount), '#5ad47a', 14, 40);
          break;
        case 'levelUp':
          this.levelGlow = 1;
          this.addFloat(this._px, this._py, 'LEVEL UP', '#7ae08a', 22, 80);
          this.addParts(this._px, this._py, '#7ae08a', 18, 130);
          break;
        case 'drop':
          if (ev.x !== undefined) {
            this.addFloat(ev.x, ev.y, '掉落！', qColor(ev.item.quality), 14, 50);
            this.addParts(ev.x, ev.y, qColor(ev.item.quality), 8, 70);
          }
          break;
        case 'skill':
          if (ev.ranged && ev.tx !== undefined) {
            this.projectiles.push({ x1: this._px, y1: this._py, x2: ev.tx, y2: ev.ty, t: 0, big: true });
          }
          if (ev.key === 'whirlwind') {
            this.ripples.push({ x: ev.x, y: ev.y, t: 0, big: true });
            this.shake = Math.max(this.shake, 5);
            this.addFloat(ev.x, ev.y, '旋风斩', '#ffd88a', 20, 70);
          } else if (ev.key === 'charge') {
            this.shake = Math.max(this.shake, 6);
            this.addFloat(ev.x, ev.y, '冲锋', '#8ad4ff', 18, 62);
          } else if (ev.key === 'berserk') {
            this.levelGlow = 1;
            this.flash = 0.7;
            this.flashColor = '220,90,40';
            this.addFloat(ev.x, ev.y, '狂暴', '#ff7a3a', 22, 74);
          }
          break;
        case 'floorUp':
          this.flash = 1;
          this.flashColor = '255,210,120';
          this.camInit = false;
          break;
        case 'death':
          this.flash = 1;
          this.flashColor = '180,20,20';
          this.shake = 12;
          break;
      }
    },

    update(dt, state) {
      this.t += dt;
      this.shake *= Math.pow(0.0015, dt);
      this.flash = Math.max(0, this.flash - dt * 1.6);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
      this.playerHurtT = Math.max(0, this.playerHurtT - dt * 2.2);
      this.healFlash = Math.max(0, this.healFlash - dt * 2.5);
      this.levelGlow = Math.max(0, this.levelGlow - dt * 1.4);
      this.swingT = Math.max(0, this.swingT - dt * 3);

      if (!state.run) return;
      const p = state.run.pos;
      this._px = p.x; this._py = p.y;
      this._cls = state.player.cls;

      if (Math.abs(p.x - this.mmLastX) + Math.abs(p.y - this.mmLastY) > 0.35) {
        this.mmLastX = p.x; this.mmLastY = p.y;
        this.mmDirty = true;
      }
      const target = this.iso(p.x, p.y);
      if (!this.camInit) {
        this.cam.x = target.x; this.cam.y = target.y;
        this.camInit = true;
      } else {
        const k = Math.min(1, dt * 7);
        this.cam.x += (target.x - this.cam.x) * k;
        this.cam.y += (target.y - this.cam.y) * k;
      }

      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.y += f.vy * dt;
        f.vy *= Math.pow(0.1, dt);
        f.life -= dt * 1.15;
        if (f.life <= 0) this.floats.splice(i, 1);
      }
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const q = this.parts[i];
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += 260 * dt;
        q.life -= dt * 1.7;
        if (q.life <= 0) this.parts.splice(i, 1);
      }
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        this.ripples[i].t += dt;
        if (this.ripples[i].t > 0.4) this.ripples.splice(i, 1);
      }
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        this.projectiles[i].t += dt * 4.5;
        if (this.projectiles[i].t >= 1) this.projectiles.splice(i, 1);
      }
      for (let i = this.dying.length - 1; i >= 0; i--) {
        this.dying[i].t -= dt * 1.7;
        if (this.dying[i].t <= 0) this.dying.splice(i, 1);
      }
    },

    draw(state) {
      const ctx = this.ctx, W = this.W, H = this.H;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#050403';
      ctx.fillRect(0, 0, W, H);
      if (this.shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      }
      if (!state.run) return;
      const run = state.run;
      const map = run.map;

      this.drawFloor(ctx, map);
      this.drawWallsAndUnits(ctx, map, run);

      for (let i = 0; i < this.ripples.length; i++) {
        const r = this.ripples[i];
        const p = this.worldToScreen(r.x, r.y);
        const k = r.t / 0.4;
        const radius = r.big ? (30 + k * 130) : (r.splash ? (10 + k * 34) : (20 + k * 60));
        ctx.strokeStyle = r.splash
          ? 'rgba(255, 150, 70, ' + (1 - k) * 0.5 + ')'
          : 'rgba(255, 220, 150, ' + (1 - k) * 0.55 + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 6, radius, radius * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let i = 0; i < this.parts.length; i++) {
        const p = this.parts[i];
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // 箭矢弹道
      for (let i = 0; i < this.projectiles.length; i++) {
        const pr = this.projectiles[i];
        const k = Math.min(1, pr.t);
        const gx = pr.x1 + (pr.x2 - pr.x1) * k;
        const gy = pr.y1 + (pr.y2 - pr.y1) * k;
        const a = this.worldToScreen(gx, gy);
        const b = this.worldToScreen(pr.x2, pr.y2);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const size = pr.big ? 1.5 : 1;
        ctx.save();
        ctx.translate(a.x, a.y - 20);
        ctx.rotate(ang);
        // 拖尾（敌方暗紫色）
        const tail = ctx.createLinearGradient(-38 * size, 0, 8 * size, 0);
        if (pr.enemy) {
          tail.addColorStop(0, 'rgba(150,90,220,0)');
          tail.addColorStop(1, 'rgba(190,130,255,0.9)');
        } else {
          tail.addColorStop(0, 'rgba(255,220,140,0)');
          tail.addColorStop(1, 'rgba(255,235,180,0.9)');
        }
        ctx.strokeStyle = tail;
        ctx.lineWidth = 3.2 * size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-38 * size, 0);
        ctx.lineTo(8 * size, 0);
        ctx.stroke();
        // 箭头
        ctx.shadowColor = pr.enemy ? '#b47aff' : '#ffd77a';
        ctx.shadowBlur = 8;
        ctx.fillStyle = pr.enemy ? '#e8d0ff' : '#fff6d8';
        ctx.beginPath();
        ctx.moveTo(12 * size, 0);
        ctx.lineTo(4 * size, -4 * size);
        ctx.lineTo(4 * size, 4 * size);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      for (let i = 0; i < this.floats.length; i++) {
        const f = this.floats[i];
        const a = Math.max(0, Math.min(1, f.life * 1.4));
        ctx.globalAlpha = a;
        ctx.font = 'bold ' + f.size + 'px "Songti SC", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.88)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      if (this.levelGlow > 0) {
        ctx.fillStyle = 'rgba(110, 220, 130, ' + (this.levelGlow * 0.14) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      if (this.hurtFlash > 0) {
        // 受击瞬间整屏泛红，然后快速衰减
        ctx.fillStyle = 'rgba(190, 24, 24, ' + (this.hurtFlash * 0.14) + ')';
        ctx.fillRect(0, 0, W, H);
        // 四周更浓的红色晕影
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
        vg.addColorStop(0, 'rgba(180,0,0,0)');
        vg.addColorStop(1, 'rgba(180,0,0,' + (this.hurtFlash * 0.32) + ')');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
      }
      if (this.flash > 0) {
        ctx.fillStyle = 'rgba(' + this.flashColor + ',' + (this.flash * 0.35) + ')';
        ctx.fillRect(0, 0, W, H);
      }

      // 玩家血条（屏幕底部）
      if (state.stats) {
        const hpRatio = Math.max(0, Math.min(1, state.player.hp / state.stats.hpMax));
        const bw = Math.min(340, W * 0.42), bh = 14;
        const bx = W / 2 - bw / 2, by = H - 32;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.fillStyle = '#1a0707';
        ctx.fillRect(bx, by, bw, bh);
        const hpGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        if (hpRatio > 0.35) {
          hpGrad.addColorStop(0, '#8a1010');
          hpGrad.addColorStop(1, '#d63a3a');
        } else {
          hpGrad.addColorStop(0, '#c02020');
          hpGrad.addColorStop(1, '#ff5050');
        }
        ctx.fillStyle = hpGrad;
        ctx.fillRect(bx, by, bw * hpRatio, bh);
        // 回复时血条闪绿
        if (this.healFlash > 0) {
          ctx.fillStyle = 'rgba(106, 212, 122, ' + (this.healFlash * 0.45) + ')';
          ctx.fillRect(bx, by, bw * hpRatio, bh);
        }
        ctx.strokeStyle = 'rgba(150,120,85,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        ctx.font = '11px "Songti SC", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f0e4d0';
        ctx.fillText(Math.ceil(state.player.hp) + ' / ' + Math.round(state.stats.hpMax), W / 2, by + 11);
      }

      const g = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      this.drawMinimap(ctx, map, run);
    },

    /* ---------- 小地图（等距投影，可点击展开） ---------- */
    drawMinimap(ctx, map, run) {
      const MM_CW = 512, MM_CH = 276;   // 离屏画布的固定逻辑尺寸
      let mw, mh, x0, y0;

      if (this.mmExpanded) {
        mw = Math.min(this.W * 0.66, 560);
        mh = mw / 2 + 26;
        if (mh > this.H * 0.82) { mh = this.H * 0.82; mw = (mh - 26) * 2; }
        x0 = (this.W - mw) / 2;
        y0 = (this.H - mh) / 2;
        // 展开时用暗幕压住后面的战斗画面
        ctx.fillStyle = 'rgba(0,0,0,0.66)';
        ctx.fillRect(0, 0, this.W, this.H);
      } else {
        mw = this.mmW; mh = this.mmH;
        x0 = this.W - mw - 14;
        y0 = 14;
      }
      this.mmRect = { x: x0, y: y0, w: mw, h: mh };

      const cw = MM_CW / map.w;
      const ch = cw / 2;
      const cyc = (map.w + map.h - 2) / 2;

      if (this.mmDirty || this._mmMap !== map) {
        this._mmMap = map;
        this.rebuildMinimap(map, MM_CW, MM_CH, cw, ch, cyc);
        this.mmDirty = false;
      }

      ctx.save();
      ctx.fillStyle = 'rgba(10,8,6,0.86)';
      ctx.fillRect(x0 - 1, y0 - 1, mw + 2, mh + 2);
      ctx.drawImage(this.mmCanvas, x0, y0, mw, mh);

      // 统一换算：离屏坐标 → 屏幕坐标
      const sx = mw / MM_CW, sy = mh / MM_CH;
      const toX = function (gx, gy) { return x0 + (MM_CW / 2 + (gx - gy) * cw / 2) * sx; };
      const toY = function (gx, gy) { return y0 + (MM_CH / 2 + (gx + gy - cyc) * ch / 2) * sy; };
      const dot = this.mmExpanded ? 1.7 : 1;

      // 怪物点
      for (let i = 0; i < run.monsters.length; i++) {
        const m = run.monsters[i];
        if (!m.alive) continue;
        const ti = Math.floor(m.y) * map.w + Math.floor(m.x);
        if (!this.mmExpanded && !map.explored[ti]) continue;
        ctx.fillStyle = m.isBoss ? '#ff5a2a' : (m.isElite ? '#e8c04a' : '#d24a4a');
        ctx.beginPath();
        ctx.arc(toX(m.x, m.y), toY(m.x, m.y), (m.isBoss ? 3.2 : (m.isElite ? 2.5 : 1.9)) * dot, 0, Math.PI * 2);
        ctx.fill();
      }

      // 玩家
      const px = toX(run.pos.x, run.pos.y);
      const py = toY(run.pos.x, run.pos.y);
      const pulse = 0.65 + Math.sin(this.t * 4) * 0.35;
      ctx.fillStyle = 'rgba(255, 214, 90, ' + (0.32 * pulse) + ')';
      ctx.beginPath();
      ctx.arc(px, py, 7 * dot, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd750';
      ctx.beginPath();
      ctx.arc(px, py, 2.8 * dot, 0, Math.PI * 2);
      ctx.fill();

      // 边框
      ctx.strokeStyle = 'rgba(140,116,80,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, mw - 1, mh - 1);

      // 标题 / 图例 / 提示
      ctx.font = '10px "Songti SC", Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(150,130,100,0.85)';
      ctx.fillText(this.mmExpanded ? '地牢地图（点击关闭）' : '地牢地图（点击展开）', x0 + 2, y0 - 5);

      if (this.mmExpanded) {
        const ly = y0 + mh + 16;
        ctx.font = '12px "Songti SC", Georgia, serif';
        const items = [
          ['#ffd750', '你'],
          ['#d24a4a', '怪物'],
          ['#e8c04a', '精英'],
          ['#ff5a2a', 'BOSS'],
          ['#c9a227', '出口'],
        ];
        let lx = x0 + 10;
        for (let i = 0; i < items.length; i++) {
          ctx.fillStyle = items[i][0];
          ctx.beginPath();
          ctx.arc(lx + 4, ly - 4, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(180,160,130,0.9)';
          ctx.fillText(items[i][1], lx + 12, ly);
          lx += ctx.measureText(items[i][1]).width + 34;
        }
      }
      ctx.restore();
    },

    rebuildMinimap(map, mw, mh, cw, ch, cyc) {
      const c = this.mmCtx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, mw, mh);
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const i = y * map.w + x;
          const t = map.tiles[i];
          const seen = map.explored[i];
          // 等距坐标：和主画面同一个 45° 视角
          const cx = mw / 2 + (x - y) * cw / 2;
          const cy = mh / 2 + (x + y - cyc) * ch / 2;
          c.beginPath();
          c.moveTo(cx, cy - ch / 2 - 0.3);
          c.lineTo(cx + cw / 2 + 0.4, cy);
          c.lineTo(cx, cy + ch / 2 + 0.3);
          c.lineTo(cx - cw / 2 - 0.4, cy);
          c.closePath();
          if (t === M.TILE.WALL) c.fillStyle = seen ? '#3a332b' : 'rgba(66,58,48,0.34)';
          else if (t === M.TILE.EXIT) c.fillStyle = seen ? '#c9a227' : 'rgba(120,96,40,0.4)';
          else c.fillStyle = seen ? '#5f5241' : 'rgba(70,60,48,0.16)';
          c.fill();
        }
      }
    },

    drawFloor(ctx, map) {
      const W = this.W, H = this.H;
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const i = y * map.w + x;
          const t = map.tiles[i];
          if (t === M.TILE.WALL) continue;
          const p = this.worldToScreen(x, y);
          if (p.x < -TW || p.x > W + TW || p.y < -TH * 2 || p.y > H + TH * 2) continue;

          // 未探索区域：只画一个极暗的轮廓，保留地图形状
          if (!map.explored[i]) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - TH / 2);
            ctx.lineTo(p.x + TW / 2, p.y);
            ctx.lineTo(p.x, p.y + TH / 2);
            ctx.lineTo(p.x - TW / 2, p.y);
            ctx.closePath();
            ctx.fillStyle = 'rgba(22,19,16,0.75)';
            ctx.fill();
            continue;
          }

          const h = hash2(x, y);
          const isExit = t === M.TILE.EXIT;

          ctx.beginPath();
          ctx.moveTo(p.x, p.y - TH / 2);
          ctx.lineTo(p.x + TW / 2, p.y);
          ctx.lineTo(p.x, p.y + TH / 2);
          ctx.lineTo(p.x - TW / 2, p.y);
          ctx.closePath();

          if (isExit) {
            const grad = ctx.createLinearGradient(p.x, p.y - TH / 2, p.x, p.y + TH / 2);
            grad.addColorStop(0, '#6a5a30');
            grad.addColorStop(1, '#3a2f18');
            ctx.fillStyle = grad;
          } else {
            const v = 38 + h * 17;
            ctx.fillStyle = 'rgb(' + Math.round(v + 10) + ',' + Math.round(v + 4) + ',' + Math.round(v - 4) + ')';
          }
          ctx.fill();

          if (!isExit && h > 0.55) {
            ctx.strokeStyle = 'rgba(255,220,170,0.045)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x - TW * 0.22, p.y - TH * 0.1);
            ctx.lineTo(p.x + TW * 0.1, p.y + TH * 0.14);
            ctx.stroke();
          }
          if (h > 0.86) {
            ctx.fillStyle = 'rgba(110,16,12,0.20)';
            ctx.beginPath();
            ctx.ellipse(p.x + (h - 0.86) * 80, p.y + 4, 9, 4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          if (isExit) {
            ctx.strokeStyle = 'rgba(240, 200, 100, 0.75)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - TH / 2);
            ctx.lineTo(p.x + TW / 2, p.y);
            ctx.lineTo(p.x, p.y + TH / 2);
            ctx.lineTo(p.x - TW / 2, p.y);
            ctx.closePath();
            ctx.stroke();
            const glow = 0.5 + Math.sin(this.t * 3) * 0.3;
            ctx.fillStyle = 'rgba(255,200,90,' + glow * 0.22 + ')';
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, TW * 0.28, TH * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    },

    drawWallsAndUnits(ctx, map, run) {
      const W = this.W, H = this.H;
      const ppx = this.worldToScreen(run.pos.x, run.pos.y);
      const pdepth = Math.floor(run.pos.x + run.pos.y);
      const maxD = map.w + map.h;
      const buckets = new Array(maxD + 2);
      const push = function (d, item) {
        if (buckets[d]) buckets[d].push(item); else buckets[d] = [item];
      };

      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const i = y * map.w + x;
          if (!map.explored[i]) continue;
          if (map.tiles[i] !== M.TILE.WALL) continue;
          const south = (y + 1 < map.h) ? map.tiles[(y + 1) * map.w + x] : 0;
          const east = (x + 1 < map.w) ? map.tiles[y * map.w + (x + 1)] : 0;
          const p = this.worldToScreen(x, y);
          if (p.x < -TW * 2 || p.x > W + TW * 2 || p.y < -WALL_H - TH * 2 || p.y > H + TW) continue;
          // 只有"挡在角色前方"的墙才虚化：既保证能看见角色/怪物，又保留墙的体积感
          const sdx = p.x - ppx.x;
          const sdy = p.y - ppx.y;
          const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
          const inFront = (x + y) > pdepth;
          let alpha = 1;
          if (inFront && sdist < TW * 1.35) alpha = 0.34;
          else if (inFront && sdist < TW * 1.95) alpha = 0.66;
          // 怪物身边的墙也淡出，避免怪物被墙完全遮住
          if (alpha === 1) {
            for (let mi = 0; mi < run.monsters.length; mi++) {
              const mm = run.monsters[mi];
              if (!mm.alive) continue;
              const mdx = (x + 0.5) - mm.x, mdy = (y + 0.5) - mm.y;
              if (mdx * mdx + mdy * mdy < 1.8) { alpha = 0.45; break; }
            }
          }
          push(x + y, { kind: 'wall', px: p.x, py: p.y, south, east, h: hash2(x, y), alpha });
        }
      }

      const ms = run.monsters;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (!m.alive) continue;
        // 迷雾里的怪不画（保持探索感，也避免怪物浮在黑底上）
        const ti = Math.floor(m.y) * map.w + Math.floor(m.x);
        if (!map.explored[ti]) continue;
        if (C.dist(m, run.pos) > 18) continue;
        const offX = (hash2(m.id, 7) - 0.5) * 0.34;
        const offY = (hash2(m.id, 13) - 0.5) * 0.34;
        const p = this.worldToScreen(m.x + offX, m.y + offY);
        if (p.x < -80 || p.x > W + 80 || p.y < -120 || p.y > H + 80) continue;
        push(Math.floor(m.x + m.y), { kind: 'monster', m, px: p.x, py: p.y });
      }

      push(pdepth, { kind: 'player', px: ppx.x, py: ppx.y });

      for (let d = 0; d < buckets.length; d++) {
        const b = buckets[d];
        if (!b) continue;
        for (let i = 0; i < b.length; i++) {
          const it = b[i];
          if (it.kind === 'wall') this.drawWall(ctx, it);
          else if (it.kind === 'monster') this.drawMonsterAt(ctx, it.m, it.px, it.py);
          else this.drawPlayerAt(ctx, it.px, it.py);
        }
      }

      for (let i = 0; i < this.dying.length; i++) {
        const d = this.dying[i];
        const p = this.worldToScreen(d.m.x, d.m.y);
        ctx.save();
        ctx.globalAlpha = Math.max(0, d.t) * 0.8;
        this.drawMonsterAt(ctx, d.m, p.x, p.y, true);
        ctx.restore();
      }
    },

    drawWall(ctx, it) {
      const px = it.px, py = it.py, h = it.h;
      const topY = py - WALL_H;
      const g = 46 + h * 16;
      ctx.save();
      ctx.globalAlpha = it.alpha === undefined ? 1 : it.alpha;

      ctx.beginPath();
      ctx.moveTo(px, topY - TH / 2);
      ctx.lineTo(px + TW / 2, topY);
      ctx.lineTo(px, topY + TH / 2);
      ctx.lineTo(px - TW / 2, topY);
      ctx.closePath();
      ctx.fillStyle = 'rgb(' + Math.round(g) + ',' + Math.round(g * 0.94) + ',' + Math.round(g * 0.86) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 左下立面（朝向 y+1 方向）
      if (it.south !== M.TILE.WALL) {
        ctx.beginPath();
        ctx.moveTo(px - TW / 2, topY);
        ctx.lineTo(px, topY + TH / 2);
        ctx.lineTo(px, py + TH / 2);
        ctx.lineTo(px - TW / 2, py);
        ctx.closePath();
        ctx.fillStyle = 'rgb(' + Math.round(g * 0.56) + ',' + Math.round(g * 0.5) + ',' + Math.round(g * 0.45) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - TW / 2, topY + TH / 3);
        ctx.lineTo(px, topY + TH * 0.83);
        ctx.stroke();
      }

      // 右下立面（朝向 x+1 方向）
      if (it.east !== M.TILE.WALL) {
        ctx.beginPath();
        ctx.moveTo(px, topY + TH / 2);
        ctx.lineTo(px + TW / 2, topY);
        ctx.lineTo(px + TW / 2, py);
        ctx.lineTo(px, py + TH / 2);
        ctx.closePath();
        ctx.fillStyle = 'rgb(' + Math.round(g * 0.4) + ',' + Math.round(g * 0.36) + ',' + Math.round(g * 0.33) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, topY + TH * 0.83);
        ctx.lineTo(px + TW / 2, topY + TH / 3);
        ctx.stroke();
      }

      if (h > 0.965 && it.alpha > 0.6) this.drawTorch(ctx, px, topY - 4, h);
      ctx.restore();

      // 虚化墙保留一圈轮廓，避免"墙消失"的错觉
      if (it.alpha < 0.99) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(120, 104, 84, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, topY - TH / 2);
        ctx.lineTo(px + TW / 2, topY);
        ctx.lineTo(px, topY + TH / 2);
        ctx.lineTo(px - TW / 2, topY);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    },

    drawTorch(ctx, x, y, seed) {
      const flick = 0.8 + Math.sin(this.t * 7 + seed * 10) * 0.12 + Math.sin(this.t * 13 + seed * 5) * 0.08;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 90 * flick);
      g.addColorStop(0, 'rgba(255,160,60,0.20)');
      g.addColorStop(0.4, 'rgba(200,90,20,0.07)');
      g.addColorStop(1, 'rgba(120,40,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 100, y - 100, 200, 200);
      const fg = ctx.createRadialGradient(x, y - 6, 0, x, y - 6, 11 * flick);
      fg.addColorStop(0, '#fff0b0');
      fg.addColorStop(0.45, '#ff9a30');
      fg.addColorStop(1, 'rgba(200,40,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(x, y - 8, 6 * flick, 12 * flick, 0, 0, Math.PI * 2);
      ctx.fill();
    },

    drawPlayerAt(ctx, x, y) {
      // 脚下金色光环
      const pulse = 0.55 + Math.sin(this.t * 3.2) * 0.2;
      ctx.save();
      ctx.globalAlpha = pulse * 0.55;
      ctx.strokeStyle = '#e2b94a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 19, 8.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1.12, 1.12);
      ctx.translate(-x, -y);
      const swing = this.swingT;
      const lean = swing * 4;
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 15, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const bob = Math.sin(this.t * 3) * 1.2;
      const px = x + lean;

      ctx.fillStyle = '#6e1414';
      ctx.beginPath();
      ctx.moveTo(px - 5, y - 30 + bob);
      ctx.quadraticCurveTo(px - 17, y - 20, px - 12, y - 3);
      ctx.lineTo(px - 1, y - 9);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#1a1512';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px - 3, y - 12);
      ctx.lineTo(px - 4, y - 1);
      ctx.moveTo(px + 3, y - 12);
      ctx.lineTo(px + 5, y - 1);
      ctx.stroke();

      const bodyG = ctx.createLinearGradient(px - 8, y - 32, px + 8, y - 10);
      bodyG.addColorStop(0, '#3a3330');
      bodyG.addColorStop(0.5, '#55504a');
      bodyG.addColorStop(1, '#22201d');
      ctx.fillStyle = bodyG;
      ctx.beginPath();
      ctx.moveTo(px - 7, y - 11);
      ctx.lineTo(px - 8, y - 28 + bob);
      ctx.lineTo(px + 8, y - 28 + bob);
      ctx.lineTo(px + 7, y - 11);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#26221e';
      ctx.beginPath();
      ctx.arc(px, y - 34 + bob, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3e3833';
      ctx.beginPath();
      ctx.arc(px, y - 35 + bob, 5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(px + 1, y - 36 + bob, 1.8, 1.5);

      // 受击时角色整体泛红
      if (this.playerHurtT > 0) {
        ctx.save();
        ctx.globalAlpha = this.playerHurtT * 0.5;
        ctx.fillStyle = '#ff3a3a';
        ctx.beginPath();
        ctx.ellipse(px, y - 26, 20, 32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (this._cls === 'ranger') {
        // 游侠：拉弓
        const pull = swing;
        ctx.save();
        ctx.translate(px + 5, y - 24 + bob);
        ctx.rotate(-0.15);
        ctx.strokeStyle = '#8a6a3a';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, 13, -Math.PI * 0.52, Math.PI * 0.52);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(230,225,205,0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(-2 - pull * 5, 0);
        ctx.lineTo(0, 13);
        ctx.stroke();
        if (pull > 0.05) {
          ctx.strokeStyle = '#e8d8b0';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(-2 - pull * 5, 0);
          ctx.lineTo(14, 0);
          ctx.stroke();
          ctx.fillStyle = '#fff6d8';
          ctx.beginPath();
          ctx.moveTo(15, 0);
          ctx.lineTo(10, -2.6);
          ctx.lineTo(10, 2.6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      } else {
        // 战士：剑
        ctx.save();
        ctx.translate(px + 7, y - 24 + bob);
        ctx.rotate(-0.6 + swing * 1.4);
        const bladeG = ctx.createLinearGradient(0, -20, 0, 3);
        bladeG.addColorStop(0, '#f0f4ff');
        bladeG.addColorStop(1, '#7a8598');
        ctx.fillStyle = bladeG;
        ctx.beginPath();
        ctx.moveTo(-1.2, 0);
        ctx.lineTo(-1.6, -22);
        ctx.lineTo(0, -26);
        ctx.lineTo(1.6, -22);
        ctx.lineTo(1.2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(-3.5, -2, 7, 2.4);
        ctx.restore();
      }

      if (swing > 0.3 && this._cls !== 'ranger') {
        ctx.save();
        ctx.globalAlpha = swing * 0.5;
        ctx.strokeStyle = '#fff8e0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px, y - 8, 34, 17, 0, -0.5, 1.1);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },

    drawMonsterAt(ctx, m, x, y, ghost) {
      const boss = m.isBoss;
      const sc = boss ? 1.6 : 1.15;
      const flash = m.hurtT > 0 && !ghost;
      const body = flash ? '#fff2e0' : m.color;
      const bob = Math.sin(this.t * 2.6 + m.id) * 1.6;

      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 15 * sc, 6 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (flash) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ff4040';
        ctx.beginPath();
        ctx.arc(x, y - 22 * sc, 22 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 精英怪金色光环
      if (m.isElite && !ghost) {
        const pp = 0.45 + Math.sin(this.t * 3.4 + m.id) * 0.3;
        ctx.save();
        ctx.globalAlpha = pp;
        ctx.strokeStyle = '#e8c04a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 19 * sc, 8.5 * sc, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(x, y + bob);
      ctx.scale(sc, sc);
      const shape = m.shape;

      if (shape === 'slime') {
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(0, -14, 17, 14, 0, Math.PI, Math.PI * 2);
        ctx.lineTo(17, 0);
        ctx.quadraticCurveTo(0, 5, -17, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, -9, 13, 8, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(-5, -17, 2.4, 0, Math.PI * 2);
        ctx.arc(5, -17, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff4040';
        ctx.beginPath();
        ctx.arc(-5, -17, 1.1, 0, Math.PI * 2);
        ctx.arc(5, -17, 1.1, 0, Math.PI * 2);
        ctx.fill();

      } else if (shape === 'skeleton') {
        ctx.strokeStyle = body;
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-3, -12); ctx.lineTo(-5, 0);
        ctx.moveTo(3, -12); ctx.lineTo(5, 0);
        ctx.moveTo(0, -12); ctx.lineTo(0, -28);
        for (let i = 0; i < 3; i++) {
          const yy = -15 - i * 4;
          ctx.moveTo(-6, yy); ctx.quadraticCurveTo(0, yy - 2, 6, yy);
        }
        ctx.moveTo(-6, -26); ctx.lineTo(-11, -17);
        ctx.moveTo(6, -26); ctx.lineTo(11, -18);
        ctx.stroke();
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(0, -33, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a0806';
        ctx.beginPath();
        ctx.arc(-2.4, -34, 1.9, 0, Math.PI * 2);
        ctx.arc(2.4, -34, 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff3a3a';
        ctx.beginPath();
        ctx.arc(-2.4, -34, 0.9, 0, Math.PI * 2);
        ctx.arc(2.4, -34, 0.9, 0, Math.PI * 2);
        ctx.fill();

      } else if (shape === 'beast') {
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(0, -17, 17, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = body;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-9, -12); ctx.lineTo(-11, 0);
        ctx.moveTo(2, -11); ctx.lineTo(2, 0);
        ctx.moveTo(9, -12); ctx.lineTo(11, 0);
        ctx.stroke();
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(-17, -25, 8, 6.5, -0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e8dcc0';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-20, -30); ctx.lineTo(-24, -36);
        ctx.moveTo(-13, -30); ctx.lineTo(-10, -36);
        ctx.stroke();
        ctx.fillStyle = '#ffb030';
        ctx.beginPath();
        ctx.arc(-20, -26, 1.5, 0, Math.PI * 2);
        ctx.arc(-13, -26, 1.5, 0, Math.PI * 2);
        ctx.fill();

      } else if (shape === 'mage') {
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(0, -44);
        ctx.quadraticCurveTo(-6, -42, -8, -32);
        ctx.lineTo(-13, 0);
        ctx.lineTo(12, 0);
        ctx.lineTo(8, -32);
        ctx.quadraticCurveTo(6, -42, 0, -44);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.moveTo(1, -42);
        ctx.lineTo(8, -32);
        ctx.lineTo(12, 0);
        ctx.lineTo(3, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0d0a07';
        ctx.beginPath();
        ctx.ellipse(0, -37, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8ad4ff';
        ctx.beginPath();
        ctx.arc(-2, -37, 1.2, 0, Math.PI * 2);
        ctx.arc(2, -37, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(13, -38);
        ctx.stroke();
        const orb = 0.6 + Math.sin(this.t * 4) * 0.3;
        const og = ctx.createRadialGradient(13, -40, 0, 13, -40, 6);
        og.addColorStop(0, 'rgba(160,220,255,' + orb + ')');
        og.addColorStop(1, 'rgba(60,120,255,0)');
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(13, -40, 6, 0, Math.PI * 2);
        ctx.fill();

      } else if (shape === 'golem') {
        ctx.fillStyle = body;
        ctx.fillRect(-11, -32, 22, 20);
        ctx.fillRect(-7, -42, 14, 10);
        ctx.fillRect(-18, -29, 7, 16);
        ctx.fillRect(11, -29, 7, 16);
        ctx.fillRect(-9, -12, 7, 12);
        ctx.fillRect(2, -12, 7, 12);
        ctx.strokeStyle = 'rgba(255,140,40,0.8)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-7, -30); ctx.lineTo(-1, -23); ctx.lineTo(5, -28);
        ctx.moveTo(-4, -17); ctx.lineTo(1, -21);
        ctx.stroke();
        ctx.fillStyle = '#ff8a20';
        ctx.fillRect(-4, -39, 3, 1.8);
        ctx.fillRect(1, -39, 3, 1.8);

      } else {
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(-13, 0);
        ctx.lineTo(-11, -34);
        ctx.lineTo(11, -34);
        ctx.lineTo(13, 0);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -41, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2a1a12';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-4.5, -46); ctx.quadraticCurveTo(-11, -53, -8, -58);
        ctx.moveTo(4.5, -46); ctx.quadraticCurveTo(11, -53, 8, -58);
        ctx.stroke();
        ctx.fillStyle = '#ff2a10';
        ctx.beginPath();
        ctx.arc(-3.4, -42, 1.8, 0, Math.PI * 2);
        ctx.arc(3.4, -42, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3a3a42';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(13, -28);
        ctx.lineTo(22, -9);
        ctx.stroke();
        ctx.fillStyle = '#5a5a66';
        ctx.beginPath();
        ctx.arc(22, -9, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (m.attackAnim > 0 && !ghost) {
        ctx.strokeStyle = 'rgba(255,80,60,' + Math.min(1, m.attackAnim * 3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - 16, 20 * sc, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (!ghost && m.hp < m.hpMax) {
        const bw = boss ? 70 : 34;
        const bh = boss ? 6 : 4;
        const by = y - (boss ? 78 : 52);
        const ratio = Math.max(0, m.hp / m.hpMax);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x - bw / 2 - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = boss ? '#d63a1a' : (m.isElite ? '#c9a227' : '#b01c1c');
        ctx.fillRect(x - bw / 2, by, bw * ratio, bh);
        if (boss || m.isElite) {
          ctx.font = '11px "Songti SC", Georgia, serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = boss ? '#ffb060' : '#e8c04a';
          ctx.fillText(m.name + (m.isElite ? ' · 精英' : ''), x, by - 6);
        }
      }
    },
  };

  /* ============================================================
     DOM UI
     ============================================================ */
  const els = {};
  let lastLogLen = -1;
  let tooltipEl = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    els.heroLevel = $('heroLevel');
    els.expFill = $('expFill');
    els.expText = $('expText');
    els.goldText = $('goldText');
    els.floorNum = $('floorNum');
    els.floorName = $('floorName');
    els.floorProgress = $('floorProgress');
    els.bestFloor = $('bestFloor');
    els.banner = $('banner');
    els.statGrid = $('statGrid');
    els.equipGrid = $('equipGrid');
    els.bagList = $('bagList');
    els.bagCount = $('bagCount');
    els.logList = $('logList');
    els.powerText = $('powerText');
    els.equipScore = $('equipScore');
    els.btnChest = $('btnChest');
    els.btnAutoEquip = $('btnAutoEquip');
    els.btnAutoSell = $('btnAutoSell');
    els.btnSalvage = $('btnSalvage');
    els.btnReset = $('btnReset');
    els.skillBar = $('skillBar');
    els.rageFill = $('rageFill');
    els.rageText = $('rageText');
    els.resLabel = $('resLabel');
    tooltipEl = $('tooltip');
    Scene.init($('scene'));
  }

  function renderStats(state) {
    const s = state.stats;
    const dps = s.atk / s.attackInterval;
    const st = s.stats || {};
    const rows = [
      ['力量', fmt(st.str || 0), 'up'],
      ['敏捷', fmt(st.agi || 0), 'up'],
      ['体力', fmt(st.vit || 0), 'up'],
      ['智力', fmt(st.int || 0), 'up'],
      ['攻击力', fmt(s.atk), 'up'],
      ['生命值', fmt(Math.round(state.player.hp)) + ' / ' + fmt(s.hpMax), ''],
      ['防御', fmt(s.def), ''],
      ['每秒伤害', fmt(dps), 'up'],
      ['暴击率', pct(s.crit), ''],
      ['暴击伤害', pct(s.critDmg), ''],
      ['攻击间隔', (Math.round(s.attackInterval * 100) / 100) + 's', ''],
      ['生命偷取', pct(s.lifesteal), ''],
      ['金币加成', '+' + pct(s.goldFind), ''],
      ['寻宝几率', '+' + pct(s.magicFind), ''],
      ['溅射伤害', s.splash > 0 ? pct(s.splash) : '—', s.splash > 0 ? 'up' : ''],
      ['溅射范围', s.splash > 0 ? s.splashRadius.toFixed(2) + ' 格' : '—', ''],
    ];
    let html = '';
    for (const r of rows) {
      html += '<div class="stat-row"><span class="k">' + r[0] + '</span><span class="v ' + r[2] + '">' + r[1] + '</span></div>';
    }
    els.statGrid.innerHTML = html;
    els.powerText.textContent = '战力 ' + fmt(dps);
  }

  function renderEquip(state) {
    let total = 0;
    let html = '';
    for (const slot of D.SLOTS) {
      const it = state.equip[slot.key];
      if (it) {
        total += it.score;
        html += '<div class="slot filled" data-slot="' + slot.key + '" style="--q-color:' + qColor(it.quality) + '">' +
          '<span class="icon" style="color:' + qColor(it.quality) + '">' + slot.icon + '</span>' +
          '<span class="slot-name">' + it.name + '</span></div>';
      } else {
        html += '<div class="slot empty" data-slot="' + slot.key + '">' +
          '<span class="icon">' + slot.icon + '</span>' +
          '<span class="slot-name">' + slot.name + '</span></div>';
      }
    }
    els.equipGrid.innerHTML = html;
    els.equipScore.textContent = '评分 ' + fmt(total);
  }

  function renderBag(state) {
    els.bagCount.textContent = state.bag.length + ' / 40';
    if (state.bag.length === 0) {
      els.bagList.innerHTML = '<div class="bag-empty">背包空空如也</div>';
      return;
    }
    const sorted = state.bag.slice().sort((a, b) => b.score - a.score);
    let html = '';
    for (const it of sorted) {
      const cur = state.equip[it.slot];
      const better = cur ? it.score > cur.score : it.score > 0;
      html += '<div class="bag-item" data-id="' + it.id + '" style="--q-color:' + qColor(it.quality) + '">' +
        '<span class="nm">' + it.name + '</span>' +
        '<span class="sc ' + (better ? 'better' : '') + '">' + fmt(it.score) + (better ? ' ▲' : '') + '</span></div>';
    }
    els.bagList.innerHTML = html;
  }

  function renderLog(state) {
    if (state.log.length === lastLogLen) return;
    lastLogLen = state.log.length;
    let html = '';
    for (const l of state.log) {
      html += '<div class="log-line ' + l.cls + '">' + l.text + '</div>';
    }
    els.logList.innerHTML = html;
  }

  function renderTop(state) {
    const p = state.player;
    els.heroLevel.textContent = 'Lv.' + p.level;
    const ratio = Math.min(100, (p.exp / p.expNext) * 100);
    els.expFill.style.width = ratio + '%';
    els.expText.textContent = fmt(p.exp) + ' / ' + fmt(p.expNext);
    els.goldText.textContent = fmt(p.gold);
    els.floorNum.textContent = p.floor;
    els.floorName.textContent = C.floorName(p.floor);
    if (state.run) {
      let alive = 0;
      for (const m of state.run.monsters) if (m.alive) alive++;
      els.floorProgress.textContent = alive > 0 ? ('剩余 ' + alive + ' 只') : '已清空 · 找出口';
    }
    els.bestFloor.textContent = '最深：第 ' + p.bestFloor + ' 层';
    const clsDef = C.CLASSES[p.cls];
    if (els.resLabel && clsDef) {
      const resName = { rage: '怒气', energy: '集中值', holy: '圣能', mana: '魔法' }[clsDef.resource] || '资源';
      if (els.resLabel.textContent !== resName) els.resLabel.textContent = resName;
    }
    const rage = p.rage || 0;
    const rageMax = p.rageMax || 100;
    if (els.rageFill) els.rageFill.style.width = Math.min(100, (rage / rageMax) * 100) + '%';
    if (els.rageText) els.rageText.textContent = Math.floor(rage) + ' / ' + rageMax;
    const price = C.chestPrice(p.floor);
    els.btnChest.textContent = '开宝箱 · ' + fmt(price);
    els.btnChest.disabled = p.gold < price;
  }

  function renderSkills(state) {
    if (!els.skillBar) return;
    const p = state.player;
    const r = state.run;
    const skills = p.skills || [];
    const rage = p.rage || 0;
    const clsDef = C.CLASSES[p.cls] || {};
    const resName = { rage: '怒气', energy: '集中值', holy: '圣能', mana: '魔法' }[clsDef.resource] || '资源';
    let html = '';
    for (let i = 0; i < 5; i++) {
      const key = skills[i];
      const def = key ? C.SKILLS[key] : null;
      if (!def) {
        html += '<button class="skill-btn" disabled>—</button>';
        continue;
      }
      if (def.type === 'passive') {
        html += '<button class="skill-btn passive" title="' + def.desc + '">' + def.name +
          '<br><span style="opacity:.55">被动</span></button>';
        continue;
      }
      const cd = (r && r.skillCds && r.skillCds[key]) || 0;
      const canCast = cd <= 0.05 && rage >= def.cost;
      let sub;
      if (cd > 0.05) sub = Math.ceil(cd) + 's';
      else if (rage < def.cost) sub = resName + '不足';
      else sub = def.cost + ' ' + resName;
      html += '<button class="skill-btn ' + (canCast ? 'ready' : 'cooling') + '" data-slot="' + i +
        '" title="' + def.desc + '">' + def.name +
        '<br><span style="opacity:.75">' + sub + '</span></button>';
    }
    els.skillBar.innerHTML = html;
  }

  let bannerTimer = null;
  function showBanner(text, sub) {
    els.banner.textContent = text;
    els.banner.className = 'show' + (sub ? ' sub' : '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { els.banner.className = ''; }, 1600);
  }

  function showTooltip(html, x, y) {
    tooltipEl.innerHTML = html;
    tooltipEl.classList.add('show');
    const r = tooltipEl.getBoundingClientRect();
    let left = x + 16, top = y + 16;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 16;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, y - r.height - 16);
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }
  function hideTooltip() { tooltipEl.classList.remove('show'); }

  function itemTooltipHtml(state, item) {
    const q = D.QUALITY[item.quality];
    const slotName = (D.SLOTS.find(s => s.key === item.slot) || {}).name || '';
    let html = '<div class="tt-name" style="--q-color:' + q.color + '">' + item.name + '</div>';
    html += '<div class="tt-meta">' + q.name + ' · ' + slotName + ' · 物品等级 ' + item.ilvl +
      (item.enhance ? ' · 强化 +' + item.enhance : '') + '</div>';
    for (const a of item.affixes) html += '<div class="tt-affix">' + affixText(a) + '</div>';
    html += '<div class="tt-score">评分 ' + fmt(item.score) + '</div>';
    const cur = state.equip[item.slot];
    if (cur && cur !== item) {
      const diff = item.score - cur.score;
      if (diff > 0) html += '<div class="tt-cmp">比当前装备强 +' + fmt(diff) + '</div>';
      else html += '<div class="tt-cmp worse">比当前装备弱 ' + fmt(diff) + '</div>';
    }
    return html;
  }

  let dirty = true;

  function update(state, force) {
    if (force) dirty = true;
    renderTop(state);
    renderSkills(state);
    if (dirty) {
      renderStats(state);
      renderEquip(state);
      renderBag(state);
      dirty = false;
    }
    renderLog(state);
  }

  function markDirty() { dirty = true; }

  window.UI = {
    init: init,
    update: update,
    markDirty: markDirty,
    showBanner: showBanner,
    showTooltip: showTooltip,
    hideTooltip: hideTooltip,
    itemTooltipHtml: itemTooltipHtml,
    fmt: fmt,
    qColor: qColor,
    Scene: Scene,
    els: els,
  };
})();
