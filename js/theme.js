/* Material You theming: light/dark/auto + real dynamic colours from Android 13 wallpaper. */
window.Theme = (function (global) {
  'use strict';

  var keys = { mode: 'ui.theme.mode', dynamic: 'ui.theme.dynamic', dynColors: 'theme.dyn.v1' };
  var mode = 'auto';
  var dynamic = false;
  var palette = null;          // { light: {...}, dark: {...} }
  var applied = [];            // css vars currently overridden by dynamic colours
  var listeners = [];
  var system = null;

  var ROLE_TO_VAR = {
    primary: '--primary', onPrimary: '--on-primary', primaryContainer: '--primary-container',
    onPrimaryContainer: '--on-primary-container', secondary: '--secondary', onSecondary: '--on-secondary',
    secondaryContainer: '--secondary-container', onSecondaryContainer: '--on-secondary-container',
    tertiary: '--tertiary', onTertiary: '--on-tertiary', tertiaryContainer: '--tertiary-container',
    onTertiaryContainer: '--on-tertiary-container', error: '--error', onError: '--on-error',
    errorContainer: '--error-container', onErrorContainer: '--on-error-container',
    background: '--background', onBackground: '--on-background', surface: '--surface',
    onSurface: '--on-surface', surfaceVariant: '--surface-variant', onSurfaceVariant: '--on-surface-variant',
    surfaceContainerLowest: '--surface-container-lowest', surfaceContainerLow: '--surface-container-low',
    surfaceContainer: '--surface-container', surfaceContainerHigh: '--surface-container-high',
    surfaceContainerHighest: '--surface-container-highest', surfaceBright: '--surface-bright',
    surfaceDim: '--surface-dim', outline: '--outline', outlineVariant: '--outline-variant'
  };

  var RGB_OF = {
    '--primary': 'primary', '--on-primary': 'onPrimary', '--primary-container': 'primaryContainer',
    '--on-primary-container': 'onPrimaryContainer', '--secondary-container': 'secondaryContainer',
    '--on-secondary-container': 'onSecondaryContainer', '--surface': 'surface', '--on-surface': 'onSurface',
    '--on-surface-variant': 'onSurfaceVariant', '--outline': 'outline', '--outline-variant': 'outlineVariant',
    '--inverse-surface': 'inverseSurface', '--inverse-on-surface': 'inverseOnSurface',
    '--inverse-primary': 'inversePrimary', '--tertiary': 'tertiary', '--error': 'error'
  };

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return '0, 0, 0';
    return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255);
  }

  function notify() { for (var i = 0; i < listeners.length; i++) listeners[i](currentMode(), dynamic); }

  function currentMode() {
    if (mode !== 'auto') return mode;
    return system && system.matches ? 'dark' : 'light';
  }

  function clearDynamic() {
    var root = document.documentElement;
    for (var i = 0; i < applied.length; i++) root.style.removeProperty(applied[i]);
    applied = [];
  }

  function applyRoles(roles) {
    var root = document.documentElement;
    var merged = {};
    for (var role in ROLE_TO_VAR) if (roles[role]) merged[ROLE_TO_VAR[role]] = roles[role];
    // Inverse roles are derived: Android exposes no inverse_surface resource.
    if (roles.onSurface) merged['--inverse-surface'] = roles.onSurface;
    if (roles.surface) merged['--inverse-on-surface'] = roles.surface;
    var accent = roles.inversePrimary || roles.primary;
    if (accent) merged['--inverse-primary'] = accent;

    applied = [];
    for (var v in merged) {
      root.style.setProperty(v, merged[v]);
      applied.push(v);
      if (RGB_OF[v]) root.style.setProperty(v + '-rgb', hexToRgb(merged[v]));
      if (RGB_OF[v]) applied.push(v + '-rgb');
    }
  }

  function apply() {
    var root = document.documentElement;
    var m = currentMode();
    root.dataset.theme = m;
    root.dataset.dyn = dynamic && palette ? 'on' : 'off';

    clearDynamic();
    if (dynamic && palette && palette[m]) applyRoles(palette[m]);

    if (global.AndroidBridge && typeof global.AndroidBridge.setSystemBars === 'function') {
      var surfaceHex = (dynamic && palette && palette[m] && palette[m].surface) || null;
      if (!surfaceHex) {
        surfaceHex = getComputedStyle(root).getPropertyValue('--surface').trim() || (m === 'dark' ? '#0e1514' : '#f4faf9');
      }
      try { global.AndroidBridge.setSystemBars(surfaceHex, m === 'light'); } catch (e) { /* ignore */ }
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var surface = (dynamic && palette && palette[m] && palette[m].surface) ||
        getComputedStyle(root).getPropertyValue('--surface').trim();
      meta.setAttribute('content', surface || (m === 'dark' ? '#0e1514' : '#f4faf9'));
    }
    notify();
  }

  function loadPalette() {
    if (global.AndroidBridge && typeof global.AndroidBridge.getDynamicColors === 'function') {
      try {
        var raw = global.AndroidBridge.getDynamicColors();
        if (raw) palette = JSON.parse(raw);
      } catch (e) { palette = null; }
    }
    if (!palette) {
      try { palette = global.Store.getJSON(keys.dynColors, null); } catch (e) { palette = null; }
    }
    return !!palette;
  }

  return {
    init: function () {
      mode = global.Store.get(keys.mode, 'auto') || 'auto';
      dynamic = global.Store.get(keys.dynamic, '1') !== '0';
      system = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;
      loadPalette();
      if (system && system.addEventListener) {
        system.addEventListener('change', function () { if (mode === 'auto') apply(); });
      }
      apply();
      return { hasDynamic: !!palette };
    },
    onChange: function (fn) { listeners.push(fn); },
    mode: function () { return mode; },
    setMode: function (value) {
      mode = value;
      global.Store.set(keys.mode, value);
      apply();
    },
    dynamic: function () { return dynamic && !!palette; },
    hasDynamic: function () { return !!palette; },
    setDynamic: function (value) {
      dynamic = !!value;
      global.Store.set(keys.dynamic, value ? '1' : '0');
      apply();
    },
    refresh: function () { loadPalette(); apply(); },
    apply: apply,
    modeName: function () { return mode === 'auto' ? 'авто' : (mode === 'dark' ? 'тёмная' : 'светлая'); }
  };
})(window);
