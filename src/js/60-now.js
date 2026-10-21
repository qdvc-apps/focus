/* ==========================================================================
   60-now.js — the "Now" panel: what is in focus, how long since it started,
   and the controls for moving on.
   ========================================================================== */

QDF.view.now = function (s, now) {
  var U = QDF.util, M = QDF.model, I = QDF.icon, T = QDF.view.tick;
  var c = s.current, next = M.upNext(s);

  if (!c) return QDF.view.nowEmpty(s, now, next);

  var id = U.esc(c.id);
  var bg = c.backgroundSeconds || 0;
  var stats =
    '<div class="stat"><span class="stat-label">This stretch</span><span class="stat-value">' +
      T('durp', c.focusedSince, 0, now) + '</span></div>' +
    '<div class="stat"><span class="stat-label">Focused in total</span><span class="stat-value">' +
      T('dur', c.focusedSince, c.focusSeconds || 0, now) + '</span></div>' +
    (bg ? '<div class="stat"><span class="stat-label">In background</span><span class="stat-value">' +
      U.esc(U.duration(bg)) + '</span></div>' : '');

  return '' +
    '<div class="now-card" data-drop="now">' +
      '<div class="now-main">' +
        '<div class="eyebrow"><span class="live-lamp" aria-hidden="true"></span>Working on now</div>' +
        '<div class="now-title" data-dbl-edit="' + id + '" title="Double-click to edit">' + U.esc(c.title) + '</div>' +
        (c.notes
          ? '<div class="now-notes" data-dbl-edit="' + id + '">' + U.esc(c.notes) + '</div>'
          : '<button type="button" class="link-btn" data-act="edit" data-id="' + id + '">Add notes</button>') +
        '<div class="now-actions">' +
          '<button type="button" class="btn btn-go btn-lg" data-act="done-next" id="btn-done-next">' + I('check') +
            '<span>' + (next ? 'Done, start next' : 'Done') + '</span></button>' +
          '<button type="button" class="btn btn-lg" data-act="to-background" title="It carries on without you (a build, a render, an upload). ' +
            (next ? 'Up next comes into focus.' : '') + '">' + I('background') + '<span>Send to background</span></button>' +
          '<button type="button" class="btn btn-lg btn-icon" data-act="now-menu" aria-haspopup="menu" aria-expanded="false" aria-label="More actions" title="More actions">' +
            I('more') + '</button>' +
        '</div>' +
        '<div class="now-next">' + (next
          ? '<span class="dim">Then:</span> ' + U.esc(next.title)
          : '<span class="dim">Nothing queued after this.</span>') + '</div>' +
      '</div>' +
      '<div class="now-side">' +
        '<div class="clock-face">' +
          '<div class="clock-label">Since started</div>' +
          '<div class="clock-digits">' + T('clock', c.started, 0, now) + '</div>' +
          '<div class="clock-sub">Started at ' + U.esc(U.timeOfDay(c.started)) +
            (U.dayKey(c.started) !== U.dayKey(U.iso(now)) ? ', ' + U.esc(U.dayLabel(c.started, now)) : '') + '</div>' +
        '</div>' +
        '<div class="now-stats">' + stats + '</div>' +
      '</div>' +
      '<div class="drop-hint" aria-hidden="true">Drop to start now</div>' +
    '</div>';
};

QDF.view.nowEmpty = function (s, now, next) {
  var U = QDF.util, I = QDF.icon;
  var lead = next
    ? '<p class="now-empty-text">Up next is <b>' + U.esc(next.title) + '</b>.</p>' +
      '<div class="now-actions">' +
        '<button type="button" class="btn btn-go btn-lg" data-act="start" data-id="' + U.esc(next.id) + '">' + I('play') +
        '<span>Start it</span></button>' +
      '</div>' +
      '<div class="or-rule"><span>or start something else</span></div>'
    : '<p class="now-empty-text">What are you working on?</p>';
  return '' +
    '<div class="now-card is-empty" data-drop="now">' +
      '<div class="now-main">' +
        '<div class="eyebrow"><span class="live-lamp is-off" aria-hidden="true"></span>Working on now</div>' +
        '<div class="now-title is-placeholder">Nothing in focus</div>' +
        lead +
        '<form class="quick-start" data-form="quick-start" autocomplete="off">' +
          '<input class="field" id="quick-start-input" name="title" maxlength="300" placeholder="Type a task and press Enter to start it" aria-label="Start a new task">' +
          '<button type="submit" class="btn">' + I('play') + '<span>Start</span></button>' +
        '</form>' +
      '</div>' +
      '<div class="now-side">' +
        '<div class="clock-face is-off">' +
          '<div class="clock-label">Since started</div>' +
          '<div class="clock-digits">0:00:00</div>' +
          '<div class="clock-sub">Not running</div>' +
        '</div>' +
      '</div>' +
      '<div class="drop-hint" aria-hidden="true">Drop to start now</div>' +
    '</div>';
};
