/**
 * ui.js —— DOM 界面 + Canvas 战斗画面
 * 只负责“表现”，数值与状态全部来自 core.js
 */
(function () {
  'use strict';
  const D = window.DATA;
  const C = window.CORE;

  /* ============================================================
     工具：数字格式化
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

  /* ============================================================
     Canvas 场景
     ============================================================ */
  const Scene = {
    canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
    t: 0,
    shake: 0,
    heroAttackT: 0,
    heroHurtT: 0,
    monFlash: 0,
    monHurtT: 0,
    monDeathT: 0,
    deathPos: 0,
    floats: [],
    parts: [],
    sparks: [],
    bgSeed: [],
    torchPhase: 0,
    floorFlash: 0,
    levelGlow: 0,
    bannerT: 0,
    dying: null,
    dyingT: 0,
    lastMonsterName: '',

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
      if (window.ResizeObserver) {
        new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
      }
      // 固定背景砖块随机
      let seed = 7;
      const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 220; i++) this.bgSeed.push(r());
    },

    resize() {
      const parent = this.canvas.parentElement;
      const rect = parent.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.W = Math.max(320, rect.width);
      this.H = Math.max(240, rect.height);
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    },

    get groundY() { return this.H * 0.79; },
    get heroX() { return this.W * 0.32; },
    get monX() { return this.W * 0.64; },
    get scale() { return Math.max(0.8, Math.min(2.1, this.H / 300)); },

    /* ---------- 特效注入 ---------- */
    addFloat(x, y, text, color, size) {
      this.floats.push({
        x: x + (Math.random() * 24 - 12),
        y: y + (Math.random() * 10 - 5),
        text, color, size: size || 16, vy: -62, life: 1, max: 1,
      });
      if (this.floats.length > 30) this.floats.shift();
    },
    addParts(x, y, color, n, power) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.3 + Math.random()) * (power || 120);
        this.parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
          life: 0.5 + Math.random() * 0.5, max: 1,
          size: 1 + Math.random() * 2.5, color,
        });
      }
    },

    /* ---------- 事件 → 表现 ---------- */
    handle(ev) {
      const s = this.scale;
      const mx = this.monX, my = this.groundY - 60 * s;
      const hx = this.heroX, hy = this.groundY - 50 * s;
      switch (ev.type) {
        case 'playerHit':
          this.heroAttackT = 1;
          this.monFlash = 1;
          this.monHurtT = 1;
          this.addFloat(
            mx + (Math.random() * 40 - 20) * s,
            my - 10 * s,
            '-' + fmt(ev.dmg),
            ev.crit ? '#ffcf4a' : '#f2e8d6',
            ev.crit ? 22 : 15
          );
          this.addParts(mx, my, ev.crit ? '#ffb347' : '#c8b89a', ev.crit ? 14 : 6, 160);
          if (ev.crit) this.shake = Math.max(this.shake, 4);
          break;
        case 'monsterHit':
          this.heroHurtT = 1;
          this.shake = Math.max(this.shake, 5);
          this.addFloat(hx + (Math.random() * 30 - 15) * s, hy - 30 * s, '-' + fmt(ev.dmg), '#ff6b6b', 14);
          this.addParts(hx, hy, '#8a2a2a', 6, 100);
          break;
        case 'monsterDied':
          this.monDeathT = 1;
          this.deathPos = 0;
          this.dying = ev.monster;
          this.dyingT = 1;
          this.addParts(mx, this.groundY - 40 * s, ev.monster.color, 22, 200);
          this.addFloat(mx, this.groundY - 100 * s, '+' + fmt(ev.gold) + ' 金币', '#e8c04a', 15);
          break;
        case 'drop':
          this.addFloat(mx, this.groundY - 130 * s, '掉落！', qColor(ev.item.quality), 16);
          this.addParts(mx, this.groundY - 30 * s, qColor(ev.item.quality), 10, 90);
          break;
        case 'levelUp':
          this.levelGlow = 1;
          this.addFloat(hx, hy - 80 * s, 'LEVEL UP', '#7ae08a', 24);
          this.addParts(hx, hy, '#7ae08a', 20, 160);
          break;
        case 'bossSpawn':
          this.shake = 8;
          this.addFloat(this.W / 2, this.H * 0.32, 'BOSS · ' + ev.monster.name, '#e05a3a', 22);
          break;
        case 'death':
          this.shake = 14;
          this.addFloat(this.W / 2, this.H * 0.4, '你被击倒', '#c02020', 24);
          break;
        case 'floorUp':
          this.floorFlash = 1;
          break;
      }
    },

    /* ---------- 每帧更新 ---------- */
    update(dt, state) {
      this.t += dt;
      this.shake *= Math.pow(0.001, dt);
      this.heroAttackT = Math.max(0, this.heroAttackT - dt * 6);
      this.heroHurtT = Math.max(0, this.heroHurtT - dt * 3);
      this.monFlash = Math.max(0, this.monFlash - dt * 7);
      this.monHurtT = Math.max(0, this.monHurtT - dt * 3);
      this.monDeathT = Math.max(0, this.monDeathT - dt * 1.8);
      this.dyingT = Math.max(0, this.dyingT - dt * 1.7);
      if (this.dyingT <= 0) this.dying = null;
      this.floorFlash = Math.max(0, this.floorFlash - dt * 1.2);
      this.levelGlow = Math.max(0, this.levelGlow - dt * 1.5);
      this.torchPhase += dt;

      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.y += f.vy * dt;
        f.vy *= Math.pow(0.12, dt);
        f.life -= dt * 0.9;
        if (f.life <= 0) this.floats.splice(i, 1);
      }
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 320 * dt;
        p.life -= dt * 1.3;
        if (p.life <= 0) this.parts.splice(i, 1);
      }
    },

    /* ---------- 绘制 ---------- */
    draw(state) {
      const ctx = this.ctx, W = this.W, H = this.H, s = this.scale;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      if (this.shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      }

      this.drawDungeon(ctx, W, H, s);

      // 死亡中的怪物：淡出
      if (this.dying && this.dyingT > 0) {
        ctx.save();
        ctx.globalAlpha = this.dyingT * 0.85;
        this.drawMonster(ctx, this.monX, this.groundY, s, this.dying, 0, 0);
        ctx.restore();
      }
      // 当前怪物（刷怪延迟期间不显示下一只）
      const mon = state.monster;
      if (mon && state.timers.respawn <= 0) {
        this.drawMonster(ctx, this.monX, this.groundY, s, mon, this.monFlash, this.monHurtT);
        this.drawMonsterHpBar(ctx, mon);
      }

      // 玩家
      this.drawHero(ctx, this.heroX, this.groundY, s, this.heroAttackT, this.heroHurtT);

      // 粒子 & 飘字
      for (const p of this.parts) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      for (const f of this.floats) {
        const a = Math.max(0, Math.min(1, f.life * 1.4));
        ctx.globalAlpha = a;
        ctx.font = 'bold ' + f.size + 'px "Songti SC", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      // 屏幕闪光
      if (this.levelGlow > 0) {
        ctx.fillStyle = 'rgba(120, 220, 140, ' + (this.levelGlow * 0.16) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      if (this.floorFlash > 0) {
        ctx.fillStyle = 'rgba(220, 180, 90, ' + (this.floorFlash * 0.12) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      if (this.heroHurtT > 0.6) {
        ctx.fillStyle = 'rgba(160, 20, 20, ' + ((this.heroHurtT - 0.6) * 0.5) + ')';
        ctx.fillRect(0, 0, W, H);
      }

      // 边框暗角
      const g = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.25, W / 2, H * 0.55, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },

    drawDungeon(ctx, W, H, s) {
      const groundY = this.groundY;
      // 背景石墙
      const wallG = ctx.createLinearGradient(0, 0, 0, groundY);
      wallG.addColorStop(0, '#0c0a08');
      wallG.addColorStop(1, '#1a1410');
      ctx.fillStyle = wallG;
      ctx.fillRect(0, 0, W, groundY);

      // 砖块
      const bh = 19 * s, bw = 44 * s;
      let idx = 0;
      for (let row = 0, y = 0; y < groundY; row++, y += bh) {
        const off = (row % 2) * bw * 0.5;
        for (let x = -bw + off; x < W + bw; x += bw) {
          const r = this.bgSeed[idx % this.bgSeed.length]; idx++;
          const l = 0.05 + r * 0.05;
          ctx.fillStyle = 'rgba(' + Math.round(70 * l * 10) + ',' + Math.round(56 * l * 10) + ',' + Math.round(40 * l * 10) + ',1)';
          ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
          // 砖块高光
          ctx.fillStyle = 'rgba(255,220,160,0.018)';
          ctx.fillRect(x + 1, y + 1, bw - 2, 1.5);
        }
      }

      // 火把
      this.drawTorch(ctx, W * 0.10, groundY - 150 * s, s, 0);
      this.drawTorch(ctx, W * 0.90, groundY - 150 * s, s, 1.7);

      // 地面
      const gGrad = ctx.createLinearGradient(0, groundY, 0, H);
      gGrad.addColorStop(0, '#241a12');
      gGrad.addColorStop(1, '#0a0705');
      ctx.fillStyle = gGrad;
      ctx.fillRect(0, groundY, W, H - groundY);

      // 地面裂缝
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const r = this.bgSeed[(i * 13) % this.bgSeed.length];
        const x = r * W;
        ctx.beginPath();
        ctx.moveTo(x, groundY + 4);
        ctx.lineTo(x + (r - 0.5) * 80, groundY + 26 * s);
        ctx.stroke();
      }

      // 碎石与血迹
      for (let i = 0; i < 26; i++) {
        const r1 = this.bgSeed[(i * 7 + 3) % this.bgSeed.length];
        const r2 = this.bgSeed[(i * 11 + 5) % this.bgSeed.length];
        const x = r1 * W;
        const y = groundY + 6 + r2 * (H - groundY - 10);
        ctx.fillStyle = 'rgba(90,70,50,' + (0.08 + r2 * 0.12) + ')';
        const sz = (1 + r1 * 3) * s;
        ctx.fillRect(x, y, sz, sz * 0.7);
      }
      for (let i = 0; i < 5; i++) {
        const r1 = this.bgSeed[(i * 17 + 9) % this.bgSeed.length];
        const r2 = this.bgSeed[(i * 23 + 2) % this.bgSeed.length];
        ctx.fillStyle = 'rgba(90,16,12,' + (0.10 + r2 * 0.15) + ')';
        ctx.beginPath();
        ctx.ellipse(r1 * W, groundY + 10 + r2 * 40 * s, (10 + r2 * 16) * s, (3 + r1 * 5) * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 地面与墙交界光
      const edge = ctx.createLinearGradient(0, groundY - 30 * s, 0, groundY + 8);
      edge.addColorStop(0, 'rgba(0,0,0,0)');
      edge.addColorStop(1, 'rgba(120,70,20,0.16)');
      ctx.fillStyle = edge;
      ctx.fillRect(0, groundY - 30 * s, W, 38 * s);
    },

    drawTorch(ctx, x, y, s, phase) {
      const flick = 0.82 + Math.sin(this.torchPhase * 7 + phase * 4) * 0.1 + Math.sin(this.torchPhase * 13 + phase) * 0.08;
      // 光晕
      const g = ctx.createRadialGradient(x, y, 0, x, y, 150 * s * flick);
      g.addColorStop(0, 'rgba(255,160,60,0.22)');
      g.addColorStop(0.4, 'rgba(200,90,20,0.08)');
      g.addColorStop(1, 'rgba(120,40,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 160 * s, y - 160 * s, 320 * s, 320 * s);

      // 火焰
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flick, flick);
      const fg = ctx.createRadialGradient(0, -6 * s, 0, 0, -6 * s, 16 * s);
      fg.addColorStop(0, '#fff0b0');
      fg.addColorStop(0.4, '#ff9a30');
      fg.addColorStop(1, 'rgba(200,40,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(0, -8 * s, 9 * s, 17 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // 火把柄
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(0, 4 * s);
      ctx.lineTo(0, 30 * s);
      ctx.stroke();
      ctx.restore();
    },

    drawHero(ctx, x, gy, s, atk, hurt) {
      const bob = Math.sin(this.t * 3.2) * 1.6 * s;
      const lean = atk * 10 * s;
      const px = x + lean;

      // 影子
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, gy + 2, 24 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 披风
      ctx.fillStyle = hurt > 0.3 ? '#a02020' : '#6e1414';
      ctx.beginPath();
      ctx.moveTo(px - 8 * s, gy - 52 * s + bob);
      ctx.quadraticCurveTo(px - 26 * s, gy - 34 * s, px - 18 * s, gy - 6 * s);
      ctx.lineTo(px - 2 * s, gy - 16 * s);
      ctx.lineTo(px + 2 * s, gy - 48 * s + bob);
      ctx.closePath();
      ctx.fill();

      // 腿
      ctx.strokeStyle = '#1a1512';
      ctx.lineWidth = 6 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px - 5 * s, gy - 20 * s);
      ctx.lineTo(px - 7 * s, gy - 2 * s);
      ctx.moveTo(px + 5 * s, gy - 20 * s);
      ctx.lineTo(px + 8 * s, gy - 2 * s);
      ctx.stroke();

      // 身体（铠甲）
      const bodyG = ctx.createLinearGradient(px - 12 * s, gy - 52 * s, px + 12 * s, gy - 16 * s);
      bodyG.addColorStop(0, '#3a3330');
      bodyG.addColorStop(0.5, '#55504a');
      bodyG.addColorStop(1, '#22201d');
      ctx.fillStyle = bodyG;
      ctx.beginPath();
      ctx.moveTo(px - 11 * s, gy - 18 * s);
      ctx.lineTo(px - 13 * s, gy - 44 * s + bob);
      ctx.lineTo(px + 13 * s, gy - 44 * s + bob);
      ctx.lineTo(px + 11 * s, gy - 18 * s);
      ctx.closePath();
      ctx.fill();

      // 肩甲高光
      ctx.fillStyle = 'rgba(220,200,160,0.18)';
      ctx.fillRect(px - 13 * s, gy - 46 * s + bob, 10 * s, 2 * s);

      // 头（兜帽）
      ctx.fillStyle = '#26221e';
      ctx.beginPath();
      ctx.arc(px, gy - 52 * s + bob, 8.5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3e3833';
      ctx.beginPath();
      ctx.arc(px, gy - 54 * s + bob, 7 * s, Math.PI, Math.PI * 2);
      ctx.fill();
      // 眼睛
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(px + 1 * s, gy - 54 * s + bob, 2 * s, 1.6 * s);

      // 剑
      const swing = atk * 1.2;
      ctx.save();
      ctx.translate(px + 10 * s, gy - 36 * s + bob);
      ctx.rotate(-0.7 + swing);
      // 剑身
      const bladeG = ctx.createLinearGradient(0, -30 * s, 0, 4 * s);
      bladeG.addColorStop(0, '#f0f4ff');
      bladeG.addColorStop(1, '#7a8598');
      ctx.fillStyle = bladeG;
      ctx.beginPath();
      ctx.moveTo(-1.6 * s, 0);
      ctx.lineTo(-2.2 * s, -34 * s);
      ctx.lineTo(0, -40 * s);
      ctx.lineTo(2.2 * s, -34 * s);
      ctx.lineTo(1.6 * s, 0);
      ctx.closePath();
      ctx.fill();
      // 护手
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(-5 * s, -2 * s, 10 * s, 3 * s);
      ctx.restore();

      // 攻击时的剑光
      if (atk > 0.35) {
        ctx.save();
        ctx.globalAlpha = atk * 0.55;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.arc(px + 12 * s, gy - 36 * s + bob, 24 * s, -1.25, -0.35);
        ctx.stroke();
        ctx.restore();
      }
    },

    drawMonster(ctx, x, gy, s, mon, flash, hurt) {
      const body = flash > 0.35 ? '#fff2e0' : mon.color;
      const darken = (c, k) => {
        // 简单变暗：拼 rgba
        return c;
      };
      const bob = Math.sin(this.t * 2.6 + 1) * 2 * s;
      const px = x - hurt * 5 * s;

      // 影子
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, gy + 2, 30 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(px, gy + bob);
      const R = Math.min(1.35, 0.8 + (mon.hpMax && mon.isBoss ? 0.55 : 0));

      if (mon.shape === 'slime') {
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(0, -26 * s, 30 * s * R, 26 * s * R, 0, Math.PI, Math.PI * 2);
        ctx.lineTo(30 * s * R, 0);
        ctx.quadraticCurveTo(0, 8 * s, -30 * s * R, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(0, -16 * s, 24 * s * R, 16 * s * R, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        // 眼睛
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(-9 * s, -30 * s, 3.2 * s, 0, Math.PI * 2);
        ctx.arc(9 * s, -30 * s, 3.2 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff4040';
        ctx.beginPath();
        ctx.arc(-9 * s, -30 * s, 1.4 * s, 0, Math.PI * 2);
        ctx.arc(9 * s, -30 * s, 1.4 * s, 0, Math.PI * 2);
        ctx.fill();

      } else if (mon.shape === 'skeleton') {
        // 骨架
        ctx.strokeStyle = body;
        ctx.lineWidth = 3.5 * s;
        ctx.lineCap = 'round';
        // 腿
        ctx.beginPath();
        ctx.moveTo(-6 * s, -22 * s); ctx.lineTo(-9 * s, 0);
        ctx.moveTo(6 * s, -22 * s); ctx.lineTo(9 * s, 0);
        // 脊柱
        ctx.moveTo(0, -22 * s); ctx.lineTo(0, -50 * s);
        // 肋骨
        for (let i = 0; i < 3; i++) {
          const y = -26 * s - i * 7 * s;
          ctx.moveTo(-10 * s, y); ctx.quadraticCurveTo(0, y - 3 * s, 10 * s, y);
        }
        // 手臂
        ctx.moveTo(-10 * s, -46 * s); ctx.lineTo(-18 * s, -30 * s);
        ctx.moveTo(10 * s, -46 * s); ctx.lineTo(18 * s, -32 * s);
        ctx.stroke();
        // 头骨
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(0, -58 * s, 11 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a0806';
        ctx.beginPath();
        ctx.arc(-4 * s, -59 * s, 3 * s, 0, Math.PI * 2);
        ctx.arc(4 * s, -59 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff3a3a';
        ctx.beginPath();
        ctx.arc(-4 * s, -59 * s, 1.3 * s, 0, Math.PI * 2);
        ctx.arc(4 * s, -59 * s, 1.3 * s, 0, Math.PI * 2);
        ctx.fill();

      } else if (mon.shape === 'beast') {
        ctx.fillStyle = body;
        // 身体
        ctx.beginPath();
        ctx.ellipse(0, -30 * s, 30 * s, 18 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        // 腿
        ctx.strokeStyle = body;
        ctx.lineWidth = 5 * s;
        ctx.beginPath();
        ctx.moveTo(-16 * s, -22 * s); ctx.lineTo(-20 * s, 0);
        ctx.moveTo(-4 * s, -20 * s); ctx.lineTo(-4 * s, 0);
        ctx.moveTo(10 * s, -22 * s); ctx.lineTo(14 * s, 0);
        ctx.stroke();
        // 头
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(-30 * s, -44 * s, 14 * s, 11 * s, -0.25, 0, Math.PI * 2);
        ctx.fill();
        // 角
        ctx.strokeStyle = '#e8dcc0';
        ctx.lineWidth = 2.4 * s;
        ctx.beginPath();
        ctx.moveTo(-36 * s, -53 * s); ctx.lineTo(-42 * s, -62 * s);
        ctx.moveTo(-24 * s, -53 * s); ctx.lineTo(-20 * s, -63 * s);
        ctx.stroke();
        // 眼睛
        ctx.fillStyle = '#ffb030';
        ctx.beginPath();
        ctx.arc(-35 * s, -46 * s, 2.2 * s, 0, Math.PI * 2);
        ctx.arc(-25 * s, -46 * s, 2.2 * s, 0, Math.PI * 2);
        ctx.fill();

      } else if (mon.shape === 'mage') {
        // 瘦高长袍，下摆扫地
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(0, -82 * s);
        ctx.quadraticCurveTo(-11 * s, -78 * s, -15 * s, -60 * s);
        ctx.lineTo(-25 * s, 0);
        ctx.lineTo(22 * s, 0);
        ctx.lineTo(15 * s, -60 * s);
        ctx.quadraticCurveTo(11 * s, -78 * s, 0, -82 * s);
        ctx.closePath();
        ctx.fill();
        // 袍子暗面
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.moveTo(2 * s, -80 * s);
        ctx.lineTo(15 * s, -60 * s);
        ctx.lineTo(22 * s, 0);
        ctx.lineTo(6 * s, 0);
        ctx.closePath();
        ctx.fill();
        // 兜帽内影
        ctx.fillStyle = '#0d0a07';
        ctx.beginPath();
        ctx.ellipse(0, -68 * s, 9 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        // 眼睛
        ctx.fillStyle = '#8ad4ff';
        ctx.beginPath();
        ctx.arc(-3.5 * s, -69 * s, 1.9 * s, 0, Math.PI * 2);
        ctx.arc(3.5 * s, -69 * s, 1.9 * s, 0, Math.PI * 2);
        ctx.fill();
        // 法杖
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 2.6 * s;
        ctx.beginPath();
        ctx.moveTo(20 * s, 0);
        ctx.lineTo(26 * s, -68 * s);
        ctx.stroke();
        const orb = 0.7 + Math.sin(this.t * 4) * 0.3;
        const og = ctx.createRadialGradient(26 * s, -70 * s, 0, 26 * s, -70 * s, 10 * s);
        og.addColorStop(0, 'rgba(160,220,255,' + orb + ')');
        og.addColorStop(1, 'rgba(60,120,255,0)');
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(26 * s, -70 * s, 10 * s, 0, Math.PI * 2);
        ctx.fill();

      } else if (mon.shape === 'golem') {
        ctx.fillStyle = body;
        // 身体方块
        ctx.fillRect(-20 * s, -58 * s, 40 * s, 36 * s);
        // 头
        ctx.fillRect(-12 * s, -76 * s, 24 * s, 18 * s);
        // 手
        ctx.fillRect(-32 * s, -52 * s, 12 * s, 28 * s);
        ctx.fillRect(20 * s, -52 * s, 12 * s, 28 * s);
        // 腿
        ctx.fillRect(-16 * s, -22 * s, 12 * s, 22 * s);
        ctx.fillRect(4 * s, -22 * s, 12 * s, 22 * s);
        // 裂纹发光
        ctx.strokeStyle = 'rgba(255,140,40,0.85)';
        ctx.lineWidth = 1.8 * s;
        ctx.beginPath();
        ctx.moveTo(-12 * s, -54 * s); ctx.lineTo(-2 * s, -42 * s); ctx.lineTo(8 * s, -50 * s);
        ctx.moveTo(-8 * s, -30 * s); ctx.lineTo(2 * s, -38 * s);
        ctx.stroke();
        // 眼睛
        ctx.fillStyle = '#ff8a20';
        ctx.fillRect(-7 * s, -70 * s, 5 * s, 3 * s);
        ctx.fillRect(2 * s, -70 * s, 5 * s, 3 * s);

      } else {
        // boss：大体型人形 + 角
        ctx.fillStyle = body;
        // 身体
        ctx.beginPath();
        ctx.moveTo(-24 * s, 0);
        ctx.lineTo(-20 * s, -62 * s);
        ctx.lineTo(20 * s, -62 * s);
        ctx.lineTo(24 * s, 0);
        ctx.closePath();
        ctx.fill();
        // 头
        ctx.beginPath();
        ctx.arc(0, -74 * s, 14 * s, 0, Math.PI * 2);
        ctx.fill();
        // 角
        ctx.strokeStyle = '#2a1a12';
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.moveTo(-8 * s, -84 * s); ctx.quadraticCurveTo(-20 * s, -96 * s, -14 * s, -104 * s);
        ctx.moveTo(8 * s, -84 * s); ctx.quadraticCurveTo(20 * s, -96 * s, 14 * s, -104 * s);
        ctx.stroke();
        // 眼睛
        ctx.fillStyle = '#ff2a10';
        ctx.beginPath();
        ctx.arc(-6 * s, -76 * s, 3 * s, 0, Math.PI * 2);
        ctx.arc(6 * s, -76 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
        // 武器
        ctx.strokeStyle = '#3a3a42';
        ctx.lineWidth = 5 * s;
        ctx.beginPath();
        ctx.moveTo(24 * s, -50 * s);
        ctx.lineTo(40 * s, -16 * s);
        ctx.stroke();
        ctx.fillStyle = '#5a5a66';
        ctx.beginPath();
        ctx.arc(40 * s, -16 * s, 7 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    drawMonsterHpBar(ctx, mon) {
      if (!mon || mon.hpMax <= 0) return;
      const s = this.scale;
      const w = (mon.isBoss ? 190 : 86) * s;
      const x = this.monX - w / 2;
      const y = this.groundY - (mon.isBoss ? 128 : 92) * s;
      const ratio = Math.max(0, mon.hp / mon.hpMax);

      // 名字
      ctx.font = (mon.isBoss ? 'bold 13px' : '12px') + ' "Songti SC", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillText(mon.name, this.monX + 1, y - 7 * s + 1);
      ctx.fillStyle = mon.isBoss ? '#ff9a50' : '#d8cbb8';
      ctx.fillText(mon.name, this.monX, y - 7 * s);

      // 血条底
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(x - 1, y - 1, w + 2, 8 * s + 2);
      // 血条
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#8a1010');
      grad.addColorStop(1, '#d63a3a');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w * ratio, 8 * s);
      // 高光
      ctx.fillStyle = 'rgba(255,180,180,0.28)';
      ctx.fillRect(x, y, w * ratio, 2 * s);
      // 边框
      ctx.strokeStyle = mon.isBoss ? '#a86a30' : '#3a2c1d';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, w + 1, 8 * s + 1);
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
    tooltipEl = $('tooltip');
    Scene.init($('scene'));
  }

  /* ---------------- 属性面板 ---------------- */
  function renderStats(state) {
    const s = state.stats;
    const dps = s.atk / s.attackInterval;
    const rows = [
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
    ];
    let html = '';
    for (const r of rows) {
      html += '<div class="stat-row"><span class="k">' + r[0] + '</span><span class="v ' + r[2] + '">' + r[1] + '</span></div>';
    }
    els.statGrid.innerHTML = html;
    els.powerText.textContent = '战力 ' + fmt(dps);
  }

  /* ---------------- 装备面板 ---------------- */
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

  /* ---------------- 背包 ---------------- */
  function renderBag(state) {
    els.bagCount.textContent = state.bag.length + ' / 40';
    if (state.bag.length === 0) {
      els.bagList.innerHTML = '<div class="bag-empty">背包空空如也</div>';
      return;
    }
    // 按评分从高到低
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

  /* ---------------- 日志 ---------------- */
  function renderLog(state) {
    if (state.log.length === lastLogLen) return;
    lastLogLen = state.log.length;
    let html = '';
    for (const l of state.log) {
      html += '<div class="log-line ' + l.cls + '">' + l.text + '</div>';
    }
    els.logList.innerHTML = html;
  }

  /* ---------------- 顶栏 / 楼层 ---------------- */
  function renderTop(state) {
    const p = state.player;
    els.heroLevel.textContent = 'Lv.' + p.level;
    const ratio = Math.min(100, (p.exp / p.expNext) * 100);
    els.expFill.style.width = ratio + '%';
    els.expText.textContent = fmt(p.exp) + ' / ' + fmt(p.expNext);
    els.goldText.textContent = fmt(p.gold);
    els.floorNum.textContent = p.floor;
    els.floorName.textContent = C.floorName(p.floor);
    els.floorProgress.textContent = state.progress.killed + ' / ' + state.progress.need;
    els.bestFloor.textContent = '最深：第 ' + p.bestFloor + ' 层';
    const price = C.chestPrice(p.floor);
    els.btnChest.textContent = '开宝箱 · ' + fmt(price);
    els.btnChest.disabled = p.gold < price;
  }

  /* ---------------- 提示条 ---------------- */
  let bannerTimer = null;
  function showBanner(text, sub) {
    els.banner.textContent = text;
    els.banner.className = 'show' + (sub ? ' sub' : '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { els.banner.className = ''; }, 1600);
  }

  /* ---------------- tooltip ---------------- */
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
    for (const a of item.affixes) {
      html += '<div class="tt-affix">' + affixText(a) + '</div>';
    }
    html += '<div class="tt-score">评分 ' + fmt(item.score) + '</div>';
    const cur = state.equip[item.slot];
    if (cur && cur !== item) {
      const diff = item.score - cur.score;
      if (diff > 0) html += '<div class="tt-cmp">比当前装备强 +' + fmt(diff) + '</div>';
      else html += '<div class="tt-cmp worse">比当前装备弱 ' + fmt(diff) + '</div>';
    }
    return html;
  }

  /* ============================================================
     渲染入口
     ============================================================ */
  let dirty = true;

  function update(state, force) {
    if (force) dirty = true;
    renderTop(state);
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
