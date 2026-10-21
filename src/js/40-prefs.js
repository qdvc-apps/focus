/* ==========================================================================
   40-prefs.js — interface preferences: colour theme and which drawers are
   open. Kept apart from the task state (and out of the YAML), in their own
   localStorage key.

   The theme is applied as soon as this file runs, before the page is first
   painted, so a dark-mode user never sees a flash of the light theme.
   ========================================================================== */

QDF.prefs = (function () {
  var THEMES = ['auto', 'light', 'dark'];
  var DEFAULTS = { theme: 'auto', overview: false, inspector: false };
  var p = copy(DEFAULTS);
  var mq = null;
  var listeners = [];

  function copy(o) {
    return { theme: o.theme, overview: o.overview, inspector: o.inspector };
  }

  function storage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  function load() {
    var ls = storage();
    try {
      var raw = ls && ls.getItem(QDF.APP.prefsKey);
      if (raw) {
        var o = JSON.parse(raw);
        if (THEMES.indexOf(o.theme) !== -1) p.theme = o.theme;
        p.overview = !!o.overview;
        p.inspector = !!o.inspector;
      }
    } catch (e) { p = copy(DEFAULTS); }
  }

  function save() {
    var ls = storage();
    try { if (ls) ls.setItem(QDF.APP.prefsKey, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  function systemDark() {
    return !!(mq && mq.matches);
  }

  function effectiveTheme() {
    return p.theme === 'auto' ? (systemDark() ? 'dark' : 'light') : p.theme;
  }

  function apply() {
    if (typeof document === 'undefined' || !document.documentElement || !document.documentElement.setAttribute) return;
    document.documentElement.setAttribute('data-theme', effectiveTheme());
  }

  function get(key) { return p[key]; }

  function set(key, value) {
    if (p[key] === value) return;
    p[key] = value;
    save();
    if (key === 'theme') apply();
    listeners.forEach(function (fn) { fn(key, value); });
  }

  /* After "Reset app" has cleared storage: back to the defaults, unsaved. */
  function reset() {
    p = copy(DEFAULTS);
    apply();
    listeners.forEach(function (fn) { fn('reset'); });
  }

  function onChange(fn) { listeners.push(fn); }

  function init() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      var follow = function () { if (p.theme === 'auto') apply(); };
      if (mq.addEventListener) mq.addEventListener('change', follow);
      else if (mq.addListener) mq.addListener(follow);
    }
    load();
    apply();
  }

  if (typeof document !== 'undefined' && document.documentElement && document.documentElement.setAttribute) init();

  return {
    THEMES: THEMES, get: get, set: set, reset: reset, onChange: onChange,
    effectiveTheme: effectiveTheme, init: init
  };
})();
