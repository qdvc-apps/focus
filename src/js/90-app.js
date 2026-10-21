/* ==========================================================================
   90-app.js — the controller: boot, rendering, actions, drag and drop, and
   the once-a-second refresh of every running clock.

   Buttons declare what they do with data-act (and data-id for the task);
   one delegated click handler looks the name up in ACTIONS. Every change
   goes through QDF.store.commit, which re-renders via onChange.
   ========================================================================== */

QDF.app = (function () {
  var U = QDF.util, M = QDF.model, S = QDF.store, V = QDF.view, ui = QDF.ui;

  var prefs = { doneCollapsed: false };
  var drag = null;          /* { id, card } while a task is being dragged */
  var activeZone = null;
  var marker = null;
  var renderedDay = '';

  function $(id) {
    return document.getElementById(id);
  }

  function q(title) {
    return '\u201c' + title + '\u201d';
  }

  /* ------------------------------------------------------------- prefs */

  function loadPrefs() {
    try {
      var raw = window.localStorage.getItem(QDF.APP.prefsKey);
      if (raw) prefs.doneCollapsed = !!JSON.parse(raw).doneCollapsed;
    } catch (e) { /* defaults */ }
  }

  function savePrefs() {
    try { window.localStorage.setItem(QDF.APP.prefsKey, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ render */

  /* Re-rendering replaces markup, so remember what had focus and put it
     back: the same id, or the same action on the same task. */
  function captureFocus() {
    var el = document.activeElement;
    if (!el || el === document.body) return null;
    return {
      id: el.id || null,
      act: el.getAttribute && el.getAttribute('data-act'),
      dataId: el.getAttribute && el.getAttribute('data-id'),
      value: 'value' in el ? el.value : null,
      start: el.selectionStart, end: el.selectionEnd
    };
  }

  function restoreFocus(f) {
    if (!f || document.activeElement !== document.body) return;
    var el = f.id ? $(f.id) : null;
    if (!el && f.act) {
      el = document.querySelector('[data-act="' + f.act + '"]' + (f.dataId ? '[data-id="' + cssEscape(f.dataId) + '"]' : ''));
    }
    if (!el) return;
    el.focus();
    if (f.value !== null && 'value' in el && el.value === '' && f.value) {
      el.value = f.value;
      try { el.setSelectionRange(f.start, f.end); } catch (e) { /* not a text field */ }
    }
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, '\\$&');
  }

  function render() {
    var s = S.get(), now = S.now();
    var focus = captureFocus();
    $('now').innerHTML = V.now(s, now);
    $('queue-body').innerHTML = V.queue(s, now);
    $('queue-count').textContent = s.queue.length ? String(s.queue.length) : '';
    $('background').innerHTML = V.background(s, now);
    $('done').innerHTML = V.done(s, now, prefs);
    $('idle-slot').innerHTML = V.idle(s, now);
    $('statusbar').innerHTML = V.status(s, now, S.info());
    var label = S.undoLabel(), undoBtn = $('btn-undo');
    undoBtn.disabled = !label;
    undoBtn.title = label ? 'Undo: ' + label + ' (Ctrl+Z)' : 'Nothing to undo';
    renderedDay = U.dayKey(U.iso(now));
    restoreFocus(focus);
    tick();
  }

  function tick() {
    var s = S.get(), now = S.now();
    if (!s) return;
    var nodes = document.querySelectorAll('[data-tick]');
    for (var k = 0; k < nodes.length; k++) {
      var el = nodes[k];
      var from = el.getAttribute('data-from');
      var sec = (Number(el.getAttribute('data-base')) || 0) + (from ? U.secondsSince(from, now) : 0);
      var text = V.format(el.getAttribute('data-tick'), sec);
      if (el.textContent !== text) el.textContent = text;
    }
    var chip = $('idle-chip');
    if (chip) {
      var level = V.idleLevel(M.idle(s, now));
      if (chip.getAttribute('data-level') !== level) chip.setAttribute('data-level', level);
    }
    var title = s.current
      ? U.clock(M.elapsed(s.current, now)) + ' \u00b7 ' + s.current.title + ' \u2014 ' + QDF.APP.name
      : QDF.APP.name;
    if (document.title !== title) document.title = title;
    /* "Today" and "Yesterday" move at midnight. */
    if (!drag && renderedDay && U.dayKey(U.iso(now)) !== renderedDay) render();
  }

  /* ----------------------------------------------------------- actions */

  function commit(label, fn) {
    return S.commit(label, fn);
  }

  function undo() {
    var label = S.undo();
    ui.clearToasts();
    ui.toast(label ? 'Undone: ' + label + '.' : 'Nothing to undo.', { timeout: 2500 });
  }

  function focusAdd() {
    var input = $('add-input');
    input.focus();
    input.select();
  }

  function addFromInput(asNext) {
    var input = $('add-input');
    var title = input.value;
    if (!title.trim()) { input.focus(); return; }
    commit(asNext ? 'Add task as up next' : 'Add task', function (s, now) {
      return M.add(s, title, '', { next: asNext }, now);
    });
    input.value = '';
    input.focus();
  }

  function quickStart(form) {
    var input = form.querySelector('input[name="title"]');
    var title = input.value;
    if (!title.trim()) { input.focus(); return; }
    commit('Start task', function (s, now) { return M.addAndStart(s, title, '', now); });
  }

  function startTask(id) {
    var r = commit('Start task', function (s, now) { return M.start(s, id, now); });
    if (!r) return;
    if (r.from === 'background' || r.previous) {
      ui.toast((r.from === 'background' ? 'Brought ' + q(r.item.title) + ' forward' : 'Started ' + q(r.item.title)) +
        (r.previous ? '; ' + q(r.previous.title) + ' is up next.' : '.'), { undo: true });
    }
  }

  function finishTask(id) {
    var r = commit('Finish task', function (s, now) { return M.finish(s, id, now); });
    if (r) ui.toast('Done: ' + q(r.title) + '.', { undo: true });
  }

  function removeTask(id) {
    var r = commit('Remove task', function (s) { return M.remove(s, id); });
    if (r) ui.toast('Removed ' + q(r.title) + '.', { undo: true });
  }

  function pauseCurrent(where) {
    var r = commit(where === 'end' ? 'Move to end of queue' : 'Pause task', function (s, now) {
      return M.pause(s, now, where);
    });
    if (r) ui.toast(where === 'end'
      ? q(r.title) + ' is back at the end of the queue.'
      : 'Paused ' + q(r.title) + '; it is up next.', { undo: true });
  }

  function nowMenu(anchor) {
    var s = S.get(), c = s.current, next = M.upNext(s);
    if (!c) return;
    ui.menu(anchor, [
      { label: 'Edit…', icon: 'edit', onSelect: function () { QDF.editor.open(c.id); } },
      'separator',
      { label: next ? 'Swap with up next' : 'Swap with up next (queue is empty)', icon: 'swap', disabled: !next,
        onSelect: function () { startTask(next.id); } },
      { label: 'Pause, keep it up next', icon: 'pause', onSelect: function () { pauseCurrent('front'); } },
      { label: 'Back to the end of the queue', icon: 'queueEnd', onSelect: function () { pauseCurrent('end'); } },
      { label: 'Done, start nothing', icon: 'check', onSelect: function () { finishTask(c.id); } },
      'separator',
      { label: 'Remove task', icon: 'trash', danger: true, onSelect: function () { removeTask(c.id); } }
    ]);
  }

  function backgroundMenu(anchor, id) {
    var loc = M.find(S.get(), id);
    if (!loc) return;
    ui.menu(anchor, [
      { label: 'Bring forward', icon: 'forward', onSelect: function () { startTask(id); } },
      { label: 'Done', icon: 'check', onSelect: function () { finishTask(id); } },
      { label: 'Back to the queue as up next', icon: 'up', onSelect: function () {
          var r = commit('Move to queue', function (s, now) { return M.backgroundToQueue(s, id, now); });
          if (r) ui.toast(q(r.title) + ' is up next.', { undo: true });
        } },
      { label: 'Edit…', icon: 'edit', onSelect: function () { QDF.editor.open(id); } },
      'separator',
      { label: 'Remove task', icon: 'trash', danger: true, onSelect: function () { removeTask(id); } }
    ]);
  }

  var ACTIONS = {
    'done-next': function () {
      var r = commit('Finish task', function (s, now) { return M.finishAndNext(s, now); });
      if (r) ui.toast('Done: ' + q(r.done.title) + (r.next ? '. Now on ' + q(r.next.title) + '.' : '.'), { undo: true });
    },
    'to-background': function () {
      var r = commit('Send to background', function (s, now) { return M.toBackground(s, now); });
      if (r) ui.toast(q(r.sent.title) + ' is running in the background' +
        (r.next ? '. Now on ' + q(r.next.title) + '.' : '.'), { undo: true });
    },
    'start': function (el, id) { startTask(id); },
    'finish': function (el, id) { finishTask(id); },
    'remove': function (el, id) { removeTask(id); },
    'make-next': function (el, id) {
      commit('Reorder queue', function (s) { return M.makeNext(s, id); });
    },
    'edit': function (el, id) { QDF.editor.open(id); },
    'restore': function (el, id) {
      var r = commit('Restore task', function (s) { return M.restore(s, id); });
      if (r) ui.toast(q(r.title) + ' is back in the queue.', { undo: true });
    },
    'clear-done': function () {
      var n = commit('Clear done log', function (s) { return M.clearDone(s); });
      if (n) ui.toast('Cleared ' + U.plural(n, 'task') + ' from the done log.', { undo: true });
    },
    'toggle-done': function () {
      prefs.doneCollapsed = !prefs.doneCollapsed;
      savePrefs();
      render();
    },
    'check-in': function (el) {
      S.touch();
      var chip = $('idle-chip');
      if (chip) {
        chip.classList.add('is-pulsing');
        setTimeout(function () { var c = $('idle-chip'); if (c) c.classList.remove('is-pulsing'); }, 600);
      }
    },
    'now-menu': function (el) { nowMenu(el); },
    'bg-menu': function (el, id) { backgroundMenu(el, id); },
    'undo': function () { undo(); },
    'show-yaml': function () { QDF.transfer.showYaml(); },
    'export': function () { QDF.transfer.exportYaml(); },
    'import': function () { QDF.transfer.importDialog(); },
    'about': function () { QDF.about.show(); }
  };

  /* ------------------------------------------------------------ events */

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled || el.closest('#layer')) return;
    var fn = ACTIONS[el.getAttribute('data-act')];
    if (!fn) return;
    e.preventDefault();
    fn(el, el.getAttribute('data-id'), e);
  }

  function onDblClick(e) {
    if (e.target.closest('button, input, textarea, a')) return;
    var el = e.target.closest('[data-dbl-edit]');
    if (!el) return;
    if (window.getSelection) window.getSelection().removeAllRanges();
    QDF.editor.open(el.getAttribute('data-dbl-edit'));
  }

  function onSubmit(e) {
    var form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    var kind = form.getAttribute('data-form');
    if (kind === 'add') addFromInput(false);
    else if (kind === 'quick-start') quickStart(form);
  }

  /* ------------------------------------------------------ drag and drop */

  function zoneOf(e) {
    return e.target && e.target.closest ? e.target.closest('[data-drop]') : null;
  }

  function setZone(zone) {
    if (activeZone === zone) return;
    if (activeZone) activeZone.classList.remove('drop-active');
    activeZone = zone;
    if (zone) zone.classList.add('drop-active');
  }

  function getMarker() {
    if (!marker) {
      marker = document.createElement('li');
      marker.className = 'drop-marker';
      marker.setAttribute('aria-hidden', 'true');
    }
    return marker;
  }

  function dropMarker() {
    if (marker && marker.parentNode) marker.parentNode.removeChild(marker);
  }

  /* The marker takes no space, so placing it never moves the items it is
     measured against. */
  function placeMarker(list, y) {
    var items = Array.prototype.filter.call(list.querySelectorAll('.later-item'), function (li) {
      return !li.contains(drag.card);
    });
    var before = null;
    for (var k = 0; k < items.length; k++) {
      var r = items[k].getBoundingClientRect();
      if (y < r.top + r.height / 2) { before = items[k]; break; }
    }
    var m = getMarker();
    if (before) {
      if (m.nextSibling !== before || m.parentNode !== list) list.insertBefore(m, before);
      m.setAttribute('data-before', before.querySelector('[data-drag-id]').getAttribute('data-drag-id'));
    } else {
      if (list.lastChild !== m) list.appendChild(m);
      m.setAttribute('data-before', '');
    }
  }

  function onDragStart(e) {
    var card = e.target.closest && e.target.closest('[data-drag-id]');
    if (!card) return;
    drag = { id: card.getAttribute('data-drag-id'), card: card };
    ui.closeMenu();
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', card.querySelector('.task-title').textContent);
    } catch (err) { /* some browsers refuse custom data; the id is kept here anyway */ }
    /* After the browser has taken its snapshot for the drag image. */
    setTimeout(function () {
      if (!drag) return;
      card.classList.add('is-dragging');
      document.body.classList.add('dragging-task');
    }, 0);
  }

  function onDragOver(e) {
    if (!drag) {
      if (QDF.transfer.hasFiles(e) && !ui.isDialogOpen()) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('file-over');
      }
      return;
    }
    var zone = zoneOf(e);
    setZone(zone);
    if (!zone) { dropMarker(); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (zone.getAttribute('data-drop') === 'later') placeMarker(zone, e.clientY);
    else dropMarker();
  }

  function onDragLeave(e) {
    if (!e.relatedTarget) {
      document.body.classList.remove('file-over');
      if (drag) { setZone(null); dropMarker(); }
    }
  }

  function endDrag() {
    if (drag && drag.card) drag.card.classList.remove('is-dragging');
    document.body.classList.remove('dragging-task');
    setZone(null);
    dropMarker();
    drag = null;
  }

  function onDrop(e) {
    if (!drag) {
      document.body.classList.remove('file-over');
      if (!QDF.transfer.hasFiles(e) || ui.isDialogOpen()) return;
      e.preventDefault();
      var file = e.dataTransfer.files[0];
      U.readFile(file, function (err, text) {
        if (err) { ui.toast('Could not read ' + file.name + '.', { tone: 'error' }); return; }
        QDF.transfer.importDialog({ text: text, name: file.name });
      });
      return;
    }
    var zone = zoneOf(e);
    if (!zone) { endDrag(); return; }
    e.preventDefault();
    var id = drag.id;
    var kind = zone.getAttribute('data-drop');
    var before = marker && marker.parentNode ? (marker.getAttribute('data-before') || null) : null;
    endDrag();
    if (kind === 'now') startTask(id);
    else if (kind === 'next') commit('Reorder queue', function (s) { return M.makeNext(s, id); });
    else if (kind === 'later') commit('Reorder queue', function (s) { return M.moveToLater(s, id, before); });
  }

  /* ------------------------------------------------------------- boot */

  function bind() {
    document.addEventListener('click', onClick);
    document.addEventListener('dblclick', onDblClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('mousedown', ui.onDocumentPointer, true);
    document.addEventListener('keydown', QDF.keys.onKeyDown);
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', endDrag);
    window.addEventListener('resize', function () { ui.closeMenu(); });
    document.addEventListener('visibilitychange', tick);

    $('add-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        addFromInput(e.shiftKey);
      }
    });

    window.addEventListener('storage', function (e) {
      if (e.key !== QDF.APP.storageKey || drag) return;
      if (S.reloadFromStorage()) ui.toast('Updated with changes made in another tab.', { timeout: 3000 });
    });

    S.onChange(function (ev) {
      /* Any newer change makes an offered Undo refer to something else. */
      if (ev.type !== 'touch') ui.clearToasts();
      render();
    });
  }

  function boot() {
    loadPrefs();
    S.load();
    $('brand-mark').innerHTML = V.brandMark('bm-bar');
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (el) {
      el.outerHTML = QDF.icon(el.getAttribute('data-icon'));
    });
    bind();
    render();
    var notice = S.takeNotice();
    if (notice) ui.toast(notice, { tone: 'error', timeout: 15000 });
    setInterval(tick, 500);
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return {
    boot: boot, render: render, tick: tick, commit: commit, undo: undo, focusAdd: focusAdd,
    actions: ACTIONS
  };
})();
