/* ==========================================================================
   66-inspector.js — the right drawer: everything about the selected task.
   Its title and notes are edited in place and saved when the field loses
   focus (or on Enter in the title, Ctrl+Enter in the notes).
   ========================================================================== */

QDF.view.inspector = function (s, now, id) {
  var U = QDF.util, M = QDF.model, I = QDF.icon, T = QDF.view.tick;
  var head = '<div class="dw-head"><span class="label">Inspector</span>';
  var loc = id ? M.find(s, id) : null;

  if (!loc) {
    return '<div class="dw">' + head + '</div>' +
      '<div class="dw-empty">Click a task on the timeline to see its details, its history and what you can do with it.</div></div>';
  }

  var item = loc.item, eid = U.esc(item.id);
  var open = M.openStretch(item);
  var isFg = loc.list === 'active' && M.foreground(s) === item;
  var status = {
    active: isFg ? 'In the foreground' : 'Running alongside',
    queue: loc.index === 0 ? 'Up next' : 'Queued, ' + ordinal(loc.index + 1),
    done: 'Done'
  }[loc.list];

  function ordinal(n) {
    var sfx = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    return n + sfx;
  }

  function when(iso) {
    var day = U.dayKey(iso) === U.dayKey(U.iso(now)) ? '' : U.dayLabel(iso, now) + ', ';
    return U.esc(day + U.timeOfDay(iso));
  }

  /* -------------------------------------------------------------- facts */
  var banked = M.total(item, now) - M.live(item, now);
  var first = M.started(item);
  var facts = '<dt>Added</dt><dd>' + when(item.created) + '</dd>';
  if (first) {
    facts += '<dt>First started</dt><dd>' + when(first) + '</dd>';
    facts += item.finished
      ? '<dt>Finished</dt><dd>' + when(item.finished) + '</dd><dt>Start to finish</dt><dd>' + U.esc(U.duration(M.span(item))) + '</dd>'
      : '<dt class="timer">Since first start</dt><dd class="timer">' + T('dur', first, 0, now) + '</dd>';
    facts += open
      ? '<dt class="timer">Running in all</dt><dd class="timer">' + T('dur', open.from, banked, now) + '</dd>'
      : '<dt>Running in all</dt><dd>' + U.esc(U.duration(banked)) + '</dd>';
    facts += '<dt>Stretches</dt><dd>' + item.stretches.length + '</dd>';
  } else {
    facts += '<dt>Started</dt><dd class="dim">Not yet</dd>';
  }

  /* ------------------------------------------------------------ history */
  var stretches = item.stretches.map(function (st) {
    return '<li>' +
      '<span class="sw lc0" aria-hidden="true"></span>' +
      '<span class="stretch-when">' + when(st.from) + '–' + (st.to ? U.esc(U.timeOfDay(st.to)) : 'now') + '</span>' +
      '<span class="stretch-len">' + (st.to ? U.esc(U.duration(M.duration(st, now))) : '<span class="timer">' + T('durp', st.from, 0, now) + '</span>') + '</span>' +
    '</li>';
  }).join('');

  /* ------------------------------------------------------------ actions */
  function act(name, icon, label, cls) {
    return '<button type="button" class="btn btn-sm btn-block' + (cls ? ' ' + cls : '') + '" data-act="' + name + '" data-id="' + eid + '">' +
      I(icon) + '<span>' + label + '</span></button>';
  }
  var next = M.upNext(s);
  var actions = {
    active:
      (isFg ? '' : act('foreground', 'target', 'Bring to the foreground', 'btn-primary')) +
      (isFg && next ? act('done-next', 'check', 'Done, start next', 'btn-go') : '') +
      act('finish', 'check', 'Done', isFg && next ? '' : 'btn-go') +
      (isFg && next ? act('start-next', 'parallel', 'Start up next alongside') : '') +
      act('pause-front', 'pause', 'Pause, keep it up next') +
      act('pause-end', 'queueEnd', 'Pause, back to the end of the queue'),
    queue:
      act('start', 'play', 'Start now, alongside anything running', 'btn-go') +
      (loc.index ? act('make-next', 'up', 'Do this next') : ''),
    done:
      act('restore', 'restore', 'Back to the queue')
  }[loc.list] + act('remove', 'trash', loc.list === 'done' ? 'Remove from history' : 'Remove task');

  return '<div class="dw">' + head + '<span class="chip' + (loc.list === 'done' ? ' chip-done' : '') + '">' + U.esc(status) + '</span></div>' +
    '<div class="ins-body">' +
      '<input class="field ins-title" id="ins-title" data-edit="title" data-id="' + eid + '" maxlength="300" value="' + U.esc(item.title) + '" aria-label="Title">' +
      '<textarea class="field field-area" id="ins-notes" data-edit="notes" data-id="' + eid + '" rows="5" placeholder="Notes: links, commands, where you left off…" aria-label="Notes">' +
        U.esc(item.notes || '') + '</textarea>' +
      '<div class="ins-hint">Saved when you click away. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> saves notes.</div>' +
    '</div>' +
    '<section class="dw-section"><div class="label">Times</div><dl class="facts">' + facts + '</dl></section>' +
    (stretches ? '<section class="dw-section"><div class="label">History</div><ol class="stretch-list">' + stretches + '</ol></section>' : '') +
    '<section class="dw-section"><div class="label">Actions</div><div class="ins-actions">' + actions + '</div></section>' +
  '</div>';
};
