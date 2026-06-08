/* countdown.js — Kickoff countdown module (exposes global Countdown) */
(function(window){
  'use strict';

  let _countdownInterval = null;

  function initKickoffCountdown() {
    const header = document.querySelector('header');
    if (!header) return;
    // Add countdown container if missing
    let cd = document.getElementById('kickoffCountdown');
    if (!cd) {
      cd = document.createElement('div');
      cd.id = 'kickoffCountdown';
      cd.style.marginTop = '10px';
  cd.style.fontSize = '18px';
      header.appendChild(cd);
    }

    // Determine target UTC from data if available (first Group A fixture),
    // otherwise fall back to 2026-06-11 21:00 UK (20:00Z).
    let targetUtc = Date.UTC(2026, 5, 11, 20, 0, 0); // fallback
    let fixtureId = null;
    try {
      if (window.WC2026 && Array.isArray(WC2026.FIXTURES)) {
        const fx = WC2026.FIXTURES.find(f => f.stage === 'group' && f.group === 'A');
        if (fx && fx.utc) {
          targetUtc = new Date(fx.utc).getTime();
          fixtureId = fx.id;
        }
      }
    } catch (e) {
      // ignore and use fallback
    }

    function update() {
      const now = Date.now();
      let diff = targetUtc - now;
      if (diff <= 0) {
        // show kickoff message and optionally a link to the match if present
        if (fixtureId) {
          // prefer an in-page anchor if an element with id 'match-<id>' exists
          const targetEl = document.getElementById(`match-${fixtureId}`);
          if (targetEl) {
            cd.innerHTML = `Kickoff — Group A has started! <a href="#match-${fixtureId}">View match</a>`;
          } else {
            cd.textContent = 'Kickoff — Group A has started!';
          }
        } else {
          cd.textContent = 'Kickoff — Group A has started!';
        }
        if (_countdownInterval) {
          clearInterval(_countdownInterval);
          _countdownInterval = null;
        }
        return;
      }
      const secs = Math.floor(diff / 1000);
      const days = Math.floor(secs / 86400);
      const hours = Math.floor((secs % 86400) / 3600);
      const minutes = Math.floor((secs % 3600) / 60);
      const seconds = secs % 60;
      cd.textContent = `Kickoff (UK 21:00, Group A) in ${String(days).padStart(2,'0')}d ${String(hours).padStart(2,'0')}h ${String(minutes).padStart(2,'0')}m ${String(seconds).padStart(2,'0')}s`;
    }

    if (_countdownInterval) clearInterval(_countdownInterval);
    update();
    _countdownInterval = setInterval(update, 1000);
  }

  // Expose minimal API
  window.Countdown = window.Countdown || {};
  window.Countdown.initKickoffCountdown = initKickoffCountdown;

})(window);
