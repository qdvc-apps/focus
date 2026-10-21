/* ==========================================================================
   55-chrome.js — shared view helpers (ticking values, formats) and the
   window chrome: the "since last update" display and the brand mark.

   Views are pure: (state, now) → HTML string. Anything that changes every
   second is marked with data-tick so the controller can refresh the text
   without re-rendering (which would interrupt a drag in progress):

     data-tick="clock|dur|durp|ago|tod"   format, see QDF.view.format
     data-from="<ISO time>"               counting up from this time
     data-base="<seconds>"                added on top (banked time)
   ========================================================================== */

QDF.view.tick = function (fmt, fromIso, base, nowMs) {
  var U = QDF.util;
  var sec = (base || 0) + (fromIso ? U.secondsSince(fromIso, nowMs) : 0);
  return '<span data-tick="' + fmt + '"' + (fromIso ? ' data-from="' + U.esc(fromIso) + '"' : '') +
    (base ? ' data-base="' + Math.floor(base) + '"' : '') + '>' +
    U.esc(QDF.view.format(fmt, sec, nowMs)) + '</span>';
};

QDF.view.format = function (fmt, sec, nowMs) {
  var U = QDF.util;
  if (fmt === 'clock') return U.clock(sec);
  if (fmt === 'durp') return U.duration(sec, true);
  if (fmt === 'ago') return U.ago(sec);
  if (fmt === 'tod') return U.timeOfDay(U.iso(nowMs));
  return U.duration(sec);
};

QDF.view.idleLevel = function (sec) {
  if (sec >= QDF.IDLE.alertAfter * 60) return 'alert';
  if (sec >= QDF.IDLE.warnAfter * 60) return 'warn';
  return 'ok';
};

QDF.view.idle = function (s, now) {
  var sec = QDF.model.idle(s, now);
  return '<span class="idle-calm timer-alt">Timers are hidden</span>' +
    '<button type="button" class="idle-chip timer" id="idle-chip" data-act="check-in" data-level="' +
      QDF.view.idleLevel(sec) + '" title="Time since you last changed anything here. Click to check in without changing anything.">' +
    '<span class="idle-lamp" aria-hidden="true"></span>' +
    '<span class="idle-text">' +
      '<span class="idle-label">Since last update</span>' +
      '<span class="idle-value">' + QDF.view.tick('durp', s.lastInteraction, 0, now) + '</span>' +
    '</span>' +
  '</button>';
};

/* The application mark: a lens over a horizon line. The prefix keeps the
   gradient ids unique when the mark appears twice on the page. */
QDF.view.brandMark = function (prefix) {
  var p = prefix || 'bm';
  return '<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" focusable="false">' +
    '<defs>' +
      '<linearGradient id="' + p + '-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b5563"/><stop offset="1" stop-color="#1f242b"/></linearGradient>' +
      '<radialGradient id="' + p + '-lens" cx=".42" cy=".36" r=".7"><stop offset="0" stop-color="#9fd0ff"/><stop offset=".55" stop-color="#3a7fd0"/><stop offset="1" stop-color="#16407a"/></radialGradient>' +
      '<linearGradient id="' + p + '-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
    '</defs>' +
    '<rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="url(#' + p + '-body)" stroke="#14181d"/>' +
    '<rect x="2.5" y="2.5" width="27" height="27" rx="6" fill="none" stroke="#fff" stroke-opacity=".18"/>' +
    '<circle cx="16" cy="16" r="9" fill="url(#' + p + '-lens)" stroke="#0e2c55"/>' +
    '<path d="M7.6 17.5h16.8" stroke="#e8f3ff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>' +
    '<circle cx="16" cy="17.5" r="2" fill="#fff"/>' +
    '<ellipse cx="16" cy="11.6" rx="6.2" ry="3.6" fill="url(#' + p + '-gloss)"/>' +
  '</svg>';
};
