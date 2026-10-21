/* ==========================================================================
   66-done.js — the done log, newest first, grouped by the day it finished.
   ========================================================================== */

QDF.view.done = function (s, now, prefs) {
  var U = QDF.util, M = QDF.model, I = QDF.icon;
  var collapsed = !!(prefs && prefs.doneCollapsed);
  var n = s.done.length;

  var head =
    '<div class="panel-head">' +
      '<button type="button" class="disclosure' + (collapsed ? '' : ' is-open') + '" data-act="toggle-done" aria-expanded="' + !collapsed + '">' +
        I('chevron') + '<span class="panel-title">Done</span></button>' +
      (n ? '<span class="count-badge">' + n + '</span>' : '') +
      '<span class="panel-sub">Newest first</span>' +
      (n ? '<button type="button" class="btn btn-sm push-right" data-act="clear-done">' + I('trash') + '<span>Clear log</span></button>' : '') +
    '</div>';

  if (collapsed) return '<section class="panel done-panel is-collapsed">' + head + '</section>';
  if (!n) {
    return '<section class="panel done-panel">' + head +
      '<div class="panel-empty">Finished tasks are logged here with when they started, when they finished and how much of that you spent on them.</div></section>';
  }

  var rows = [], lastDay = null, alt = false;
  s.done.forEach(function (item) {
    var day = U.dayKey(item.finished);
    if (day !== lastDay) {
      lastDay = day;
      var count = s.done.filter(function (d) { return U.dayKey(d.finished) === day; }).length;
      alt = false;
      rows.push('<div class="day-row"><span>' + U.esc(U.dayLabel(item.finished, now)) + '</span><span class="day-count">' +
        U.plural(count, 'task') + '</span></div>');
    }
    var id = U.esc(item.id);
    var focus = M.focusTotal(item, now), bg = M.backgroundTotal(item, now);
    alt = !alt;
    rows.push(
      '<div class="done-row' + (alt ? '' : ' is-alt') + '" data-dbl-edit="' + id + '">' +
        '<span class="done-check" aria-hidden="true">' + I('check') + '</span>' +
        '<span class="done-title">' + U.esc(item.title) + '</span>' +
        '<span class="done-when">' + U.esc(U.timeOfDay(item.started)) + '–' + U.esc(U.timeOfDay(item.finished)) + '</span>' +
        '<span class="done-took" title="From first start to finish">' + U.esc(U.duration(M.span(item))) + '</span>' +
        '<span class="done-focus" title="Time you spent focused on it' + (bg ? '; it also ran ' + U.esc(U.duration(bg)) + ' in background' : '') + '">' +
          U.esc(U.duration(focus)) + ' focused' + (bg >= 60 ? ' · ' + U.esc(U.duration(bg)) + ' bg' : '') + '</span>' +
        '<span class="done-tools">' +
          '<button type="button" class="tool" data-act="restore" data-id="' + id + '" title="Back to the queue" aria-label="Back to the queue: ' + U.esc(item.title) + '">' + I('restore') + '</button>' +
          '<button type="button" class="tool" data-act="remove" data-id="' + id + '" title="Remove from log" aria-label="Remove from log: ' + U.esc(item.title) + '">' + I('trash') + '</button>' +
        '</span>' +
      '</div>');
  });

  return '<section class="panel done-panel">' + head + '<div class="done-table">' + rows.join('') + '</div></section>';
};
