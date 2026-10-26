/* AION 2 · Путь к 2000 GS — UI, live guide feed, trackers. */
window.App = (function (global) {
  'use strict';

  var K = global.AppConfig.keys;
  var guide = null;
  var state = {
    gs: 1600,
    screen: 'home',
    cat: 'all',
    arcana: [],
    checks: {}
  };
  var feed = { status: 'init', when: null, version: null, origin: '—' };
  var prevGs = null;
  var pull = { active: false, y0: 0, dist: 0, busy: false };
  var TARGET_HINT = 46; // pull distance that triggers a refresh
  var TOP_EPS = 6; // px of scroll still treated as "top of the page"

  /* ============ helpers ============ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function icon(name, cls) { return '<svg class="ico ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function relTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'только что';
    if (mins < 60) return mins + ' мин назад';
    var h = Math.round(mins / 60);
    if (h < 24) return h + ' ч назад';
    return fmtDate(iso);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ============ guide feed ============ */
  function newerOf(a, b) {
    if (!a) return b;
    if (!b) return a;
    return new Date(a.meta && a.meta.builtAt || 0) >= new Date(b.meta && b.meta.builtAt || 0) ? a : b;
  }

  function applyGuide(payload, meta) {
    if (!payload || !payload.meta) return false;
    var changed = !guide || (guide.meta || {}).builtAt !== (payload.meta || {}).builtAt ||
      (guide.meta || {}).version !== (payload.meta || {}).version;
    guide = payload;
    if (meta && meta.origin) feed.origin = meta.origin;
    feed.version = payload.meta.version;
    feed.when = payload.meta.builtAt;
    if (meta && meta.status) feed.status = meta.status;
    if (changed) {
      try { global.Store.setJSON(K.guide, payload); } catch (e) { /* ignore */ }
      renderAll();
    }
    updateFeedLine();
    return changed;
  }

  /* Remote guide: native stack inside the APK (no CORS on file://), plain fetch on the web. */
  function requestPayload(url) {
    if (global.AppConfig.isAndroid && global.AndroidBridge && typeof global.AndroidBridge.fetchGuide === 'function') {
      return new Promise(function (resolve, reject) {
        var raw = null;
        try { raw = global.AndroidBridge.fetchGuide(url); } catch (e) { reject(e); return; }
        if (!raw) { reject(new Error('empty')); return; }
        try { resolve(JSON.parse(raw)); } catch (err) { reject(err); }
      });
    }
    var bust = url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    return fetch(bust, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function fetchGuide(opts) {
    opts = opts || {};
    if (pull.busy) return Promise.resolve(false);
    pull.busy = true;
    setFeed('loading');
    var url = global.AppConfig.guideUrl();
    return requestPayload(url)
      .then(function (json) {
        var changed = applyGuide(json, { status: 'online', origin: 'сеть' });
        feed.status = 'online';
        feed.when = feed.when || json.meta.builtAt;
        updateFeedLine();
        if (!opts.silent) {
          snack(changed ? 'Данные обновлены · v' + json.meta.version : 'Уже актуально · v' + json.meta.version, null, null);
        }
        return changed;
      })
      .catch(function (err) {
        feed.status = navigator.onLine === false ? 'offline' : 'error';
        updateFeedLine();
        if (!opts.silent) snack('Нет связи — показан сохранённый снимок', null, null);
        return false;
      })
      .then(function (v) {
        pull.busy = false;
        stopSpin();
        return v;
      });
  }

  function setFeed(status) {
    feed.status = status;
    updateFeedLine();
    if (status === 'loading') startSpin();
  }

  function startSpin() {
    var b = $('#btnRefresh');
    if (b) b.classList.add('spin');
    var el = $('#pullIndicator');
    if (el && pull.active) el.classList.add('visible', 'spinning');
  }
  function stopSpin() {
    var b = $('#btnRefresh');
    if (b) b.classList.remove('spin');
    var el = $('#pullIndicator');
    if (el && !pull.active) {
      el.classList.remove('spinning', 'visible');
      el.style.setProperty('--pull-rotate', '0deg');
    }
  }

  function updateFeedLine() {
    var dot = $('#feedDot'), txt = $('#feedText'), btn = $('#feedAction');
    if (!dot || !txt) return;
    var label;
    dot.classList.toggle('stale', feed.status === 'error' || feed.status === 'offline');
    if (feed.status === 'loading') label = 'проверяем обновления…';
    else if (feed.status === 'offline') label = 'офлайн · снимок от ' + fmtDate(feed.when);
    else if (feed.status === 'error') label = 'сеть недоступна · v' + feed.version + ' от ' + fmtDate(feed.when);
    else if (feed.status === 'cache') label = 'из памяти · v' + feed.version + ' · ' + relTime(feed.when);
    else if (feed.status === 'local') label = 'встроенная копия · v' + feed.version;
    else label = 'из сети · v' + feed.version + ' · ' + relTime(feed.when) + (guide && guide.meta.sourcesTotal ? ' · источники ' + guide.meta.sourcesOk + '/' + guide.meta.sourcesTotal : '');
    txt.textContent = label;
    if (btn) btn.textContent = feed.status === 'loading' ? 'ждём' : 'обновить';
    var dv = $('#dataVer'), dw = $('#dataWhen');
    if (dv) dv.textContent = 'гайд v' + feed.version;
    if (dw) dw.textContent = (feed.status === 'online' ? 'из сети, ' : '') + fmtDate(feed.when) + (feed.when ? ' ' + fmtTime(feed.when) : '');
  }

  /* ============ home ============ */
  function stageFor(gs) {
    if (!guide) return null;
    for (var i = 0; i < guide.stages.length; i++) {
      var s = guide.stages[i];
      if (gs >= s.from && gs < s.to) return s;
    }
    if (guide.stages.length && gs >= guide.stages[guide.stages.length - 1].to) return guide.stages[guide.stages.length - 1];
    return guide.stages[0];
  }

  function hintFor(gs) {
    if (!guide) return null;
    for (var i = 0; i < guide.nextHints.length; i++) {
      var h = guide.nextHints[i];
      if (gs >= h.from && gs < h.to) return h;
    }
    return gs < guide.nextHints[0].from ? guide.nextHints[0] : guide.nextHints[guide.nextHints.length - 1];
  }

  function renderHome() {
    if (!guide) return;
    var meta = guide.meta;
    var start = meta.startGs, target = meta.targetGs;

    // timeline
    $('#timeline').innerHTML = guide.stages.map(function (s) {
      var cls = state.gs >= s.to ? 'done' : (state.gs >= s.from ? 'active' : '');
      return '<div class="stage ' + cls + ' reveal">' +
        '<div class="card">' +
        '<div class="stage-head"><span class="range-pill">' + esc(s.range) + '</span><span class="gain-pill">' + esc(s.gain) + '</span></div>' +
        '<h3>' + esc(s.title) + '</h3>' +
        '<p class="lead">' + esc(s.lead) + '</p>' +
        '<ul>' + s.bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>' +
        '<div class="where">' + s.where.map(function (w) { return '<span class="tag">' + esc(w) + '</span>'; }).join('') + '</div>' +
        '</div></div>';
    }).join('');

    $('#routeMeta').textContent = meta.startGs + ' → ' + meta.targetGs;
    $('#homeFoot').innerHTML = esc(meta.note) + '<br><b>' + esc(meta.disclaimer) + '</b>';

    renderNext();
    updateHero(false);
    global.Fx.reveal($('#screen-home'));
  }

  function renderNext() {
    var h = hintFor(state.gs);
    if (!h) { $('#nextStep').innerHTML = ''; return; }
    $('#nextStep').innerHTML = '<div class="next-step reveal">' +
      '<span class="next-icon">' + icon(h.icon || 'flag') + '</span>' +
      '<div class="grow"><span class="label">Следующий шаг</span><strong>' + esc(h.title) + '</strong>' +
      '<p>' + esc(h.text) + '</p></div></div>';
    global.Fx.reveal($('#nextStep'));
  }

  function updateHero(animate) {
    if (!guide) return;
    var meta = guide.meta;
    var start = meta.startGs, target = meta.targetGs;
    var gs = state.gs;
    var span = Math.max(1, target - start);
    var pct = clamp((gs - start) / span, 0, 1);
    var before = prevGs == null ? gs : prevGs;

    if (animate) global.Fx.countTo($('#gsNow'), before, gs, 420);
    else $('#gsNow').textContent = gs;

    $('#ringArc').style.strokeDashoffset = String(264 * (1 - pct));
    $('#ringPct').textContent = Math.round(pct * 100) + '%';
    $('#gsBar').style.width = (pct * 100).toFixed(1) + '%';
    var range = $('#gsRange');
    if (range && Number(range.value) !== gs) range.value = gs;
    range.style.setProperty('--pct', (((gs - range.min) / (range.max - range.min)) * 100).toFixed(1) + '%');

    var left = target - gs;
    $('#gsToGo').textContent = left > 0 ? 'до цели ' + left + ' очк.' : (left === 0 ? 'цель взята' : 'цель превышена на ' + (-left));
    $('#gsFrom').textContent = 'старт ' + start;
    var st = stageFor(gs);
    $('#gsStage').textContent = st ? st.range : '';

    if (prevGs != null && prevGs < target && gs >= target) global.Fx.burst(target + ' GS — цель взята');
    prevGs = gs;
  }

  function setGs(value) {
    var meta = guide ? guide.meta : { minGs: 1000, maxGs: 2500 };
    state.gs = clamp(Math.round(value), meta.minGs, meta.maxGs);
    global.Store.set(K.gs, state.gs);
    updateHero(true);
    renderNext();
    $$('#timeline .stage').forEach(function (el, i) {
      var s = guide.stages[i];
      el.classList.toggle('done', state.gs >= s.to);
      el.classList.toggle('active', state.gs >= s.from && state.gs < s.to);
    });
    global.Fx.haptic(8);
  }

  /* ============ farm ============ */
  function renderFarm() {
    if (!guide) return;
    var cats = guide.farmCats.map(function (c) {
      return '<button class="chip' + (state.cat === c.id ? ' active' : '') + '" data-cat="' + c.id + '">' + esc(c.name) + '</button>';
    }).join('');

    var items = guide.farm.filter(function (f) { return state.cat === 'all' || f.cat.indexOf(state.cat) >= 0; });

    var cards = items.map(function (f) {
      return '<article class="card farm-card reveal">' +
        '<div class="farm-head">' +
        '<span class="farm-icon">' + icon(f.icon) + '</span>' +
        '<div class="farm-title"><h3>' + esc(f.title) + '</h3><div class="farm-sub">' + esc(f.sub) + '</div></div>' +
        '<span class="farm-badge">' + esc(f.badge) + '</span>' +
        '</div>' +
        f.kv.map(function (kv) { return '<div class="kv"><b>' + esc(kv.k) + '</b><p>' + esc(kv.v) + '</p></div>'; }).join('') +
        (f.tip ? '<div class="farm-tip">' + f.tip + '</div>' : '') +
        '</article>';
    }).join('');

    $('#screen-farm').innerHTML =
      '<div class="card intro reveal">' +
      '<h2>' + esc(guide.meta.subtitle) + '</h2>' +
      '<p>Диапазон 1600 → 2000 закрывается преимущественно Арканой, дальше — снаряжение Vakron и Urugugu, розетки и бесплатные кристаллы. Карточки ниже отвечают на вопрос «куда идти и сколько это даёт».</p>' +
      '<div class="pill-row">' +
      '<span class="pill primary">odyle 40 / открытие</span>' +
      '<span class="pill">гарантия 21</span>' +
      '<span class="pill tertiary">5 Epic = +100 GS</span>' +
      '</div></div>' +
      '<div class="section-title reveal"><h2>Источники</h2><span class="meta">' + items.length + ' карточек</span></div>' +
      '<div class="chips" id="farmChips">' + cats + '</div>' +
      (cards || '<div class="empty">Ничего не нашлось</div>') +
      '<p class="footer-note">Цены и шансы сверены с клиентскими таблицами Global.</p>';

    global.Fx.reveal($('#screen-farm'));
  }

  /* ============ arcana ============ */
  function defaultArcana() {
    var n = guide && guide.arcana ? guide.arcana.slots.length : 5;
    var out = [];
    for (var i = 0; i < n; i++) out.push({ g: 'none', l: 0 });
    return out;
  }

  function arcanaTotal() {
    if (!guide) return 0;
    var grades = {};
    guide.arcana.grades.forEach(function (g) { grades[g.id] = g.gs; });
    return state.arcana.reduce(function (sum, s, i) {
      var slot = guide.arcana.slots[i];
      if (!slot) return sum;
      return sum + (grades[s.g] || 0) + (s.l || 0);
    }, 0);
  }

  function renderArcana() {
    if (!guide) return;
    var a = guide.arcana;
    var grades = {};
    a.grades.forEach(function (g) { grades[g.id] = g.gs; });

    var total = arcanaTotal();
    var pct = clamp(total / 400, 0, 1);

    var slots = a.slots.map(function (slot, i) {
      var cur = state.arcana[i] || { g: 'none', l: 0 };
      var buttons = a.grades.map(function (g) {
        return '<button data-slot="' + i + '" data-grade="' + g.id + '" class="' + (cur.g === g.id ? 'on' : '') + '">' +
          '<span class="gdot"></span>' + esc(g.short) + '</button>';
      }).join('');
      var gain = (grades[cur.g] || 0) + (cur.l || 0);
      return '<div class="slot-row">' +
        '<div class="slot-top"><span class="slot-name">' + esc(slot.name) + '<em>' + esc(slot.ru) + '</em></span>' +
        '<span class="slot-drop">' + esc(slot.drop) + '<br>' + esc(slot.pool) + '</span></div>' +
        '<div class="segmented">' + buttons + '</div>' +
        '<div class="lvl-row"><span class="lvl-label">уровень карты</span>' +
        '<div class="lvl"><button data-lvl="-1" data-slot="' + i + '" ' + (cur.l <= 0 ? 'disabled' : '') + '>' + icon('minus') + '</button>' +
        '<span class="val">+' + (cur.l || 0) + '</span>' +
        '<button data-lvl="1" data-slot="' + i + '" ' + (cur.l >= 5 ? 'disabled' : '') + '>' + icon('plus') + '</button></div>' +
        '<span class="lvl-gs">+' + gain + ' GS</span></div>' +
        '</div>';
    }).join('');

    var table = a.table;
    var dungeonCards = a.dungeons.map(function (d) {
      var names = d.cards.map(function (id) {
        var s = a.slots.filter(function (x) { return x.id === id; })[0];
        return '<span class="tag">' + esc(s ? s.name : id) + '</span>';
      }).join('');
      return '<div class="kv"><b>' + esc(d.name) + '</b><p>' + d.ru + ' · ворота ' + esc(d.gate) + '</p><div class="where" style="margin-top:8px">' + names + '</div></div>';
    }).join('');

    $('#screen-arcana').innerHTML =
      '<div class="card reveal">' +
      '<span class="label">Итого Аркана</span>' +
      '<div class="arcana-total"><span id="arcanaTotal">' + total + '</span><span class="plus">GS</span>' +
      '<span class="delta">из 400 возможных</span></div>' +
      '<div class="arcana-bar"><div class="progress-rail"><span style="width:' + (pct * 100) + '%"></span></div></div>' +
      '<p class="arcana-note" style="margin-top:10px">' + esc(a.note) + '</p>' +
      '</div>' +

      '<div class="section-title reveal"><h2>Слоты</h2><span class="meta">5 карт</span></div>' +
      '<div class="card">' + slots + '</div>' +

      '<div class="section-title reveal"><h2>Градусы</h2><span class="meta">GS</span></div>' +
      '<div class="card tonal"><div class="table-wrap"><table><thead><tr>' +
      table.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      table.rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) { return '<td' + (i > 0 && i < 3 ? ' class="num"' : '') + '>' + esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('') +
      '</tbody></table></div></div>' +

      '<div class="section-title reveal"><h2>Откуда карты</h2><span class="meta">2 данжа</span></div>' +
      '<div class="card">' + dungeonCards + '</div>' +

      '<div class="section-title reveal"><h2>Крафт и прокачка</h2></div>' +
      '<details><summary>Крафт карты<span class="chev">' + icon('chev') + '</span></summary>' +
      '<div class="body"><ul>' +
      '<li><b>Стоимость:</b> ' + esc(a.craft.cost) + '</li>' +
      '<li><b>Результат:</b> ' + esc(a.craft.result) + '</li>' +
      '<li><b>Кристаллы:</b> ' + esc(a.craft.crystals) + '</li>' +
      '<li><b>Уровни:</b> ' + esc(a.craft.level) + '</li>' +
      '</ul></div></details>' +
      '<details><summary>Стадии Трансценденции<span class="chev">' + icon('chev') + '</span></summary>' +
      '<div class="body"><ul>' + a.stages.map(function (s) {
        return '<li><b>Стадия ' + s.n + ' (' + esc(s.gs) + ') — ' + esc(s.best) + ':</b> ' + esc(s.note) + '</li>';
      }).join('') + '</ul></div></details>' +

      '<p class="footer-note">Калькулятор считает градус карты плюс её уровень: каждая ступень даёт +1 GS.</p>';

    global.Fx.reveal($('#screen-arcana'));
  }

  function updateArcanaTotals() {
    var total = arcanaTotal();
    var el = $('#arcanaTotal');
    if (el) global.Fx.countTo(el, Number(el.textContent) || 0, total, 380);
    var bar = $('#screen-arcana .progress-rail span');
    if (bar) bar.style.width = clamp(total / 400, 0, 1) * 100 + '%';
    $$('#screen-arcana .lvl-row').forEach(function (row, i) {
      var slot = state.arcana[i];
      if (!slot || !guide) return;
      var grades = {};
      guide.arcana.grades.forEach(function (g) { grades[g.id] = g.gs; });
      var gain = (grades[slot.g] || 0) + (slot.l || 0);
      var out = row.querySelector('.lvl-gs');
      if (out) out.textContent = '+' + gain + ' GS';
      var val = row.querySelector('.val');
      if (val) val.textContent = '+' + (slot.l || 0);
      var minus = row.querySelector('[data-lvl="-1"]');
      var plus = row.querySelector('[data-lvl="1"]');
      if (minus) minus.disabled = slot.l <= 0;
      if (plus) plus.disabled = slot.l >= 5;
    });
    global.Store.setJSON(K.arcana, state.arcana);
  }

  /* ============ checklist ============ */
  function dayKey(d) {
    d = d || new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function weekKey(d) {
    d = new Date((d || new Date()).getTime() - 16 * 3600 * 1000); // server reset 16:00
    var toWed = (d.getDay() + 4) % 7; // 0 = Wednesday
    var wed = new Date(d.getFullYear(), d.getMonth(), d.getDate() - toWed);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return wed.getFullYear() + '-' + pad(wed.getMonth() + 1) + '-' + pad(wed.getDate());
  }

  function loadChecks() {
    var saved = global.Store.getJSON(K.checks, null);
    if (!saved || !saved.sections) saved = { sections: {}, stamps: {} };
    state.checks = saved;
    if (!guide) return;
    guide.checklist.forEach(function (sec) {
      if (sec.reset === 'daily' && saved.stamps[sec.id] !== dayKey()) saved.sections[sec.id] = {};
      if (sec.reset === 'weekly' && saved.stamps[sec.id] !== weekKey()) saved.sections[sec.id] = {};
    });
    global.Store.setJSON(K.checks, state.checks);
  }

  function saveChecks() {
    global.Store.setJSON(K.checks, state.checks);
  }

  function checkStats() {
    var done = 0, all = 0;
    if (!guide) return { done: 0, all: 0, pct: 0 };
    guide.checklist.forEach(function (sec) {
      var st = state.checks.sections[sec.id] || {};
      sec.items.forEach(function (it) { all++; if (st[it.id]) done++; });
    });
    return { done: done, all: all, pct: all ? Math.round((done / all) * 100) : 0 };
  }

  function renderCheck() {
    if (!guide) return;
    var s = checkStats();

    var sections = guide.checklist.map(function (sec) {
      var st = state.checks.sections[sec.id] || {};
      var secDone = sec.items.filter(function (it) { return st[it.id]; }).length;
      return '<div class="card check-section reveal" data-sec="' + sec.id + '">' +
        '<div class="check-head"><h3>' + esc(sec.title) + '</h3>' +
        '<span class="hint">' + esc(sec.hint) + ' · ' + secDone + '/' + sec.items.length + '</span>' +
        '<button class="text-button" data-reset="' + sec.id + '">сброс</button></div>' +
        '<div class="check-list">' +
        sec.items.map(function (it) {
          var on = st[it.id] ? 'checked' : '';
          return '<label class="check"><input type="checkbox" data-sec="' + sec.id + '" data-item="' + it.id + '" ' + on + '>' +
            '<span class="box"></span><span class="txt">' + esc(it.t) +
            (it.m ? '<span class="meta">' + esc(it.m) + '</span>' : '') + '</span></label>';
        }).join('') +
        '</div></div>';
    }).join('');

    $('#screen-check').innerHTML =
      '<div class="card reveal"><div class="check-summary">' +
      '<span class="big"><span id="checkDone">' + s.done + '</span> <small>/ ' + s.all + '</small></span>' +
      '<div class="grow"><span class="label">выполнено</span>' +
      '<div class="progress-rail" style="background:rgba(var(--on-surface-rgb),.1)"><span id="checkBar" style="width:' + s.pct + '%"></span></div>' +
      '<div class="pct" id="checkPct" style="margin-top:5px">' + s.pct + '% маршрута</div></div>' +
      '</div></div>' +
      '<div class="section-title reveal"><h2>Чеклисты</h2><span class="meta">4 блока</span></div>' +
      sections +
      '<p class="footer-note">Ежедневный и недельный блоки обнуляются автоматически: сброс недели — среда, 16:00 по серверу.</p>';

    global.Fx.reveal($('#screen-check'));
  }

  function updateCheckSummary() {
    var s = checkStats();
    var done = $('#checkDone'), bar = $('#checkBar'), pct = $('#checkPct');
    if (done) global.Fx.countTo(done, Number(done.textContent) || 0, s.done, 300);
    if (bar) bar.style.width = s.pct + '%';
    if (pct) pct.textContent = s.pct + '% маршрута';
    $$('#screen-check .check-section').forEach(function (el) {
      var id = el.dataset.sec;
      var sec = guide.checklist.filter(function (x) { return x.id === id; })[0];
      if (!sec) return;
      var st = state.checks.sections[id] || {};
      var n = sec.items.filter(function (it) { return st[it.id]; }).length;
      var hint = el.querySelector('.hint');
      if (hint) hint.textContent = sec.hint + ' · ' + n + '/' + sec.items.length;
    });
  }

  /* ============ sources / data ============ */
  function renderSources() {
    if (!guide) return;
    var ok = guide.meta.sourcesOk, total = guide.meta.sourcesTotal;

    var updates = guide.updates.map(function (u) {
      return '<li><span class="tag">' + esc(u.tag) + '</span><span class="grow">' + esc(u.text) +
        '<br><small style="opacity:.6">' + fmtDate(u.date) + '</small></span></li>';
    }).join('');

    var chips = guide.sources.map(function (s) {
      return '<a class="source-chip" href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
        '<span class="sdot' + (s.status === 'ok' ? '' : ' err') + '"></span>' + esc(s.name) + '</a>';
    }).join('');

    var list = guide.sources.map(function (s) {
      return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) +
        '<span>' + esc(s.note) + (s.checkedAt ? ' · проверен ' + fmtDate(s.checkedAt) : '') + '</span></a>';
    }).join('');

    var tables = guide.tables.map(function (t) {
      return '<details><summary>' + esc(t.title) + '<span class="chev">' + icon('chev') + '</span></summary>' +
        '<div class="body"><p style="margin-bottom:8px">' + esc(t.note) + '</p>' +
        '<div class="table-wrap"><table><thead><tr>' +
        t.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        t.rows.map(function (r) {
          return '<tr>' + r.map(function (c, i) {
            return '<td' + (i === 0 ? ' class="num"' : '') + '>' + esc(c) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></div></details>';
    }).join('');

    var pitfalls = guide.pitfalls.map(function (p) {
      return '<details><summary>' + esc(p.title) + '<span class="chev">' + icon('chev') + '</span></summary>' +
        '<div class="body">' + p.body + '</div></details>';
    }).join('');

    $('#screen-sources').innerHTML =
      '<div class="card feed-card reveal">' +
      '<div class="feed-head"><span class="status">' + icon('wifi') + '</span>' +
      '<div class="grow"><h3>Живая лента</h3><p>' + esc(guide.feedNote) + '</p></div></div>' +
      '<div style="margin-top:12px"><span class="status-pill' + (ok === total ? '' : ' warn') + '">' +
      '<span class="sdot"></span>источники ' + ok + '/' + total + ' · ' + fmtDate(guide.meta.builtAt) + '</span></div>' +
      '<ul class="feed-changes">' + updates + '</ul>' +
      '<div class="source-row">' + chips + '</div>' +
      '</div>' +

      '<div class="section-title reveal"><h2>Цифры</h2><span class="meta">таблицы</span></div>' +
      tables +

      '<div class="section-title reveal"><h2>Ловушки</h2><span class="meta">' + guide.pitfalls.length + '</span></div>' +
      pitfalls +

      '<div class="section-title reveal"><h2>Источники</h2><span class="meta">полные ссылки</span></div>' +
      '<div class="source-list">' + list + '</div>' +

      '<p class="footer-note">' + esc(guide.meta.note) + '<br><b>' + esc(guide.meta.disclaimer) + '</b><br>' +
      'Сборка ' + esc(guide.meta.version) + ' · ' + esc(guide.meta.game) + '</p>';

    global.Fx.reveal($('#screen-sources'));

    var sheetSources = $('#sheetSources');
    if (sheetSources) {
      sheetSources.innerHTML = guide.sources.map(function (s) {
        return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) +
          '<span>' + esc(s.note) + '</span></a>';
      }).join('');
    }
    var ver = $('#sheetVersion');
    if (ver) ver.textContent = 'гайд v' + guide.meta.version + ' · приложение v' + global.AppConfig.version + ' · ' + fmtDate(guide.meta.builtAt);
  }

  function renderAll() {
    renderHome();
    renderFarm();
    renderArcana();
    loadChecks();
    renderCheck();
    renderSources();
    applyScreen(state.screen, true);
  }

  /* ============ navigation ============ */
  var TITLES = {
    home: ['AION 2 · GLOBAL', 'Путь к 2000 GS'],
    farm: ['ГДЕ ФАРМИТЬ', 'Источники GS'],
    arcana: ['КАЛЬКУЛЯТОР', 'Аркана · 5 слотов'],
    check: ['ПРОГРЕСС', 'Чеклист маршрута'],
    sources: ['ДАННЫЕ', 'Источники и цифры']
  };

  function applyScreen(name, silent) {
    if (!TITLES[name]) name = 'home';
    state.screen = name;
    $$('.screen').forEach(function (s) { s.classList.toggle('active', s.id === 'screen-' + name); });
    $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.screen === name); });
    $('#barLabel').textContent = TITLES[name][0];
    $('#barTitle').textContent = TITLES[name][1];
    document.title = TITLES[name][1] + ' · AION 2';
    if (!silent) {
      global.Store.set(K.screen, name);
      global.scrollTo({ top: 0, behavior: 'smooth' });
      global.Fx.reveal(document.getElementById('screen-' + name));
      global.Fx.haptic(6);
    }
  }

  /* ============ snackbar ============ */
  var snackTimer = 0;
  function snack(text, actionLabel, cb) {
    var bar = $('#snackbar');
    $('#snackText').textContent = text;
    var btn = $('#snackAction');
    if (actionLabel) { btn.hidden = false; btn.textContent = actionLabel; btn.onclick = function () { cb && cb(); bar.classList.remove('show'); }; }
    else { btn.hidden = true; btn.onclick = null; }
    bar.classList.add('show');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(function () { bar.classList.remove('show'); }, 3600);
  }

  /* ============ settings sheet ============ */
  function openSheet() { $('#scrim').classList.add('open'); $('#sheet').classList.add('open'); }
  function closeSheet() { $('#scrim').classList.remove('open'); $('#sheet').classList.remove('open'); }

  function syncSheet() {
    $$('#themeSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.themeMode === global.Theme.mode()); });
    var sw = $('#dynSwitch');
    var has = global.Theme.hasDynamic();
    sw.checked = global.Theme.dynamic();
    sw.disabled = !has;
    $('#dynRow').classList.toggle('disabled', !has);
    $('#dynHint').textContent = has
      ? 'Палитра взята из обоев Android 13+'
      : (global.AppConfig.isAndroid ? 'Устройство без Material You (нужен Android 12+)' : 'Динамические цвета доступны только в приложении');
    var dl = $('#sheetDownload');
    var showDl = !global.AppConfig.isAndroid && !!global.AppConfig.apkUrl;
    dl.hidden = !showDl;
    if (showDl) dl.onclick = function () { global.open(global.AppConfig.apkUrl, '_blank'); };
  }

  /* ============ pull to refresh ============ */
  function initPull() {
    var indicator = $('#pullIndicator');
    function startY(e) {
      if (pull.busy) return;
      if (global.scrollY > TOP_EPS) return;
      var t = e.touches ? e.touches[0] : e;
      pull.y0 = t.clientY; pull.active = true; pull.dist = 0;
    }
    function moveY(e) {
      if (!pull.active || pull.busy) return;
      var t = e.touches ? e.touches[0] : e;
      var dy = t.clientY - pull.y0;
      if (dy <= 0 || global.scrollY > TOP_EPS) {
        if (dy <= 0 && pull.dist === 0) { pull.active = false; indicator.classList.remove('visible'); return; }
        if (global.scrollY > TOP_EPS) { pull.active = false; indicator.classList.remove('visible'); return; }
      }
      pull.dist = Math.min(dy * 0.55, 90);
      var p = Math.min(1, pull.dist / TARGET_HINT);
      indicator.style.setProperty('--pull-rotate', (p * 300) + 'deg');
      indicator.classList.add('visible');
      if (e.cancelable && global.scrollY <= TOP_EPS) e.preventDefault();
    }
    function endY() {
      if (!pull.active) return;
      pull.active = false;
      if (pull.dist >= TARGET_HINT) {
        indicator.classList.add('spinning');
        global.Fx.haptic(14);
        fetchGuide({ silent: false });
      } else {
        indicator.classList.remove('visible');
        indicator.style.setProperty('--pull-rotate', '0deg');
      }
      pull.dist = 0;
    }
    document.addEventListener('touchstart', startY, { passive: true });
    document.addEventListener('touchmove', moveY, { passive: false });
    document.addEventListener('touchend', endY, { passive: true });

    // mouse / pen fallback so the gesture also works on desktop
    function pointerDown(e) {
      if (e.pointerType === 'touch') return;
      document.body.style.userSelect = 'none';
      startY(e);
    }
    function pointerMove(e) {
      if (e.pointerType === 'touch' || !pull.active) return;
      moveY(e);
    }
    function pointerEnd(e) {
      if (e.pointerType === 'touch') return;
      document.body.style.userSelect = '';
      endY(e);
    }
    document.addEventListener('pointerdown', pointerDown, { passive: true });
    document.addEventListener('pointermove', pointerMove, { passive: false });
    document.addEventListener('pointerup', pointerEnd, { passive: true });
    document.addEventListener('pointercancel', pointerEnd, { passive: true });
  }

  /* ============ events ============ */
  function initEvents() {
    $('#navBar').addEventListener('click', function (e) {
      var b = e.target.closest('.nav-item');
      if (b) applyScreen(b.dataset.screen);
    });

    $('#btnRefresh').addEventListener('click', function () { global.Fx.haptic(10); fetchGuide({ silent: false }); });
    $('#feedAction').addEventListener('click', function () { fetchGuide({ silent: false }); });
    $('#btnSettings').addEventListener('click', function () { syncSheet(); openSheet(); });
    $('#scrim').addEventListener('click', closeSheet);
    $('#sheetRefresh').addEventListener('click', function () { fetchGuide({ silent: false }).then(function () { syncSheet(); }); });
    $('#themeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      global.Theme.setMode(b.dataset.themeMode);
      syncSheet();
      global.Fx.haptic(8);
    });
    $('#dynSwitch').addEventListener('change', function (e) {
      global.Theme.setDynamic(e.target.checked);
      syncSheet();
      snack(e.target.checked ? 'Динамические цвета включены' : 'Палитра приложения', null, null);
    });

    // hero controls
    $('#gsRange').addEventListener('input', function (e) { setGs(Number(e.target.value)); });
    $('#gsMinus').addEventListener('click', function () { setGs(state.gs - 10); });
    $('#gsPlus').addEventListener('click', function () { setGs(state.gs + 10); });

    // farm chips
    $('#screen-farm').addEventListener('click', function (e) {
      var c = e.target.closest('.chip');
      if (!c) return;
      state.cat = c.dataset.cat;
      renderFarm();
      global.Fx.haptic(6);
    });

    // arcana controls
    $('#screen-arcana').addEventListener('click', function (e) {
      var g = e.target.closest('button[data-grade]');
      if (g) {
        var i = Number(g.dataset.slot);
        state.arcana[i] = state.arcana[i] || { g: 'none', l: 0 };
        state.arcana[i].g = g.dataset.grade;
        $$('#screen-arcana .segmented')[i].querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('on', b === g);
        });
        updateArcanaTotals();
        global.Fx.haptic(8);
        return;
      }
      var l = e.target.closest('button[data-lvl]');
      if (l) {
        var idx = Number(l.dataset.slot);
        state.arcana[idx] = state.arcana[idx] || { g: 'none', l: 0 };
        state.arcana[idx].l = clamp((state.arcana[idx].l || 0) + Number(l.dataset.lvl), 0, 5);
        updateArcanaTotals();
        global.Fx.haptic(6);
      }
    });

    // checklist
    $('#screen-check').addEventListener('change', function (e) {
      var input = e.target.closest('input[type=checkbox]');
      if (!input) return;
      var sec = input.dataset.sec, item = input.dataset.item;
      state.checks.sections[sec] = state.checks.sections[sec] || {};
      state.checks.sections[sec][item] = input.checked;
      state.checks.stamps[sec] = sec === 'daily' ? dayKey() : (sec === 'weekly' ? weekKey() : (state.checks.stamps[sec] || dayKey()));
      saveChecks();
      updateCheckSummary();
      global.Fx.haptic(input.checked ? 8 : 5);
      if (checkStats().pct === 100) global.Fx.burst('Чеклист закрыт');
    });
    $('#screen-check').addEventListener('click', function (e) {
      var r = e.target.closest('[data-reset]');
      if (!r) return;
      var id = r.dataset.reset;
      state.checks.sections[id] = {};
      state.checks.stamps[id] = id === 'daily' ? dayKey() : (id === 'weekly' ? weekKey() : state.checks.stamps[id]);
      saveChecks();
      renderCheck();
      snack('Блок «' + (guide.checklist.filter(function (x) { return x.id === id; })[0] || {}).title + '» сброшен');
    });

    global.addEventListener('online', function () { fetchGuide({ silent: true }); });
    global.addEventListener('offline', function () { feed.status = 'offline'; updateFeedLine(); });
  }

  /* ============ boot ============ */
  function boot() {
    var res = global.Theme.init();
    global.Fx.init();

    var bundled = global.GUIDE_BUNDLE || null;
    var cached = global.Store.getJSON(K.guide, null);
    var chosen = newerOf(bundled, cached);
    feed.status = chosen === cached && cached ? 'cache' : 'local';

    state.gs = Number(global.Store.get(K.gs, 1600)) || 1600;
    state.screen = global.Store.get(K.screen, 'home') || 'home';
    state.arcana = global.Store.getJSON(K.arcana, null);
    if (!state.arcana || !state.arcana.length) state.arcana = defaultArcana();

    if (chosen) applyGuide(chosen, { status: feed.status, origin: 'память' });
    else {
      $('#feedText').textContent = 'данные не найдены';
      $('#feedDot').classList.add('stale');
    }

    initEvents();
    initPull();
    syncSheet();
    registerWorker();
    applyScreen(state.screen, true);
    global.Fx.reveal(document);

    if (res && res.hasDynamic === false) syncSheet();

    // live feed: fetch the remote copy right away
    setTimeout(function () { fetchGuide({ silent: true }); }, 700);
  }

  function registerWorker() {
    if (!('serviceWorker' in global.navigator)) return;
    if (!/^https?:$/.test(global.location.protocol)) return;
    global.navigator.serviceWorker.register('sw.js').catch(function () { /* offline shell */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { refresh: fetchGuide, state: state, version: global.AppConfig.version };
})(window);
