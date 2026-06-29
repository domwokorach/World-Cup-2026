/**
 * live.js — Real-time data from football-data.org
 * Free key: https://www.football-data.org/client/register
 * Load the key from window.LIVE_API_KEY, localStorage, or js/live-config.json.
 */
'use strict';

const Live = (() => {
  const CONFIG_PATH = 'js/live-config.json';
  const COMP_ID  = 2000;
  const SEASON   = 2026;
  const POLL_MS  = 60000;
  const LIVE_MS  = 30000;

  let API_KEY    = '';
  let liveData   = {};   // keyed by "local_<staticId>"
  let listeners  = [];
  let hasKey     = false;

  function normalizeKey(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function readInjectedKey() {
    if (typeof window === 'undefined') return '';
    return normalizeKey(window.LIVE_API_KEY || window.__LIVE_API_KEY__ || '');
  }

  function readStoredKey() {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    return normalizeKey(window.localStorage.getItem('LIVE_API_KEY'));
  }

  async function loadApiKey() {
    const injectedKey = readInjectedKey();
    if (injectedKey) return injectedKey;

    const storedKey = readStoredKey();
    if (storedKey) return storedKey;

    try {
      const response = await fetch(CONFIG_PATH, { cache: 'no-store' });
      if (!response.ok) return '';

      const config = await response.json();
      return normalizeKey(config.apiKey || config.API_KEY || config.token);
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn('[Live] Invalid JSON in js/live-config.json:', error.message);
      }
      return '';
    }
  }

  // ── INIT ─────────────────────────────────────────────────────────────
  async function init() {
    API_KEY = await loadApiKey();
    hasKey = !!API_KEY;

    if (!hasKey) { setBanner('static'); return; }
    setBanner('loading');
    fetchAll().then(() => {
      setBanner(Object.keys(liveData).length ? 'live' : 'error');
      setInterval(fetchAll, POLL_MS);
      setInterval(() => {
        const anyLive = Object.values(liveData).some(d =>
          d.status === 'IN_PLAY' || d.status === 'PAUSED');
        if (anyLive) fetchLive();
      }, LIVE_MS);
    });
  }

  // ── FETCH ─────────────────────────────────────────────────────────────
  async function apiFetch(path) {
    const r = await fetch(`https://api.football-data.org/v4${path}`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }

  async function fetchAll() {
    try {
      const data = await apiFetch(`/competitions/${COMP_ID}/matches?season=${SEASON}`);
      ingest(data.matches || []);
      notify();
    } catch(e) { console.warn('[Live] fetchAll:', e.message); }
  }

  async function fetchLive() {
    try {
      const data = await apiFetch(`/competitions/${COMP_ID}/matches?status=IN_PLAY,PAUSED&season=${SEASON}`);
      ingest(data.matches || []);
      notify();
    } catch(e) { console.warn('[Live] fetchLive:', e.message); }
  }

  // ── INGEST ────────────────────────────────────────────────────────────
  function canon(name) {
    return (name||'').toLowerCase().trim()
      .replace('türkiye','turkiye').replace('turkey','turkiye')
      .replace('korea republic','korea republic')
      .replace('ivory coast','côte d\'ivoire')
      .replace("côte d'ivoire","côte d'ivoire")
      .replace('congo dr','congo dr').replace('dr congo','congo dr')
      .replace('united states','usa');
  }

  function stageFromApi(stage) {
    const map = {
      GROUP_STAGE: 'group',
      LAST_32: 'r32',
      LAST_16: 'r16',
      QUARTER_FINALS: 'qf',
      SEMI_FINALS: 'sf',
      THIRD_PLACE: '3rd',
      FINAL: 'final',
    };
    return map[stage] || null;
  }

  function minuteKey(iso) {
    if (!iso) return '';
    return String(iso).slice(0, 16);
  }

  function ingest(matches) {
    matches.forEach(m => {
      const ft      = m.score?.fullTime || {};
      const ht      = m.score?.halfTime || {};
      const payload = {
        status:    m.status,
        scoreHome: ft.home ?? null,
        scoreAway: ft.away ?? null,
        htHome:    ht.home ?? null,
        htAway:    ht.away ?? null,
        minute:    m.minute || null,
        scorers:   (m.goals||[]).map(g => ({
          team:   canon(g.team?.name || ''),
          player: g.scorer?.name || 'Own Goal',
          minute: g.minute,
          type:   g.type || 'REGULAR',
        })),
        homeApi: m.homeTeam?.name || '',
        awayApi: m.awayTeam?.name || '',
      };

      // Match to our static fixtures by canonicalised name
      const hc = canon(m.homeTeam?.name || '');
      const ac = canon(m.awayTeam?.name || '');
      const groupFixture = WC2026.FIXTURES.find(f =>
        f.stage === 'group' &&
        canon(f.home) === hc &&
        canon(f.away) === ac
      );
      if (groupFixture) {
        liveData[`local_${groupFixture.id}`] = payload;
        return;
      }

      // Knockout placeholders don't have fixed team names; match by stage + kickoff minute.
      const stage = stageFromApi(m.stage);
      if (!stage || stage === 'group') return;

      const apiKickoffKey = minuteKey(m.utcDate);
      const knockoutFixture = WC2026.FIXTURES.find(f =>
        f.stage === stage && minuteKey(f.utc) === apiKickoffKey
      );
      if (knockoutFixture) {
        liveData[`local_${knockoutFixture.id}`] = payload;
      }
    });
  }

  function notify() { listeners.forEach(fn => { try { fn(liveData); } catch(e){} }); }

  // ── PUBLIC ────────────────────────────────────────────────────────────
  function onUpdate(fn) { listeners.push(fn); }

  function forFixture(f) { return liveData[`local_${f.id}`] || null; }

  function scoreLabel(f) {
    const d = forFixture(f);
    if (!d || d.scoreHome === null) return null;
    return `${d.scoreHome}–${d.scoreAway}`;
  }

  function statusBadge(f) {
    const d = forFixture(f);
    if (!d) return '';
    if (d.status === 'IN_PLAY')  return `<span class="badge badge--live">🔴 LIVE${d.minute ? ' ' + d.minute + "'" : ''}</span>`;
    if (d.status === 'PAUSED')   return `<span class="badge badge--live">⏸ HT</span>`;
    if (d.status === 'FINISHED') return `<span class="badge badge--ft">FT</span>`;
    return '';
  }

  function scorersHtml(f) {
    const d = forFixture(f);
    if (!d || !d.scorers || !d.scorers.length) return '';
    const items = d.scorers.map(g => {
      const ico = g.type==='OWN_GOAL' ? '⚽(OG)' : g.type==='PENALTY' ? '⚽(P)' : '⚽';
      return `<span class="scorer-item">${ico} ${g.player} <b>${g.minute}'</b></span>`;
    });
    return `<div class="scorers-row">${items.join('<span class="scorer-sep">·</span>')}</div>`;
  }

  // ── BANNER ────────────────────────────────────────────────────────────
  function setBanner(type) {
    const el = document.getElementById('liveBanner');
    if (!el) return;
    const msgs = {
      static:  '📋 Using static fixture data. Create <code>js/live-config.json</code> with <code>{"apiKey":"..."}</code>, or set <code>window.LIVE_API_KEY</code>, to enable live scores.',
      loading: '⏳ Connecting to live data feed…',
      live:    '🟢 Live data active — scores & results update every 60s.',
      error:   '⚠️ API error — check your local API key config. Showing static data.',
    };
    el.className = `live-banner live-banner--${type}`;
    el.style.display = 'block';
    el.innerHTML = `<span>${msgs[type]}</span>`;
    if (type === 'live') setTimeout(() => el.classList.add('live-banner--hidden'), 6000);
  }

  return { init, onUpdate, forFixture, scoreLabel, statusBadge, scorersHtml, hasKey };
})();
