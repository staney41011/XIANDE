/* 道學冒險：隔離遊戲畫面，由賢德志士保存匿名分區的遊戲進度。 */
(function () {
  'use strict';
  var previousFocus = null;
  var opening = false;
  var activeHash = '';
  var PREFIX = 'chongzheng.dao-rpg.v1.';

  function el(id) { return document.getElementById(id); }
  function isAdminSession() {
    var screen = el('game-screen');
    return typeof gUser !== 'undefined' &&
      String(gUser || '').trim().toUpperCase() === 'ADMIN' &&
      !!screen && screen.style.display === 'flex';
  }
  window.syncDaoAdventureVisibility = function () {
    var entry = el('dao-adventure-entry');
    if (!entry) return;
    var enabled = isAdminSession();
    entry.hidden = !enabled;
    entry.style.display = enabled ? 'flex' : 'none';
    if (!enabled && !el('dao-adventure-overlay').hidden) window.closeDaoAdventure();
  };

  function showError(message) {
    var note = el('dao-adventure-message');
    if (note) note.textContent = message;
  }

  async function memberHash(memberId) {
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder === 'undefined') {
      throw new Error('此裝置不支援安全的會員進度識別');
    }
    var bytes = new TextEncoder().encode(String(memberId).trim().toLowerCase());
    var digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function reply(frame, type, data) {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(Object.assign({ source: 'xiande', type: type }, data || {}), '*');
  }

  window.addEventListener('message', function (event) {
    var frame = el('dao-adventure-frame');
    var overlay = el('dao-adventure-overlay');
    if (!frame || !overlay || overlay.hidden || !activeHash || !isAdminSession() ||
        event.source !== frame.contentWindow ||
        !event.data || event.data.source !== 'dao-rpg') return;

    if (event.data.type === 'ready') {
      var stored = null;
      try {
        var raw = localStorage.getItem(PREFIX + activeHash);
        if (raw) stored = JSON.parse(raw);
      } catch (error) {
        showError('遊戲存檔讀取失敗，將以新的進度開始。');
      }
      reply(frame, 'load', { progress: stored });
    } else if (event.data.type === 'save') {
      var ok = false;
      try {
        var progress = event.data.progress;
        if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
          throw new Error('invalid progress');
        }
        var serialized = JSON.stringify(progress);
        if (serialized.length > 300000) throw new Error('oversized progress');
        localStorage.setItem(PREFIX + activeHash, serialized);
        ok = true;
      } catch (error) {
        showError('目前無法保存遊戲進度，請檢查瀏覽器儲存空間。');
      }
      reply(frame, 'save-ack', { ok: ok });
    }
  });

  window.openDaoAdventure = async function () {
    var overlay = el('dao-adventure-overlay');
    var frame = el('dao-adventure-frame');
    var member = (typeof gUser !== 'undefined') ? gUser : null;
    if (!isAdminSession() || !member || !overlay || !frame || opening || !overlay.hidden) return;
    opening = true;
    previousFocus = document.activeElement;
    overlay.hidden = false;
    overlay.style.display = 'flex';
    document.body.classList.add('dao-adventure-open');
    showError('正在開啟四島冒險……');
    el('dao-adventure-close').focus();
    try {
      activeHash = await memberHash(member);
      if (overlay.hidden) return;
      frame.src = './dao-rpg/index.html?profile=' + encodeURIComponent(activeHash);
      showError('');
    } catch (error) {
      activeHash = '';
      showError('無法安全辨識會員，請使用最新版瀏覽器重新進入。');
      console.warn('Dao RPG setup failed', error);
    } finally {
      opening = false;
    }
  };

  window.closeDaoAdventure = function () {
    var overlay = el('dao-adventure-overlay');
    var frame = el('dao-adventure-frame');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    overlay.style.display = 'none';
    document.body.classList.remove('dao-adventure-open');
    activeHash = '';
    if (frame) frame.removeAttribute('src');
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  };

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') window.closeDaoAdventure();
  });
})();
