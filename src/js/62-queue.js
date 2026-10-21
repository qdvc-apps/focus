/* ==========================================================================
   62-queue.js — the queue sidebar: the up-next tray and the "later" list.
   The add form above them is static markup in 10-shell.html, so typing is
   never interrupted by a re-render.

   Cards carry data-drag-id; the tray and the list carry data-drop. The
   controller (90-app.js) owns the drag-and-drop behaviour.
   ========================================================================== */

QDF.view.taskMeta = function (item, now) {
  var U = QDF.util, M = QDF.model, T = QDF.view.tick;
  var parts = [];
  if (item.started) {
    parts.push('Started ' + T('ago', item.started, 0, now));
    var focus = M.focusTotal(item, now);
    if (focus >= 60) parts.push(U.esc(U.duration(focus)) + ' focused');
  } else {
    parts.push('Added ' + T('ago', item.created, 0, now));
  }
  if (item.backgroundSeconds >= 60) parts.push(U.esc(U.duration(item.backgroundSeconds)) + ' in background');
  return parts.join('<span class="meta-dot" aria-hidden="true"></span>');
};

QDF.view.taskCard = function (item, now, isNext) {
  var U = QDF.util, I = QDF.icon;
  var id = U.esc(item.id);
  var note = U.firstLine(item.notes);
  function tool(icon, act, label) {
    return '<button type="button" class="tool" data-act="' + act + '" data-id="' + id + '" title="' + label +
      '" aria-label="' + label + ': ' + U.esc(item.title) + '">' + I(icon) + '</button>';
  }
  return '' +
    '<div class="task-card' + (isNext ? ' is-next' : '') + '" draggable="true" data-drag-id="' + id + '" data-dbl-edit="' + id + '">' +
      '<span class="grip" aria-hidden="true"></span>' +
      '<div class="task-body">' +
        '<div class="task-title">' + U.esc(item.title) + '</div>' +
        (note ? '<div class="task-note">' + U.esc(note) + '</div>' : '') +
        '<div class="task-meta">' + QDF.view.taskMeta(item, now) + '</div>' +
      '</div>' +
      '<div class="task-tools">' +
        tool('play', 'start', 'Start now') +
        (isNext ? '' : tool('up', 'make-next', 'Do this next')) +
        tool('edit', 'edit', 'Edit') +
        tool('trash', 'remove', 'Remove') +
      '</div>' +
    '</div>';
};

QDF.view.queue = function (s, now) {
  var U = QDF.util, V = QDF.view;
  var next = s.queue[0], later = s.queue.slice(1);
  return '' +
    '<div class="section-label">Up next</div>' +
    '<div class="tray" data-drop="next">' +
      (next
        ? V.taskCard(next, now, true)
        : '<div class="tray-empty">' + (s.queue.length ? '' : 'Drag a task here, or add one above, to line it up next') + '</div>') +
    '</div>' +
    '<div class="section-label">Later' + (later.length ? ' <span class="section-count">' + later.length + '</span>' : '') + '</div>' +
    '<ol class="later-list" data-drop="later">' +
      (later.length
        ? later.map(function (item) { return '<li class="later-item">' + V.taskCard(item, now, false) + '</li>'; }).join('')
        : '<li class="list-empty">' + (next
            ? 'Nothing else queued. Things you might get to after up next go here.'
            : 'The queue is empty.') + '</li>') +
    '</ol>';
};
