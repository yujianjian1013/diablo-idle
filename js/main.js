/**
 * main.js —— 启动、主循环、交互绑定、存档
 */
(function () {
  'use strict';
  const C = window.CORE;
  const D = window.DATA;
  const UI = window.UI;

  let state = null;
  let lastTs = 0;
  let uiAcc = 0;
  let saveAcc = 0;
  let running = true;

  /* ============================================================
     事件分发
     ============================================================ */
  function handleEvent(ev) {
    const Scene = UI.Scene;
    Scene.handle(ev);
    const S = window.SOUND;
    switch (ev.type) {
      case 'playerHit':
        if (S) S.play(ev.crit ? 'crit' : 'hit');
        break;
      case 'monsterHit':
        if (S) S.play('hurt');
        break;
      case 'monsterDied':
        if (S) S.play('kill');
        break;
      case 'levelUp':
        UI.showBanner('升级 · Lv.' + ev.level);
        if (S) S.play('levelup');
        break;
      case 'floorUp':
        UI.showBanner('第 ' + ev.floor + ' 层 · ' + C.floorName(ev.floor));
        if (S) S.play('floorup');
        break;
      case 'death':
        UI.showBanner('你被击倒', true);
        if (S) S.play('death');
        break;
      case 'bossSpawn':
        UI.showBanner('BOSS 出现', true);
        if (S) S.play('boss');
        break;
      case 'equip':
      case 'drop':
        if (S) S.play('drop');
        UI.markDirty();
        break;
      case 'sell':
        UI.markDirty();
        break;
    }
  }

  /* ============================================================
     主循环
     ============================================================ */
  function loop(ts) {
    if (!running) return;
    requestAnimationFrame(loop);

    const now = ts / 1000;
    let dt = lastTs === 0 ? 0 : now - lastTs;
    lastTs = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    // 最多一次补算 10 分钟（切后台回来）
    dt = Math.min(dt, 600);

    // 分步推进逻辑，保证攻击计时准确
    let remain = dt;
    let steps = 0;
    while (remain > 1e-6 && steps < 4000) {
      const step = Math.min(0.1, remain);
      remain -= step;
      steps++;
      const evs = C.tick(state, step);
      for (let i = 0; i < evs.length; i++) handleEvent(evs[i]);
    }

    UI.Scene.update(dt, state);
    UI.Scene.draw(state);

    uiAcc += dt;
    if (uiAcc > 0.12) {
      uiAcc = 0;
      UI.update(state, false);
    }

    saveAcc += dt;
    if (saveAcc > 5) {
      saveAcc = 0;
      C.save(state);
    }
  }

  /* ============================================================
     离线结算
     ============================================================ */
  function showOffline(off) {
    const modal = document.getElementById('offlineModal');
    const rows = document.getElementById('offlineRows');
    const mins = Math.round(off.seconds / 60);
    const timeStr = mins >= 60 ? Math.floor(mins / 60) + ' 小时 ' + (mins % 60) + ' 分' : mins + ' 分钟';
    rows.innerHTML =
      '<div class="row"><span>离线时长</span><span>' + timeStr + '</span></div>' +
      '<div class="row"><span>金币</span><span>+' + UI.fmt(off.gold) + '</span></div>' +
      '<div class="row"><span>经验</span><span>+' + UI.fmt(off.exp) + '</span></div>' +
      '<div class="row"><span>拾获装备</span><span>' + off.items.length + ' 件</span></div>';
    modal.classList.add('show');
    document.getElementById('btnOfflineOk').onclick = function () {
      modal.classList.remove('show');
      state.player.gold += off.gold;
      C.gainExp(state, off.exp, []);
      const evs = [];
      for (const it of off.items) C.handleDrop(state, it, evs);
      for (const ev of evs) UI.Scene.handle(ev);
      C.save(state);
      UI.update(state, true);
    };
  }

  /* ============================================================
     交互绑定
     ============================================================ */
  function bind() {
    const els = UI.els;

    // 自动装备 / 自动分解
    function syncToggles() {
      els.btnAutoEquip.className = 'toggle ' + (state.mode.autoEquip ? 'on' : 'off');
      els.btnAutoSell.className = 'toggle ' + (state.mode.autoSell ? 'on' : 'off');
      els.btnAutoEquip.textContent = state.mode.autoEquip ? '自动装备：开' : '自动装备：关';
      els.btnAutoSell.textContent = state.mode.autoSell ? '自动分解：开' : '自动分解：关';
    }
    els.btnAutoEquip.onclick = function () {
      state.mode.autoEquip = !state.mode.autoEquip;
      C.pushLog(state, state.mode.autoEquip ? '自动装备已开启' : '自动装备已关闭');
      syncToggles();
      UI.markDirty();
    };
    els.btnAutoSell.onclick = function () {
      state.mode.autoSell = !state.mode.autoSell;
      C.pushLog(state, state.mode.autoSell ? '自动分解已开启' : '自动分解已关闭');
      syncToggles();
      UI.markDirty();
    };

    // 开宝箱
    els.btnChest.onclick = function () {
      const res = C.openChest(state);
      if (!res.ok) {
        UI.showBanner('金币不足', true);
        return;
      }
      UI.showBanner('开出 · ' + res.item.name);
      if (window.SOUND) window.SOUND.play('chest');
      for (const ev of res.events) UI.Scene.handle(ev);
      UI.markDirty();
      syncToggles();
      UI.update(state, true);
    };

    // 一键分解
    els.btnSalvage.onclick = function () {
      const r = C.salvageWorse(state);
      if (r.count === 0) UI.showBanner('没有可分解的装备', true);
      else UI.showBanner('分解 ' + r.count + ' 件 · +' + UI.fmt(r.gold) + ' 金币');
      UI.markDirty();
      UI.update(state, true);
    };

    // 重置
    els.btnReset.onclick = function () {
      if (confirm('确定要清空存档，从头开始吗？')) {
        C.resetSave();
        location.reload();
      }
    };

    // 装备 / 背包 tooltip
    const grid = els.equipGrid;
    grid.addEventListener('mousemove', function (e) {
      const slotEl = e.target.closest('.slot');
      if (!slotEl) { UI.hideTooltip(); return; }
      const slotKey = slotEl.dataset.slot;
      const it = state.equip[slotKey];
      if (!it) { UI.hideTooltip(); return; }
      UI.showTooltip(UI.itemTooltipHtml(state, it), e.clientX, e.clientY);
    });
    grid.addEventListener('mouseleave', UI.hideTooltip);

    const bag = els.bagList;
    bag.addEventListener('mousemove', function (e) {
      const itemEl = e.target.closest('.bag-item');
      if (!itemEl) { UI.hideTooltip(); return; }
      const it = state.bag.find(x => x.id === Number(itemEl.dataset.id));
      if (!it) { UI.hideTooltip(); return; }
      UI.showTooltip(UI.itemTooltipHtml(state, it), e.clientX, e.clientY);
    });
    bag.addEventListener('mouseleave', UI.hideTooltip);

    // 点击背包装备
    bag.addEventListener('click', function (e) {
      const itemEl = e.target.closest('.bag-item');
      if (!itemEl) return;
      const id = Number(itemEl.dataset.id);
      if (C.equipFromBag(state, id)) {
        UI.hideTooltip();
        UI.markDirty();
        UI.update(state, true);
      }
    });

    // 音效开关
    const btnSound = document.getElementById('btnSound');
    if (window.SOUND) window.SOUND.setEnabled(true);
    function syncSound() {
      const on = window.SOUND ? window.SOUND.isEnabled() : false;
      btnSound.textContent = on ? '音效 开' : '音效 关';
      btnSound.className = 'sound' + (on ? ' on' : '');
    }
    btnSound.onclick = function () {
      if (!window.SOUND) return;
      window.SOUND.setEnabled(!window.SOUND.isEnabled());
      syncSound();
      if (window.SOUND.isEnabled()) window.SOUND.play('click');
    };
    syncSound();

    // 键盘快捷键
    window.addEventListener('keydown', function (e) {
      if (e.key === 'b' || e.key === 'B') els.btnChest.click();
      if (e.key === 's' || e.key === 'S') els.btnSalvage.click();
    });

    // 页面关闭前存盘
    window.addEventListener('beforeunload', function () {
      running = false;
      if (window.__skipSave) return;
      C.save(state);
    });
    document.addEventListener('visibilitychange', function () {
      // 切走时保存，回来时主循环会用真实 dt 补算
      if (document.hidden && !window.__skipSave) C.save(state);
    });
  }

  /* ============================================================
     启动
     ============================================================ */
  function boot() {
    UI.init();
    const els = UI.els;

    state = C.load();
    if (state) {
      const off = C.settleOffline(state);
      if (off) showOffline(off);
      C.pushLog(state, '欢迎回来，继续你的深渊之旅。', '');
    } else {
      state = C.createState();
      C.pushLog(state, '你在「荒废庭院」的入口醒来，手中只有一把生锈的长剑。', '');
      C.pushLog(state, '自动战斗已经开启 —— 杀怪、爆装备、变强。', 'log-gold');
    }

    bind();
    // 同步开关状态
    els.btnAutoEquip.className = 'toggle ' + (state.mode.autoEquip ? 'on' : 'off');
    els.btnAutoSell.className = 'toggle ' + (state.mode.autoSell ? 'on' : 'off');
    els.btnAutoEquip.textContent = state.mode.autoEquip ? '自动装备：开' : '自动装备：关';
    els.btnAutoSell.textContent = state.mode.autoSell ? '自动分解：开' : '自动分解：关';

    UI.update(state, true);
    lastTs = 0;
    // 调试/自动化测试入口
    window.__game = {
      get state() { return state; },
      save: function () { return C.save(state); },
    };
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
