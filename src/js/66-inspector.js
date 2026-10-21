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
  var status = {
    current: 'In focus',
    queue: loc.index === 0 ? 'Up next' : 'Queued, ' + ordinal(loc.index + 1),
    background: 'In background',
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
  var focusBanked = 0, bgBanked = 0;
  item.stretches.forEach(function (st) {
    if (!st.to) return;
    if (st.kind === 'focus') focusBanked += M.duration(st, now); else bgBanked += M.duration(st, now);
  });
  var first = M.started(item);
  var facts = '<dt>Added</dt><dd>' + when(item.created) + '</dd>';
  if (first) {
    facts += '<dt>First started</dt><dd>' + when(first) + '</dd>';
    facts += item.finished
      ? '<dt>Finished</dt><dd>' + when(item.finished) + '</dd><dt>Start to finish</dt><dd>' + U.esc(U.duration(M.span(item))) + '</dd>'
      : '<dt>Since first start</dt><dd>' + T('dur', first, 0, now) + '</dd>';
    facts += '<dt>Focused in all</dt><dd>' + (open && open.kind === 'focus' ? T('dur', open.from, focusBanked, now) : U.esc(U.duration(focusBanked))) + '</dd>';
    if (bgBanked || (open && open.kind === 'background')) {
      facts += '<dt>In background</dt><dd>' + (open && open.kind === 'background' ? T('dur', open.from, bgBanked, now) : U.esc(U.duration(bgBanked))) + '</dd>';
    }
  } else {
    facts += '<dt>Started</dt><dd class="dim">Not yet</dd>';
  }

  /* ---------------------------------------------------------- stretches */
  var stretches = item.stretches.map(function (st) {
    return '<li>' +
      '<span class="sw ' + (st.kind === 'focus' ? 'lc0' : 'sw-bg lc1') + '" title="' + (st.kind === 'focus' ? 'In focus' : 'In the background') + '"></span>' +
      '<span class="stretch-when">' + when(st.from) + '–' + (st.to ? U.esc(U.timeOfDay(st.to)) : 'now') +
        (st.kind === 'focus' ? '' : ' <span class="dim">background</span>') + '</span>' +
      '<span class="stretch-len">' + (st.to ? U.esc(U.duration(M.duration(st, now))) : T('durp', st.from, 0, now)) + '</span>' +
    '</li>';
  }).join('');

  /* ------------------------------------------------------------ actions */
  function act(name, icon, label, cls) {
    return '<button type="button" class="btn btn-sm btn-block' + (cls ? ' ' + cls : '') + '" data-act="' + name + '" data-id="' + eid + '">' +
      I(icon) + '<span>' + label + '</span></button>';
  }
  var actions = {
    current:
      act('done-next', 'check', M.upNext(s) ? 'Done, start next' : 'Done', 'btn-go') +
      act('to-background', 'background', 'Send to background') +
      act('pause-front', 'pause', 'Pause, keep it up next') +
      act('pause-end', 'queueEnd', 'Back to the end of the queue') +
      act('finish', 'check', 'Done, start nothing'),
    queue:
      act('start', 'play', 'Start now', 'btn-go') +
      (loc.index ? act('make-next', 'up', 'Do this next') : ''),
    background:
      act('start', 'forward', 'Bring forward', 'btn-primary') +
      act('finish', 'check', 'Done', 'btn-go') +
      act('bg-to-queue', 'up', 'Back to the queue as up next'),
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
