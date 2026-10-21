/* ==========================================================================
   10-util.js — small helpers: escaping, ids, time arithmetic and formatting,
   downloads. Times are stored as ISO 8601 strings in UTC and handled as
   milliseconds since the epoch in between.
   ========================================================================== */

QDF.util = (function () {

  var ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ENTITIES[c];
    });
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < (width || 2)) s = '0' + s;
    return s;
  }

  function iso(ms) {
    return new Date(ms).toISOString();
  }

  /* ISO string → ms, or null when it is not a usable time. */
  function ms(isoString) {
    if (typeof isoString !== 'string' || !isoString) return null;
    var t = Date.parse(isoString);
    return isNaN(t) ? null : t;
  }

  function isTime(value) {
    return ms(value) !== null;
  }

  /* Whole seconds from an ISO time to `nowMs`, never negative. */
  function secondsSince(isoString, nowMs) {
    var t = ms(isoString);
    if (t === null) return 0;
    return Math.max(0, Math.floor((nowMs - t) / 1000));
  }

  function uid(nowMs) {
    return 't-' + Math.floor(nowMs || Date.now()).toString(36) + '-' +
      Math.random().toString(36).slice(2, 6);
  }

  /* 0:42:07 — always hours, so the digits do not jump about. */
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    return h + ':' + pad(m) + ':' + pad(sec % 60);
  }

  /* Human duration. `precise` keeps seconds while under an hour, for values
     that tick on screen; otherwise the shortest honest phrasing. */
  function duration(sec, precise) {
    sec = Math.max(0, Math.floor(sec || 0));
    var d = Math.floor(sec / 86400);
    var h = Math.floor((sec % 86400) / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + pad(m) + 'm';
    if (precise) return m ? m + 'm ' + pad(s) + 's' : s + 's';
    if (m) return m + 'm';
    return sec ? '<1m' : '0m';
  }

  function ago(sec) {
    if (sec < 60) return 'just now';
    return duration(sec) + ' ago';
  }

  function localDate(isoString) {
    var t = ms(isoString);
    return t === null ? null : new Date(t);
  }

  /* 14:05 in local time. */
  function timeOfDay(isoString) {
    var d = localDate(isoString);
    return d ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
  }

  function dayKey(isoString) {
    var d = localDate(isoString);
    return d ? d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) : '';
  }

  /* Today / Yesterday / Mon 19 Oct / Mon 19 Oct 2025 */
  function dayLabel(isoString, nowMs) {
    var d = localDate(isoString);
    if (!d) return 'Unknown day';
    var key = dayKey(isoString);
    if (key === dayKey(iso(nowMs))) return 'Today';
    if (key === dayKey(iso(nowMs - 86400000))) return 'Yesterday';
    var label = DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    if (d.getFullYear() !== new Date(nowMs).getFullYear()) label += ' ' + d.getFullYear();
    return label;
  }

  /* Wednesday 21 October (and the year when it is not this year). */
  function longDate(isoString, nowMs) {
    var d = localDate(isoString);
    if (!d) return '';
    var label = LONG_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + LONG_MONTHS[d.getMonth()];
    if (nowMs && d.getFullYear() !== new Date(nowMs).getFullYear()) label += ' ' + d.getFullYear();
    return label;
  }

  /* Local midnight at the start of the day containing `ms`. */
  function dayStart(msValue) {
    var d = new Date(msValue);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* 2026-10-21-1405, local time, for file names. */
  function fileStamp(nowMs) {
    var d = new Date(nowMs);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      '-' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : (many || one + 's'));
  }

  function firstLine(text) {
    return String(text || '').split('\n')[0].trim();
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function readFile(file, done) {
    var reader = new FileReader();
    reader.onload = function () { done(null, String(reader.result)); };
    reader.onerror = function () { done(reader.error || new Error('Could not read the file.')); };
    reader.readAsText(file);
  }

  return {
    esc: esc, pad: pad, iso: iso, ms: ms, isTime: isTime,
    secondsSince: secondsSince, uid: uid,
    clock: clock, duration: duration, ago: ago,
    timeOfDay: timeOfDay, dayKey: dayKey, dayLabel: dayLabel, fileStamp: fileStamp,
    longDate: longDate, dayStart: dayStart,
    plural: plural, firstLine: firstLine,
    download: download, readFile: readFile
  };
})();
