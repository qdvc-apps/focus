/* ==========================================================================
   90-app.js — the controller: boot, rendering, selection, drawers, actions,
   drag and drop, keeping "now" in view, and the twice-a-second refresh of
   every running clock.

   Buttons declare what they do with data-act (and data-id for the task);
   one delegated click handler looks the name up in ACTIONS. Cards carry
   data-select; clicking one selects it and opens the inspector. Every
   change goes through QDF.store.commit, which re-renders via onChange.
   ========================================================================== */

QDF.app = (function () {
  var U = QDF.util, M = QDF.model, S = QDF.store, V = QDF.view, ui = QDF.ui, P = QDF.prefs;

  var selectedId = null;
  var drag = null;          /* { id, card } while a task is being dragged */
  var activeZone = null;
  var marker = null;
  var renderedDay = '';
  var firstRender = true;
  var jumpPending = false;

  function $(id) {
    return document.getElementById(id);
  }

  function q(title) {
    return '\u201c' + title + '\u201d';
  }

  /* ---------------------------------------------------- keeping "now" */

  function scroller() { return $('timeline-scroll'); }
  function anchor() { return $('tl-now'); }

  /* Where the present sits in the viewport, so a re-render that adds a row
     above it (a task finished, say) can keep it exactly where it was. */
  function anchorPosition() {
    var el = anchor(), sc = scroller();
    if (!el || !sc) return null;
    var top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    return { top: top, visible: top > -el.offsetHeight && top < sc.clientHeight };
  }

  function jumpNow(smooth) {
    var el = anchor(), sc = scroller();
    if (!el || !sc) return;
    var top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    /* The now line sits low in the view: the running cards end just above
       it, and the queue starts just below. */
    var target = sc.scrollTop + top - Math.round(sc.clientHeight * 0.68);
    if (sc.scrollTo) sc.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' });
    else sc.scrollTop = target;
  }

  function jumpDay(key) {
    var el = $('tl-day-' + key), sc = scroller();
    if (!el || !sc) return;
    var top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    sc.scrollTo({ top: sc.scrollTop + top - 8, behavior: 'smooth' });
  }

  var jumpFrame = 0;
  function updateJump() {
    jumpFrame = 0;
    var btn = $('jump-now'), el = anchor(), sc = scroller();
    if (!btn || !el || !sc) return;
    var r = el.getBoundingClientRect(), b = sc.getBoundingClientRect();
    var below = r.top > b.bottom - 40, above = r.bottom < b.top + 40;
    btn.hidden = !(below || above);
    btn.setAttribute('data-dir', below ? 'down' : 'up');
  }

  function scheduleJumpUpdate() {
    if (!jumpFrame) jumpFrame = (window.requestAnimationFrame || setTimeout)(updateJump);
  }

  /* --------------------------------------------------------- render */

  /* Re-rendering replaces markup, so remember what had focus and put it
     back: the same id, or the same action on the same task. A field being
     typed in keeps what was typed. */
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
      el = document.querySelector('[data-act="' + f.act + '"]' + (f.dataId ? '[data-id="' + String(f.dataId).replace(/["\\]/g, '\\$&') + '"]' : ''));
    }
    if (!el) return;
    el.focus({ preventScroll: true });
    if (f.value !== null && 'value' in el && el.value !== f.value) {
      el.value = f.value;
      try { el.setSelectionRange(f.start, f.end); } catch (e) { /* not a text field */ }
    }
  }

  function applyDrawers() {
    var ws = $('workspace');
    var left = !!P.get('overview'), right = !!P.get('inspector');
    ws.classList.toggle('left-open', left);
    ws.classList.toggle('right-open', right);
    $('handle-left').setAttribute('aria-expanded', String(left));
    $('handle-right').setAttribute('aria-expanded', String(right));
    $('drawer-left').setAttribute('aria-hidden', String(!left));
    $('drawer-right').setAttribute('aria-hidden', String(!right));
  }

  function render() {
    var s = S.get(), now = S.now();
    if (selectedId && !M.find(s, selectedId)) selectedId = null;
    var focus = captureFocus();
    var before = firstRender ? null : anchorPosition();

    var tl = QDF.timeline.build(s, now);
    var tlEl = $('timeline');
    tlEl.style.setProperty('--graph-w', V.graphWidth(tl) + 'px');
    tlEl.innerHTML = V.timeline(tl, s, now, { selectedId: selectedId });
    $('overview').innerHTML = V.overview(s, now);
    $('inspector').innerHTML = V.inspector(s, now, selectedId);
    $('idle-slot').innerHTML = V.idle(s, now);

    var label = S.undoLabel(), undoBtn = $('btn-undo');
    undoBtn.disabled = !label;
    undoBtn.title = label ? 'Undo: ' + label + ' (Ctrl+Z)' : 'Nothing to undo';
    undoBtn.setAttribute('aria-label', undoBtn.title);
    renderedDay = U.dayKey(U.iso(now));

    if (firstRender || jumpPending) {
      jumpNow(false);
      firstRender = jumpPending = false;
    } else if (before && before.visible) {
      var after = anchorPosition();
      if (after) scroller().scrollTop += after.top - before.top;
    }
    restoreFocus(focus);
    tick();
    updateJump();
  }

  function tick() {
    var s = S.get(), now = S.now();
    if (!s) return;
    var nodes = document.querySelectorAll('[data-tick]');
    for (var k = 0; k < nodes.length; k++) {
      var el = nodes[k];
      var from = el.getAttribute('data-from');
      var sec = (Number(el.getAttribute('data-base')) || 0) + (from ? U.secondsSince(from, now) : 0);
      var text = V.format(el.getAttribute('data-tick'), sec, now);
      if (el.textContent !== text) el.textContent = text;
    }
    var chip = $('idle-chip');
    if (chip) {
      var level = V.idleLevel(M.idle(s, now));
      if (chip.getAttribute('data-level') !== level) chip.setAttribute('data-level', level);
    }
    var fg = M.foreground(s);
    var title = fg
      ? (P.get('timers') ? U.clock(M.elapsed(fg, now)) + ' \u00b7 ' : '') + fg.title + ' \u2014 ' + QDF.APP.name
      : QDF.APP.name;
    if (document.title !== title) document.title = title;
    /* "Today" and "Yesterday" move at midnight; a new minute moves the
       now line's label and the height hints, but those are cheap to leave
       until the next change. */
    if (!drag && renderedDay && U.dayKey(U.iso(now)) !== renderedDay) render();
  }

  /* -------------------------------------------------------- actions */

  function commit(label, fn) {
    return S.commit(label, fn);
  }

  function undo() {
    var label = S.undo();
    ui.clearToasts();
    ui.toast(label ? 'Undone: ' + label + '.' : 'Nothing to undo.', { timeout: 2500 });
  }

  function select(id) {
    if (id === selectedId && (!id || P.get('inspector'))) return;
    selectedId = id;
    if (id) P.set('inspector', true);
    render();
  }

  function focusAdd() {
    var input = $('add-input');
    if (!input) return;
    input.focus();
    input.select();
  }

  /* How the add box was submitted: 'end', 'next' (Shift) or 'start' (Ctrl). */
  function addFromInput(how) {
    var input = $('add-input');
    var title = input.value;
    if (!title.trim()) { input.focus(); return; }
    input.value = '';
    if (how === 'start') {
      commit('Start task', function (s, now) { return M.addAndStart(s, title, '', now); });
    } else {
      commit(how === 'next' ? 'Add task as up next' : 'Add task', function (s, now) {
        return M.add(s, title, '', { next: how === 'next' }, now);
      });
    }
    focusAdd();
  }

  function quickStart(form) {
    var input = form.querySelector('input[name="title"]');
    var title = input.value;
    if (!title.trim()) { input.focus(); return; }
    input.value = '';
    commit('Start task', function (s, now) { return M.addAndStart(s, title, '', now); });
  }

  function alongside(s, item) {
    var others = s.active.filter(function (x) { return x.id !== item.id; });
    return others.length ? ' alongside ' + (others.length === 1 ? q(others[0].title) : U.plural(others.length, 'other task')) : '';
  }

  function startTask(id) {
    var before = S.get();
    var r = commit('Start task', function (s, now) { return M.start(s, id, now); });
    if (r && before.active.length) ui.toast('Started ' + q(r.title) + alongside(S.get(), r) + '.', { undo: true });
  }

  function startNext() {
    var r = commit('Start up next', function (s, now) { return M.startNext(s, now); });
    if (r) ui.toast('Started ' + q(r.title) + alongside(S.get(), r) + '.', { undo: true });
  }

  function finishTask(id) {
    var r = commit('Finish task', function (s, now) { return M.finish(s, id, now); });
    if (r) ui.toast('Done: ' + q(r.title) + '.', { undo: true });
  }

  function finishAndNext(id) {
    var r = commit('Finish task', function (s, now) { return M.finishAndNext(s, id, now); });
    if (r) ui.toast('Done: ' + q(r.done.title) + (r.next ? '. Started ' + q(r.next.title) + '.' : '.'), { undo: true });
  }

  function removeTask(id) {
    var r = commit('Remove task', function (s) { return M.remove(s, id); });
    if (r) ui.toast('Removed ' + q(r.title) + '.', { undo: true });
  }

  function pauseTask(id, where) {
    var r = commit(where === 'end' ? 'Move to end of queue' : 'Pause task', function (s, now) {
      return M.pause(s, id, now, where);
    });
    if (r) ui.toast(where === 'end'
      ? 'Paused ' + q(r.title) + '; it is back at the end of the queue.'
      : 'Paused ' + q(r.title) + '; it is up next.', { undo: true });
  }

  function swapTask(id) {
    var r = commit('Swap with up next', function (s, now) { return M.swapWithNext(s, id, now); });
    if (r) ui.toast('Paused ' + q(r.paused.title) + ' and started ' + q(r.started.title) + '.', { undo: true });
  }

  /* Which running task is in the foreground is a pointer, not history: it
     is saved, but it is not an undo step and no stretch changes. */
  function bringForward(id) {
    S.quiet(function (s) { return M.setForeground(s, id); });
  }

  function clearDone() {
    var n = commit('Clear finished tasks', function (s) { return M.clearDone(s); });
    if (n) ui.toast('Cleared ' + U.plural(n, 'finished task') + ' from the timeline.', { undo: true });
  }

  function taskMenu(anchorEl, id) {
    var s = S.get(), loc = M.find(s, id), next = M.upNext(s);
    if (!loc || loc.list !== 'active') return;
    var isFg = M.foreground(s) === loc.item;
    var items = [
      { label: 'Show in inspector', icon: 'info', onSelect: function () { select(id); } },
      'separator'
    ];
    if (!isFg) items.push({ label: 'Bring to the foreground', icon: 'target', onSelect: function () { bringForward(id); } });
    items.push(
      { label: 'Done', icon: 'check', onSelect: function () { finishTask(id); } },
      { label: next ? 'Pause it and start up next' : 'Pause it and start up next (queue is empty)', icon: 'swap', disabled: !next,
        onSelect: function () { swapTask(id); } },
      { label: 'Pause, keep it up next', icon: 'pause', onSelect: function () { pauseTask(id, 'front'); } },
      { label: 'Pause, back to the end of the queue', icon: 'queueEnd', onSelect: function () { pauseTask(id, 'end'); } },
      'separator',
      { label: 'Remove task', icon: 'trash', danger: true, onSelect: function () { removeTask(id); } }
    );
    ui.menu(anchorEl, items);
  }

  function applyTimers() {
    var on = !!P.get('timers'), btn = $('btn-timers');
    if (!btn) return;
    /* The button is "Hide timers", pressed in while they are hidden. */
    btn.setAttribute('aria-pressed', String(!on));
    btn.title = on ? 'Hide timers (T)' : 'Show timers (T)';
  }

  function resetAll() {
    ui.closeDialog(true);
    S.resetAll();
    P.reset();
    selectedId = null;
    applyDrawers();
    applyTimers();
    jumpPending = true;
    render();
    ui.toast('Reset. Everything ' + QDF.APP.name + ' kept in this browser has been deleted.', { timeout: 6000 });
  }

  function foregroundId() {
    var fg = M.foreground(S.get());
    return fg ? fg.id : null;
  }

  var ACTIONS = {
    'done-next': function (el, id) { finishAndNext(id || foregroundId()); },
    'start-next': function () { startNext(); },
    'start': function (el, id) { startTask(id); },
    'finish': function (el, id) { finishTask(id); },
    'foreground': function (el, id) { bringForward(id); },
    'remove': function (el, id) { removeTask(id); },
    'make-next': function (el, id) {
      commit('Reorder queue', function (s) { return M.makeNext(s, id); });
    },
    'pause-front': function (el, id) { pauseTask(id, 'front'); },
    'pause-end': function (el, id) { pauseTask(id, 'end'); },
    'restore': function (el, id) {
      var r = commit('Restore task', function (s) { return M.restore(s, id); });
      if (r) ui.toast(q(r.title) + ' is back in the queue.', { undo: true });
    },
    'check-in': function () {
      S.touch();
      var chip = $('idle-chip');
      if (chip) {
        chip.classList.add('is-pulsing');
        setTimeout(function () { var c = $('idle-chip'); if (c) c.classList.remove('is-pulsing'); }, 600);
      }
    },
    'task-menu': function (el, id) { taskMenu(el, id); },
    'undo': function () { undo(); },
    'toggle-timers': function () { P.set('timers', !P.get('timers')); },
    'toggle-overview': function () { P.set('overview', !P.get('overview')); },
    'toggle-inspector': function () { P.set('inspector', !P.get('inspector')); },
    'jump-now': function () { jumpNow(true); },
    'jump-day': function (el) { jumpDay(el.getAttribute('data-day')); },
    'settings': function () { QDF.settings.show(); }
  };

  /* --------------------------------------------------------- events */

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (el && !el.disabled && !el.closest('#layer')) {
      var fn = ACTIONS[el.getAttribute('data-act')];
      if (fn) {
        e.preventDefault();
        fn(el, el.getAttribute('data-id'), e);
        return;
      }
    }
    if (e.target.closest('input, textarea, button, form, a, #layer')) return;
    var card = e.target.closest('[data-select]');
    if (card) select(card.getAttribute('data-select'));
  }

  function onDblClick(e) {
    if (e.target.closest('button, input, textarea, a')) return;
    var card = e.target.closest('[data-select]');
    if (!card) return;
    if (window.getSelection) window.getSelection().removeAllRanges();
    select(card.getAttribute('data-select'));
    var title = $('ins-title');
    if (title) { title.focus(); title.select(); }
  }

  function onSubmit(e) {
    var form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    var kind = form.getAttribute('data-form');
    if (kind === 'add') addFromInput('end');
    else if (kind === 'quick-start') quickStart(form);
  }

  /* Inspector fields save when they lose focus. */
  function onChange(e) {
    var el = e.target.closest && e.target.closest('[data-edit]');
    if (!el) return;
    var id = el.getAttribute('data-id'), field = el.getAttribute('data-edit');
    var fields = {};
    fields[field] = el.value;
    if (field === 'title' && !el.value.trim()) {
      var loc = M.find(S.get(), id);
      if (loc) el.value = loc.item.title;
      return;
    }
    commit('Edit task', function (s) { return M.edit(s, id, fields); });
  }

  function onKeyDownLocal(e) {
    var t = e.target;
    if (t.id === 'add-input' && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      addFromInput(e.ctrlKey || e.metaKey ? 'start' : e.shiftKey ? 'next' : 'end');
      return true;
    }
    if (t.getAttribute && t.getAttribute('data-edit')) {
      var field = t.getAttribute('data-edit');
      if (e.key === 'Enter' && (field === 'title' || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        t.blur();
        return true;
      }
    }
    if (e.key === 'Enter' && t.getAttribute && t.getAttribute('data-select') && !QDF.keys.isTyping(t)) {
      e.preventDefault();
      select(t.getAttribute('data-select'));
      return true;
    }
    return false;
  }

  /* ---------------------------------------------- drag and drop */

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
      marker = document.createElement('div');
      marker.className = 'drop-marker';
      marker.setAttribute('aria-hidden', 'true');
    }
    return marker;
  }

  function dropMarker() {
    if (marker && marker.parentNode) marker.parentNode.removeChild(marker);
  }

  /* The marker takes no space, so placing it never moves the rows it is
     measured against. */
  function placeMarker(zone, y) {
    var rows = Array.prototype.filter.call(zone.querySelectorAll('.tl-row.tl-future'), function (row) {
      return !row.contains(drag.card);
    });
    var before = null;
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k].getBoundingClientRect();
      if (y < r.top + r.height / 2) { before = rows[k]; break; }
    }
    var m = getMarker();
    var target = before || zone.querySelector('.tl-row.tl-add');
    if (m.nextSibling !== target || m.parentNode !== zone) zone.insertBefore(m, target);
    m.setAttribute('data-before', before ? before.getAttribute('data-row-id') : '');
  }

  function onDragStart(e) {
    var card = e.target.closest && e.target.closest('[data-drag-id]');
    if (!card) return;
    drag = { id: card.getAttribute('data-drag-id'), card: card };
    ui.closeMenu();
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', card.querySelector('.tl-title').textContent);
    } catch (err) { /* the id is kept here anyway */ }
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
    if (zone.getAttribute('data-drop') === 'future') placeMarker(zone, e.clientY);
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
    else if (kind === 'future') commit('Reorder queue', function (s) { return M.moveBefore(s, id, before); });
  }

  /* ------------------------------------------------------------ boot */

  function bind() {
    document.addEventListener('click', onClick);
    document.addEventListener('dblclick', onDblClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    document.addEventListener('mousedown', ui.onDocumentPointer, true);
    document.addEventListener('keydown', function (e) {
      if (!onKeyDownLocal(e)) QDF.keys.onKeyDown(e);
    });
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', endDrag);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('resize', function () { ui.closeMenu(); scheduleJumpUpdate(); });
    scroller().addEventListener('scroll', scheduleJumpUpdate, { passive: true });

    window.addEventListener('storage', function (e) {
      if (e.key !== QDF.APP.storageKey || drag) return;
      if (S.reloadFromStorage()) ui.toast('Updated with changes made in another tab.', { timeout: 3000 });
    });

    S.onChange(function (ev) {
      /* Any newer change makes an offered Undo refer to something else. */
      if (ev.type !== 'touch') ui.clearToasts();
      if (ev.type === 'replace' || ev.type === 'external') { selectedId = null; jumpPending = true; }
      render();
    });

    P.onChange(function (key) {
      if (key === 'timers' || key === 'reset') { applyTimers(); tick(); }
      if (key === 'overview' || key === 'inspector' || key === 'reset') {
        applyDrawers();
        /* The timeline column changes width as a drawer slides; check the
           jump button once it has settled. */
        setTimeout(updateJump, 300);
      }
    });
  }

  function boot() {
    S.load();
    $('brand-mark').innerHTML = V.brandMark('bm-bar');
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (el) {
      el.outerHTML = QDF.icon(el.getAttribute('data-icon'), el.className);
    });
    applyDrawers();
    applyTimers();
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
    boot: boot, render: render, tick: tick, commit: commit, undo: undo,
    focusAdd: focusAdd, select: select, clearDone: clearDone, resetAll: resetAll,
    jumpNow: jumpNow, actions: ACTIONS
  };
})();
