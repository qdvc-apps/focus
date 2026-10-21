/* ==========================================================================
   62-present.js — the present: a card for each running task, and what the
   now line shows when nothing is running.

   A running card spans the timeline from when the task started down to the
   now line, beside anything else that ran meanwhile. Its title sticks to
   the top of the view and its controls to the bottom, so a task that has
   been running for hours stays usable without scrolling. The foreground
   task gets the clock and the prominent controls; the others can be brought
   to the foreground with one click, which records nothing in the history.

   Elements with class "timer" are hidden when timers are switched off;
   "timer-alt" ones are shown instead.
   ========================================================================== */

QDF.view.running = function (sg, s, now, opts) {
  var U = QDF.util, M = QDF.model, I = QDF.icon, T = QDF.view.tick;
  var item = sg.item, id = U.esc(item.id), next = M.upNext(s), fg = opts.foreground;
  var open = sg.stretch;
  var banked = M.total(item, now) - M.live(item, now);

  var actions = fg
    ? '<button type="button" class="btn btn-go" data-act="done-next" data-id="' + id + '" id="btn-done-next">' + I('check') +
        '<span>' + (next ? 'Done, start next' : 'Done') + '</span></button>' +
      (next ? '<button type="button" class="btn" data-act="start-next" title="Start up next (' + U.esc(next.title) + ') alongside this">' +
        I('parallel') + '<span>Start next too</span></button>' : '')
    : '<button type="button" class="btn" data-act="foreground" data-id="' + id + '" title="Make this the task you are attending to. Nothing is recorded in the history.">' +
        I('target') + '<span class="narrow-hide">Foreground</span></button>' +
      '<button type="button" class="btn btn-go" data-act="finish" data-id="' + id + '">' + I('check') + '<span>Done</span></button>';

  return '' +
    '<div class="run-card' + (fg ? ' is-foreground' : '') + (opts.selected ? ' is-selected' : '') + '" style="' + opts.place + '" ' +
        (fg ? 'id="tl-present" ' : '') + 'data-select="' + id + '" data-drop="now" tabindex="0">' +
      '<div class="run-head">' +
        '<div class="eyebrow label"><span class="live-lamp' + (fg ? '' : ' is-dim') + '" aria-hidden="true"></span>' +
          (fg ? 'In the foreground' : 'Running alongside') + '</div>' +
        '<div class="run-title">' + opts.dot + U.esc(item.title) + '</div>' +
      '</div>' +
      (fg && item.notes ? '<div class="run-notes">' + U.esc(item.notes) + '</div>' : '') +
      '<div class="run-foot">' +
        (fg
          ? '<div class="clock-face timer"><div class="clock-label">Since started</div>' +
              '<div class="clock-digits">' + T('clock', M.started(item), 0, now) + '</div></div>' +
            '<dl class="pc-stats timer">' +
              '<dt>This stretch</dt><dd>' + T('durp', open.from, 0, now) + '</dd>' +
              '<dt>Running in all</dt><dd>' + T('dur', open.from, banked, now) + '</dd>' +
            '</dl>'
          : '<div class="run-time timer">Running for ' + T('durp', open.from, 0, now) + '</div>') +
        '<div class="run-time timer-alt">Started at ' + U.esc(U.timeOfDay(M.started(item))) + '</div>' +
        '<div class="run-actions">' + actions +
          '<button type="button" class="btn btn-icon" data-act="task-menu" data-id="' + id + '" aria-haspopup="menu" aria-expanded="false" aria-label="More actions" title="More actions">' +
            I('more') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="drop-hint" aria-hidden="true">Drop to start it alongside</div>' +
    '</div>';
};

QDF.view.nowEmpty = function (s, now, r) {
  var U = QDF.util, I = QDF.icon, T = QDF.view.tick;
  var next = QDF.model.upNext(s);
  return '' +
    '<div class="now-empty">' +
      '<div class="now-empty-title">Nothing running' +
        (r.idleSince ? '<span class="timer"> for ' + T('dur', r.idleSince, 0, now) + '</span>' : '') + '</div>' +
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
      '<div class="drop-hint" aria-hidden="true">Drop to start it</div>' +
    '</div>';
};
