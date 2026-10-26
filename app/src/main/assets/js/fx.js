/* Flash-era flourishes rebuilt on the platform that replaced Flash: Canvas, SVG, CSS. */
window.Fx = (function (global) {
  'use strict';

  var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas, ctx, W = 0, H = 0, dpr = 1, raf = 0, last = 0, running = false;
  var blobs = [], motes = [], palette = null, pointer = { x: 0.5, y: 0.35 };
  var io = null;

  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    var primary = cs.getPropertyValue('--primary-rgb').trim() || '79, 218, 212';
    var tertiary = cs.getPropertyValue('--tertiary-rgb').trim() || '181, 199, 231';
    var theme = document.documentElement.dataset.theme;
    palette = { primary: primary, tertiary: tertiary, dark: theme !== 'light' };
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    W = global.innerWidth; H = global.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    blobs = [];
    for (var i = 0; i < 4; i++) {
      blobs.push({
        x: Math.random(), y: Math.random() * 0.9,
        r: 0.28 + Math.random() * 0.3,
        vx: (Math.random() - 0.5) * 0.00012,
        vy: (Math.random() - 0.5) * 0.00012,
        c: i % 2 ? 'primary' : 'tertiary',
        a: 0.05 + Math.random() * 0.05,
        ph: Math.random() * 6.28
      });
    }
    motes = [];
    for (var j = 0; j < 46; j++) {
      motes.push({
        x: Math.random(), y: Math.random(),
        s: 0.6 + Math.random() * 1.6,
        v: 0.00004 + Math.random() * 0.00012,
        d: Math.random() * 6.28,
        a: 0.16 + Math.random() * 0.4
      });
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var driftX = (pointer.x - 0.5) * 26;
    var driftY = (pointer.y - 0.5) * 18;

    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      b.x += b.vx; b.y += b.vy;
      if (b.x < -0.3 || b.x > 1.3) b.vx *= -1;
      if (b.y < -0.3 || b.y > 1.3) b.vy *= -1;
      var pulse = 0.85 + Math.sin(t / 2600 + b.ph) * 0.15;
      var r = Math.max(W, H) * b.r * pulse;
      var cx = b.x * W + driftX, cy = b.y * H + driftY;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      var col = palette[b.c];
      g.addColorStop(0, 'rgba(' + col + ',' + b.a + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    ctx.fillStyle = 'rgba(' + palette.primary + ',1)';
    for (var k = 0; k < motes.length; k++) {
      var m = motes[k];
      m.y -= m.v * 16;
      m.x += Math.sin(t / 4200 + m.d) * 0.00012;
      if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      var x = m.x * W, y = m.y * H;
      var tw = 0.55 + Math.sin(t / 700 + m.d) * 0.45;
      ctx.globalAlpha = m.a * tw * (palette.dark ? 1 : 0.55);
      ctx.beginPath();
      ctx.arc(x, y, m.s, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(ts) {
    raf = global.requestAnimationFrame(loop);
    if (ts - last < 33) return;
    last = ts;
    if (!running || document.hidden) return;
    draw(ts);
  }

  function initCanvas() {
    canvas = document.getElementById('fxCanvas');
    if (!canvas || !canvas.getContext) return;
    ctx = canvas.getContext('2d');
    readPalette(); resize(); seed();
    if (reduced) { running = true; draw(0); running = false; return; }
    running = true;
    raf = global.requestAnimationFrame(loop);
    global.addEventListener('resize', function () { resize(); draw(performance.now()); }, { passive: true });
    global.addEventListener('pointermove', function (e) {
      pointer.x = e.clientX / Math.max(global.innerWidth, 1);
      pointer.y = e.clientY / Math.max(global.innerHeight, 1);
    }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) draw(performance.now());
    });
  }

  /* ---------- splash ---------- */
  function initSplash() {
    var splash = document.getElementById('splash');
    if (!splash) return;
    var hide = function () {
      splash.classList.add('hide');
      global.setTimeout(function () { splash.style.display = 'none'; }, 700);
    };
    if (reduced) { hide(); return; }
    var min = new Promise(function (res) { global.setTimeout(res, 1150); });
    var loaded = new Promise(function (res) {
      if (document.readyState === 'complete') res();
      else global.addEventListener('load', res, { once: true });
      global.setTimeout(res, 3000);
    });
    Promise.all([min, loaded]).then(hide);
    splash.addEventListener('click', hide);
  }

  /* ---------- ripple ---------- */
  function initRipple() {
    document.addEventListener('pointerdown', function (e) {
      if (reduced) return;
      var t = e.target;
      if (!t || !t.closest) return;
      var host = t.closest('button, .chip, .card, .check, summary, a, .nav-item, .step-button, .source-chip');
      if (!host || host.disabled) return;
      var cs = getComputedStyle(host);
      if (cs.position === 'static') host.style.position = 'relative';
      if (cs.overflow !== 'hidden') host.style.overflow = 'hidden';
      var rect = host.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 0.6;
      var span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = size + 'px';
      span.style.left = (e.clientX - rect.left - size / 2) + 'px';
      span.style.top = (e.clientY - rect.top - size / 2) + 'px';
      host.appendChild(span);
      global.setTimeout(function () { span.remove(); }, 620);
    }, { passive: true });
  }

  /* ---------- scroll reveal ---------- */
  function initReveal() {
    if (!global.IntersectionObserver) {
      document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
      return;
    }
    io = new global.IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    reveal(document);
  }

  function reveal(root) {
    var nodes = (root || document).querySelectorAll('.reveal:not(.in)');
    for (var i = 0; i < nodes.length; i++) {
      if (io) io.observe(nodes[i]);
      else nodes[i].classList.add('in');
    }
  }

  /* ---------- animated counters ---------- */
  function countTo(el, from, to, ms) {
    if (!el) return;
    if (reduced || from === to) { el.textContent = String(to); return; }
    var start = performance.now();
    var dur = ms || 700;
    function step(now) {
      var p = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (p < 1) global.requestAnimationFrame(step);
    }
    global.requestAnimationFrame(step);
  }

  function burst(text) {
    if (reduced) return;
    var el = document.createElement('div');
    el.className = 'burst';
    el.textContent = text;
    document.body.appendChild(el);
    global.setTimeout(function () { el.remove(); }, 1700);
    haptic(60);
    for (var i = 0; i < 26; i++) {
      (function (i) {
        global.setTimeout(function () {
          var d = document.createElement('span');
          d.style.cssText = 'position:fixed;left:50%;top:38%;width:6px;height:6px;border-radius:50%;background:' +
            (i % 2 ? 'var(--primary)' : 'var(--tertiary)') + ';z-index:69;pointer-events:none;' +
            'transform:translate(-50%,-50%);transition:transform .9s cubic-bezier(.2,0,0,1),opacity .9s';
          document.body.appendChild(d);
          requestAnimationFrame(function () {
            var ang = Math.random() * 6.2832, dist = 90 + Math.random() * 150;
            d.style.transform = 'translate(calc(-50% + ' + Math.cos(ang) * dist + 'px), calc(-50% + ' + Math.sin(ang) * dist + 'px)) scale(' + (0.4 + Math.random()) + ')';
            d.style.opacity = '0';
          });
          global.setTimeout(function () { d.remove(); }, 1000);
        }, i * 22);
      })(i);
    }
  }

  function haptic(ms) {
    if (global.AndroidBridge && typeof global.AndroidBridge.haptic === 'function') {
      try { global.AndroidBridge.haptic(ms || 12); return; } catch (e) { /* ignore */ }
    }
    if (navigator.vibrate) { try { navigator.vibrate(ms || 12); } catch (e) { /* ignore */ } }
  }

  return {
    init: function () {
      initCanvas();
      initSplash();
      initRipple();
      initReveal();
      if (global.Theme && global.Theme.onChange) {
        global.Theme.onChange(function () { readPalette(); if (reduced) draw(0); });
      }
    },
    reveal: reveal,
    countTo: countTo,
    burst: burst,
    haptic: haptic,
    reduced: reduced
  };
})(window);
