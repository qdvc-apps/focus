/* ==========================================================================
   55-chrome.js — views for the window chrome: the "since last update"
   indicator in the toolbar and the status bar.

   Views are pure: (state, now) → HTML string. Anything that changes every
   second is marked with data-tick so the controller can refresh the text
   without re-rendering (which would interrupt a drag in progress):

     data-tick="clock|dur|durp|ago"   format, see QDF.view.format
     data-from="<ISO time>"           counting up from this time
     data-base="<seconds>"            added on top (banked time)
   ========================================================================== */

QDF.view.tick = function (fmt, fromIso, base, nowMs) {
  var U = QDF.util;
  var sec = (base || 0) + (fromIso ? U.secondsSince(fromIso, nowMs) : 0);
  return '<span data-tick="' + fmt + '"' + (fromIso ? ' data-from="' + U.esc(fromIso) + '"' : '') +
    (base ? ' data-base="' + Math.floor(base) + '"' : '') + '>' + U.esc(QDF.view.format(fmt, sec)) + '</span>';
};

QDF.view.format = function (fmt, sec) {
  var U = QDF.util;
  if (fmt === 'clock') return U.clock(sec);
  if (fmt === 'durp') return U.duration(sec, true);
  if (fmt === 'ago') return U.ago(sec);
  return U.duration(sec);
};

QDF.view.idleLevel = function (sec) {
  if (sec >= QDF.IDLE.alertAfter * 60) return 'alert';
  if (sec >= QDF.IDLE.warnAfter * 60) return 'warn';
  return 'ok';
};

QDF.view.idle = function (s, now) {
  var sec = QDF.model.idle(s, now);
  return '<button type="button" class="idle-chip" id="idle-chip" data-act="check-in" data-level="' +
      QDF.view.idleLevel(sec) + '" title="Time since you last changed anything here. Click to check in without changing anything.">' +
    '<span class="idle-lamp" aria-hidden="true"></span>' +
    '<span class="idle-text">' +
      '<span class="idle-label">Since last update</span>' +
      '<span class="idle-value">' + QDF.view.tick('durp', s.lastInteraction, 0, now) + '</span>' +
    '</span>' +
  '</button>';
};

QDF.view.status = function (s, now, info) {
  var U = QDF.util;
  var doneToday = s.done.filter(function (d) { return U.dayKey(d.finished) === U.dayKey(U.iso(now)); }).length;
  var saved = info.error
    ? '<span class="status-item is-error">' + U.esc(info.error) + '</span>'
    : '<span class="status-item">' + (info.savedAt
        ? 'Saved in this browser at ' + U.esc(U.timeOfDay(U.iso(info.savedAt)))
        : 'Saved in this browser') + '</span>';
  return saved +
    '<span class="status-spacer"></span>' +
    '<span class="status-item">' + U.plural(s.queue.length, 'queued', 'queued') + '</span>' +
    '<span class="status-sep"></span>' +
    '<span class="status-item">' + s.background.length + ' in background</span>' +
    '<span class="status-sep"></span>' +
    '<span class="status-item">' + doneToday + ' done today</span>' +
    '<span class="status-sep"></span>' +
    '<span class="status-item status-version">' + U.esc(QDF.APP.name) + ' ' + U.esc(QDF.APP.version) + '</span>';
};
