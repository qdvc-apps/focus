/* ==========================================================================
   25-store.js — the one live state, its persistence and its undo history.

   Every change goes through commit(label, fn): the state is cloned, `fn`
   mutates the clone using QDF.model, and if it reports a change the clone
   becomes the state, the previous one goes on the undo stack, the time of
   last interaction is stamped, and the result is saved and announced.
   States are never mutated in place, so undo is just swapping one back.

   The undo history lives in memory only; reloading the page clears it.
   ========================================================================== */

QDF.store = (function () {
  var U = QDF.util;

  var state = null;
  var history = [];
  var listeners = [];
  var info = { savedAt: null, error: null, notice: null };
  var now = function () { return Date.now(); };
  var backend = null;

  function storage() {
    if (backend) return backend;
    try { return window.localStorage; } catch (e) { return null; }
  }

  function clone(s) {
    return JSON.parse(JSON.stringify(s));
  }

  function emit(event) {
    listeners.slice().forEach(function (fn) { fn(event); });
  }

  function save() {
    var ls = storage();
    if (!ls) {
      info.error = 'This browser is not letting the page keep data. Export to keep a copy.';
      return false;
    }
    try {
      ls.setItem(QDF.APP.storageKey, JSON.stringify(QDF.serialize.toDoc(state, now())));
      info.savedAt = now();
      info.error = null;
      return true;
    } catch (e) {
      info.error = 'Could not save in this browser (' + (e && e.message || e) + '). Export to keep a copy.';
      return false;
    }
  }

  function readSaved() {
    var ls = storage(), raw = null;
    if (!ls) {
      info.error = 'This browser is not letting the page keep data. Export to keep a copy.';
      return null;
    }
    try { raw = ls.getItem(QDF.APP.storageKey); } catch (e) { raw = null; }
    if (!raw) return null;
    try {
      return QDF.serialize.fromDoc(JSON.parse(raw), now());
    } catch (e) {
      /* Keep the unreadable copy rather than overwrite it on the next save. */
      try { ls.setItem(QDF.APP.storageKey + '.unreadable', raw); } catch (e2) { /* ignore */ }
      info.notice = 'The saved session could not be read, so a fresh one was started. ' +
        'The old data was kept under "' + QDF.APP.storageKey + '.unreadable".';
      return null;
    }
  }

  function load() {
    state = readSaved() || QDF.model.newState(now());
    history = [];
    return state;
  }

  function get() {
    return state;
  }

  function push(label) {
    history.push({ label: label, state: state });
    if (history.length > QDF.APP.undoDepth) history.shift();
  }

  /* Returns whatever `fn` returned, or null when nothing changed. */
  function commit(label, fn) {
    var t = now();
    var next = clone(state);
    var result = fn(next, t);
    if (result === null || result === undefined || result === false) return null;
    push(label);
    next.lastInteraction = U.iso(t);
    state = next;
    save();
    emit({ type: 'commit', label: label, result: result });
    return result;
  }

  /* "I'm still on it": counts as an interaction without changing anything
     worth undoing. */
  function touch() {
    var next = clone(state);
    next.lastInteraction = U.iso(now());
    state = next;
    save();
    emit({ type: 'touch' });
  }

  function undo() {
    var entry = history.pop();
    if (!entry) return null;
    var restored = clone(entry.state);
    restored.lastInteraction = U.iso(now());
    state = restored;
    save();
    emit({ type: 'undo', label: entry.label });
    return entry.label;
  }

  function replace(newState, label) {
    push(label);
    var next = clone(newState);
    next.lastInteraction = U.iso(now());
    state = next;
    save();
    emit({ type: 'replace', label: label });
    return state;
  }

  /* Another tab saved. Its version wins; our undo history would only
     overwrite it, so it is dropped. */
  function reloadFromStorage() {
    var s = readSaved();
    if (!s) return false;
    state = s;
    history = [];
    emit({ type: 'external' });
    return true;
  }

  function undoLabel() {
    return history.length ? history[history.length - 1].label : null;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function takeNotice() {
    var n = info.notice;
    info.notice = null;
    return n;
  }

  /* For the test harnesses. */
  function configure(opts) {
    if (opts.now) now = opts.now;
    if (opts.storage) backend = opts.storage;
    if (opts.reset) { listeners = []; history = []; state = null; info = { savedAt: null, error: null, notice: null }; }
  }

  return {
    load: load, get: get, commit: commit, touch: touch, undo: undo, replace: replace,
    reloadFromStorage: reloadFromStorage, undoLabel: undoLabel, onChange: onChange,
    info: function () { return info; }, takeNotice: takeNotice,
    now: function () { return now(); },
    configure: configure
  };
})();
