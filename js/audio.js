/**
 * audio.js —— 纯 WebAudio 合成音效，无外部音频文件
 * 浏览器要求用户交互后才能出声，因此首次点击/按键时解锁。
 */
(function () {
  'use strict';

  let ctx = null, master = null, ready = false;
  let enabled = true;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    ready = true;
  }

  function unlock() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  /** 单音 */
  function tone(freq, dur, type, vol, slideTo) {
    if (!ready || !enabled) return;
    const t0 = now();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.1), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /** 噪声（打击感） */
  function noise(dur, vol, freq) {
    if (!ready || !enabled) return;
    const t0 = now();
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq || 900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0);
  }

  const SFX = {
    hit() { tone(260, 0.05, 'square', 0.045, 130); noise(0.03, 0.03, 1600); },
    crit() { tone(760, 0.07, 'triangle', 0.09, 380); noise(0.06, 0.06, 2600); },
    hurt() { tone(120, 0.1, 'sawtooth', 0.07, 60); noise(0.04, 0.04, 500); },
    kill() { tone(190, 0.16, 'sawtooth', 0.06, 45); noise(0.08, 0.05, 700); },
    drop() {
      tone(1046, 0.07, 'sine', 0.07);
      setTimeout(() => tone(1568, 0.1, 'sine', 0.05), 55);
    },
    chest() {
      tone(660, 0.06, 'sine', 0.08);
      setTimeout(() => tone(990, 0.08, 'sine', 0.07), 50);
      setTimeout(() => tone(1320, 0.14, 'sine', 0.06), 110);
    },
    levelup() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => setTimeout(() => tone(f, 0.13, 'triangle', 0.07), i * 65));
    },
    boss() {
      tone(72, 0.55, 'sawtooth', 0.11, 42);
      setTimeout(() => tone(110, 0.4, 'sawtooth', 0.07, 60), 90);
    },
    death() {
      tone(200, 0.4, 'sawtooth', 0.1, 45);
      setTimeout(() => tone(120, 0.6, 'sine', 0.08, 40), 120);
    },
    floorup() {
      tone(392, 0.1, 'triangle', 0.06);
      setTimeout(() => tone(587, 0.16, 'triangle', 0.06), 80);
    },
    click() { tone(520, 0.03, 'square', 0.04, 380); },
  };

  window.SOUND = {
    unlock: unlock,
    play: function (name) {
      const fn = SFX[name];
      if (fn) fn();
    },
    setEnabled(v) { enabled = !!v; },
    isEnabled() { return enabled; },
    available() { init(); return !!ctx; },
  };

  // 任意交互解锁音频
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function once() {
      unlock();
    }, { once: true, passive: true });
  });
})();
