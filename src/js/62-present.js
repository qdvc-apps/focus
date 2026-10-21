/* ==========================================================================
   62-present.js — the present: the card for the task in focus, and what the
   now row shows when nothing is in focus.
   ========================================================================== */

QDF.view.present = function (r, s, now, isSelected) {
  var U = QDF.util, M = QDF.model, I = QDF.icon, T = QDF.view.tick;
  var c = r.item, id = U.esc(c.id), next = M.upNext(s);
  var open = r.stretch;
  var banked = M.focusTotal(c, now) - M.live(c, now);
  var bg = M.backgroundTotal(c, now);

  return '' +
    '<div class="present-card' + (isSelected ? ' is-selected' : '') + '" data-drop="now" data-select="' + id + '" tabindex="0">' +
      '<div class="pc-main">' +
        '<div class="eyebrow label"><span class="live-lamp" aria-hidden="true"></span>Working on now</div>' +
        '<div class="pc-title">' + U.esc(c.title) + '</div>' +
        (c.notes ? '<div class="pc-notes">' + U.esc(c.notes) + '</div>' : '') +
        '<div class="pc-actions">' +
          '<button type="button" class="btn btn-go" data-act="done-next" id="btn-done-next">' + I('check') +
            '<span>' + (next ? 'Done, start next' : 'Done') + '</span></button>' +
          '<button type="button" class="btn" data-act="to-background" title="It carries on without you (a build, a render, an upload)' +
            (next ? '; up next comes into focus' : '') + '.">' + I('background') + '<span>To background</span></button>' +
          '<button type="button" class="btn btn-icon" data-act="now-menu" aria-haspopup="menu" aria-expanded="false" aria-label="More actions" title="More actions">' +
            I('more') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="pc-side">' +
        '<div class="clock-face">' +
          '<div class="clock-label">Since started</div>' +
          '<div class="clock-digits">' + T('clock', M.started(c), 0, now) + '</div>' +
        '</div>' +
        '<dl class="pc-stats">' +
          '<dt>This stretch</dt><dd>' + T('durp', open.from, 0, now) + '</dd>' +
          '<dt>Focused in all</dt><dd>' + T('dur', open.from, banked, now) + '</dd>' +
          (bg ? '<dt>In background</dt><dd>' + U.esc(U.duration(bg)) + '</dd>' : '') +
        '</dl>' +
      '</div>' +
      '<div class="drop-hint" aria-hidden="true">Drop to start now</div>' +
    '</div>';
};

QDF.view.nowEmpty = function (s, now, r) {
  var U = QDF.util, I = QDF.icon, T = QDF.view.tick;
  var next = QDF.model.upNext(s);
  return '' +
    '<div class="now-empty" data-drop="now">' +
      '<div class="now-empty-title">Nothing in focus' +
        (r.idleSince ? ' for ' + T('dur', r.idleSince, 0, now) : '') + '</div>' +
      '<p class="now-empty-text">' + (next
        ? 'Up next is <b>' + U.esc(next.title) + '</b>.'
        : 'What are you working on?') + '</p>' +
      (next ? '<button type="button" class="btn btn-go" data-act="start" data-id="' + U.esc(next.id) + '">' + I('play') +
        '<span>Start up next</span></button>' : '') +
      '<form class="add-form" data-form="quick-start" autocomplete="off">' +
        '<input class="field" id="quick-start-input" name="title" maxlength="300" placeholder="' +
          (next ? 'Or type something else and press Enter to start it' : 'Type a task and press Enter to start it') +
          '" aria-label="Start a new task">' +
        '<button type="submit" class="btn">' + I('play') + '<span>Start</span></button>' +
      '</form>' +
      '<div class="drop-hint" aria-hidden="true">Drop to start now</div>' +
    '</div>';
};
