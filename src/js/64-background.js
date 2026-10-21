/* ==========================================================================
   64-background.js — the background lane: tasks something else is working
   on (a build, a render, an upload) while you do something else.
   ========================================================================== */

QDF.view.background = function (s, now) {
  var U = QDF.util, M = QDF.model, I = QDF.icon, T = QDF.view.tick;

  var head =
    '<div class="panel-head">' +
      '<span class="panel-title">Running in background</span>' +
      (s.background.length ? '<span class="count-badge">' + s.background.length + '</span>' : '') +
      '<span class="panel-sub">Carrying on without you</span>' +
    '</div>';

  if (!s.background.length) {
    return '<section class="panel bg-panel is-empty">' + head +
      '<div class="panel-empty">Waiting on a build, a render or an upload? Use ' +
      '<b>Send to background</b> and carry on with what is up next. It will wait here, timed, until you come back to it.</div>' +
      '</section>';
  }

  var cards = s.background.map(function (item) {
    var id = U.esc(item.id);
    var earlier = item.backgroundSeconds || 0;
    return '' +
      '<div class="bg-card" data-dbl-edit="' + id + '">' +
        '<div class="bg-top">' +
          '<div class="bg-title">' + U.esc(item.title) + '</div>' +
          '<button type="button" class="tool" data-act="bg-menu" data-id="' + id + '" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ' + U.esc(item.title) + '" title="More actions">' + I('more') + '</button>' +
        '</div>' +
        '<div class="pole-track" aria-hidden="true"><div class="pole"></div></div>' +
        '<div class="bg-times">' +
          '<span class="bg-time-main">' + I('clock') + '<span>' + T('durp', item.backgroundSince, 0, now) + ' in background</span></span>' +
          '<span class="bg-time-sub">Since ' + U.esc(U.timeOfDay(item.backgroundSince)) +
            (earlier >= 60 ? ' · ' + U.esc(U.duration(earlier)) + ' earlier' : '') +
            ' · ' + U.esc(U.duration(M.focusTotal(item, now))) + ' focused</span>' +
        '</div>' +
        '<div class="bg-actions">' +
          '<button type="button" class="btn btn-sm" data-act="start" data-id="' + id + '" title="Bring it into focus; what you are on now becomes up next">' +
            I('forward') + '<span>Bring forward</span></button>' +
          '<button type="button" class="btn btn-sm btn-go" data-act="finish" data-id="' + id + '">' +
            I('check') + '<span>Done</span></button>' +
        '</div>' +
      '</div>';
  }).join('');

  return '<section class="panel bg-panel">' + head + '<div class="bg-grid">' + cards + '</div></section>';
};
