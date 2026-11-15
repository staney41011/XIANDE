/* 道學冒險：獨立模組開啟器。只傳匿名會員雜湊，不將賢德志士登入密碼傳入遊戲。 */
(function () {
  'use strict';
  var previousFocus = null;
  var opening = false;

  function showError(message) {
    var note = document.getElementById('dao-adventure-message');
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

  window.openDaoAdventure = async function () {
    var overlay = document.getElementById('dao-adventure-overlay');
    var frame = document.getElementById('dao-adventure-frame');
    var member = (typeof gUser !== 'undefined') ? gUser : null;
    if (!member || !overlay || !frame || opening || overlay.hidden === false) return;
    opening = true;
    previousFocus = document.activeElement;
    overlay.hidden = false;
    overlay.style.display = 'flex';
    document.body.classList.add('dao-adventure-open');
    showError('正在開啟四島冒險……');
    document.getElementById('dao-adventure-close').focus();
    try {
      var hash = await memberHash(member);
      if (overlay.hidden) return;
      frame.src = './dao-rpg/index.html?profile=' + encodeURIComponent(hash);
      showError('');
    } catch (error) {
      showError('無法安全辨識會員，請使用最新版瀏覽器重新進入。');
      console.warn('Dao RPG profile setup failed', error);
    } finally {
      opening = false;
    }
  };

  window.closeDaoAdventure = function () {
    var overlay = document.getElementById('dao-adventure-overlay');
    var frame = document.getElementById('dao-adventure-frame');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    overlay.style.display = 'none';
    document.body.classList.remove('dao-adventure-open');
    if (frame) frame.removeAttribute('src');
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  };

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') window.closeDaoAdventure();
  });
})();
