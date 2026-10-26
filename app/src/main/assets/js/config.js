/* Runtime configuration + key/value storage.
   Placeholders below are patched by scripts/build-web.mjs / build.sh for releases. */
(function (global) {
  'use strict';

  var BUILD_AT = '__BUILD_AT__';
  var GUIDE_URL_ANDROID = '__GUIDE_URL__';
  var APK_URL = '__APK_URL__';

  var isAndroid = typeof global.AndroidBridge !== 'undefined' && global.AndroidBridge !== null;
  var memory = {};

  var Store = {
    get isAndroid() { return isAndroid; },
    get: function (key, fallback) {
      var value = null;
      try {
        if (isAndroid) {
          value = global.AndroidBridge.getString(key);
        } else {
          value = global.localStorage.getItem(key);
        }
      } catch (e) { value = memory[key] != null ? memory[key] : null; }
      if (value === null || value === undefined || value === '') {
        return memory[key] != null ? memory[key] : fallback;
      }
      return value;
    },
    set: function (key, value) {
      memory[key] = String(value);
      try {
        if (isAndroid) global.AndroidBridge.putString(key, String(value));
        else global.localStorage.setItem(key, String(value));
      } catch (e) { /* private mode: memory only */ }
    },
    getJSON: function (key, fallback) {
      var raw = Store.get(key, null);
      if (!raw) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    setJSON: function (key, value) {
      try { Store.set(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
    reset: function (key) {
      try {
        if (isAndroid) global.AndroidBridge.putString(key, '');
        else global.localStorage.removeItem(key);
      } catch (e) { /* ignore */ }
      delete memory[key];
    }
  };

  global.Store = Store;

  global.AppConfig = {
    name: 'AION 2 · Путь к 2000 GS',
    short: 'Путь к 2000 GS',
    version: '1.0.0',
    buildAt: BUILD_AT.indexOf('__') === 0 ? null : BUILD_AT,
    guideUrlAndroid: GUIDE_URL_ANDROID.indexOf('__') === 0 ? '' : GUIDE_URL_ANDROID,
    apkUrl: APK_URL.indexOf('__') === 0 ? '' : APK_URL,
    isAndroid: isAndroid,
    store: Store,
    keys: {
      guide: 'guide.payload.v1',
      guideMeta: 'guide.meta.v1',
      gs: 'tracker.gs',
      theme: 'ui.theme.mode',
      dynamic: 'ui.theme.dynamic',
      arcana: 'arcana.slots',
      checks: 'check.state',
      screen: 'ui.screen',
      seen: 'ui.splash'
    },
    guideUrl: function () {
      if (isAndroid && this.guideUrlAndroid) return this.guideUrlAndroid;
      return 'data/guide.json';
    },
    /* Explicit remote URL for the web build is the relative one; used by the snackbar text. */
    dataOrigin: function () {
      if (isAndroid && this.guideUrlAndroid) return 'сеть';
      return 'сайт';
    }
  };
})(window);
