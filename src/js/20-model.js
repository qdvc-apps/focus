/* ==========================================================================
   20-model.js — the domain, as pure operations on a plain state object.

   State:
     created, lastInteraction   ISO times
     current                    the task in focus, or null
     queue                      tasks waiting; queue[0] is "up next"
     background                 tasks handed to something else (a build, a
                                render, an upload) while you work on another
     done                       finished tasks, newest first

   Task:
     id, title, notes, created
     started          first time it came into focus
     focusedSince     set only while it is `current`
     backgroundSince  set only while it is in `background`
     finished         set only while it is in `done`
     focusSeconds, backgroundSeconds
                      time banked from earlier stretches; the live stretch
                      is added on top when reading

   Every operation takes the state to change and `now` in milliseconds, and
   returns something truthy when it changed anything, or null when it did
   not. The store relies on that to decide whether there is anything to undo.
   ========================================================================== */

QDF.model = (function () {
  var U = QDF.util;

  function newState(now) {
    return {
      created: U.iso(now),
      lastInteraction: U.iso(now),
      current: null,
      queue: [],
      background: [],
      done: []
    };
  }

  function cleanTitle(title) {
    return String(title == null ? '' : title).replace(/\s+/g, ' ').trim();
  }

  function cleanNotes(notes) {
    return String(notes == null ? '' : notes).replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  }

  function newItem(title, notes, now) {
    return {
      id: U.uid(now),
      title: cleanTitle(title) || 'Untitled task',
      notes: cleanNotes(notes),
      created: U.iso(now),
      focusSeconds: 0,
      backgroundSeconds: 0
    };
  }

  var LISTS = ['queue', 'background', 'done'];

  function find(s, id) {
    if (s.current && s.current.id === id) return { list: 'current', index: 0, item: s.current };
    for (var n = 0; n < LISTS.length; n++) {
      var list = s[LISTS[n]];
      for (var k = 0; k < list.length; k++) {
        if (list[k].id === id) return { list: LISTS[n], index: k, item: list[k] };
      }
    }
    return null;
  }

  function detach(s, loc) {
    if (loc.list === 'current') s.current = null;
    else s[loc.list].splice(loc.index, 1);
  }

  function bankFocus(item, now) {
    if (item.focusedSince) {
      item.focusSeconds = (item.focusSeconds || 0) + U.secondsSince(item.focusedSince, now);
      delete item.focusedSince;
    }
  }

  function bankBackground(item, now) {
    if (item.backgroundSince) {
      item.backgroundSeconds = (item.backgroundSeconds || 0) + U.secondsSince(item.backgroundSince, now);
      delete item.backgroundSince;
    }
  }

  function focus(s, item, now) {
    if (!item.started) item.started = U.iso(now);
    item.focusedSince = U.iso(now);
    s.current = item;
  }

  /* Takes the current task out of focus and puts it back in the queue,
     at the front (as up next) or at the end. */
  function suspend(s, now, where) {
    var c = s.current;
    if (!c) return null;
    bankFocus(c, now);
    s.current = null;
    if (where === 'end') s.queue.push(c);
    else s.queue.unshift(c);
    return c;
  }

  /* ------------------------------------------------------------ creating */

  function add(s, title, notes, opts, now) {
    if (!cleanTitle(title)) return null;
    var item = newItem(title, notes, now);
    if (opts && opts.next) s.queue.unshift(item);
    else s.queue.push(item);
    return item;
  }

  /* Creates a task and focuses it at once. Whatever was current becomes up
     next, so nothing is lost. */
  function addAndStart(s, title, notes, now) {
    if (!cleanTitle(title)) return null;
    var item = newItem(title, notes, now);
    var previous = suspend(s, now, 'front');
    focus(s, item, now);
    return { item: item, previous: previous };
  }

  function edit(s, id, fields) {
    var loc = find(s, id);
    if (!loc) return null;
    var item = loc.item, changed = false;
    if (fields.title !== undefined) {
      var t = cleanTitle(fields.title);
      if (t && t !== item.title) { item.title = t; changed = true; }
    }
    if (fields.notes !== undefined) {
      var n = cleanNotes(fields.notes);
      if (n !== (item.notes || '')) { item.notes = n; changed = true; }
    }
    return changed ? item : null;
  }

  /* ----------------------------------------------------------- focusing */

  /* Brings a queued or background task into focus. The task that was in
     focus goes back to the front of the queue. */
  function start(s, id, now) {
    var loc = find(s, id);
    if (!loc || loc.list === 'current' || loc.list === 'done') return null;
    detach(s, loc);
    bankBackground(loc.item, now);
    var previous = suspend(s, now, 'front');
    focus(s, loc.item, now);
    return { item: loc.item, from: loc.list, previous: previous };
  }

  function finish(s, id, now) {
    var loc = find(s, id);
    if (!loc || (loc.list !== 'current' && loc.list !== 'background')) return null;
    detach(s, loc);
    var item = loc.item;
    bankFocus(item, now);
    bankBackground(item, now);
    if (!item.started) item.started = U.iso(now);
    item.finished = U.iso(now);
    s.done.unshift(item);
    return item;
  }

  /* "Move on": the current task is done and up next comes into focus. */
  function finishAndNext(s, now) {
    if (!s.current) return null;
    var done = finish(s, s.current.id, now);
    var next = s.queue.length ? start(s, s.queue[0].id, now).item : null;
    return { done: done, next: next };
  }

  /* The current task carries on without you; up next comes into focus. */
  function toBackground(s, now) {
    var c = s.current;
    if (!c) return null;
    bankFocus(c, now);
    c.backgroundSince = U.iso(now);
    s.background.push(c);
    s.current = null;
    var next = s.queue.length ? start(s, s.queue[0].id, now).item : null;
    return { sent: c, next: next };
  }

  /* Out of focus, back to the queue; nothing else is started. */
  function pause(s, now, where) {
    return suspend(s, now, where === 'end' ? 'end' : 'front');
  }

  function swapWithNext(s, now) {
    if (!s.current || !s.queue.length) return null;
    return start(s, s.queue[0].id, now);
  }

  /* A background task whose machine has finished but which you will deal
     with later goes back to the queue as up next. */
  function backgroundToQueue(s, id, now) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'background') return null;
    detach(s, loc);
    bankBackground(loc.item, now);
    s.queue.unshift(loc.item);
    return loc.item;
  }

  /* -------------------------------------------------------------- order */

  function move(s, id, index) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'queue') return null;
    var to = Math.max(0, Math.min(index, s.queue.length - 1));
    if (to === loc.index) return null;
    s.queue.splice(loc.index, 1);
    s.queue.splice(to, 0, loc.item);
    return loc.item;
  }

  function makeNext(s, id) {
    return move(s, id, 0);
  }

  /* Drop into the "later" list, just before `beforeId` (or at the end when
     it is null). A task dropped there never lands in the up-next slot unless
     it is the only one queued. */
  function moveToLater(s, id, beforeId) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'queue') return null;
    var rest = s.queue.filter(function (x) { return x.id !== id; });
    var at = rest.length;
    if (beforeId) {
      for (var k = 0; k < rest.length; k++) if (rest[k].id === beforeId) { at = k; break; }
    }
    at = Math.max(at, Math.min(1, rest.length));
    if (at === loc.index) return null;
    rest.splice(at, 0, loc.item);
    s.queue = rest;
    return loc.item;
  }

  /* ---------------------------------------------------------- removing */

  function remove(s, id) {
    var loc = find(s, id);
    if (!loc) return null;
    detach(s, loc);
    return loc.item;
  }

  function restore(s, id) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'done') return null;
    detach(s, loc);
    delete loc.item.finished;
    s.queue.push(loc.item);
    return loc.item;
  }

  function clearDone(s) {
    var n = s.done.length;
    if (!n) return null;
    s.done = [];
    return n;
  }

  /* ------------------------------------------------------------- times */

  function elapsed(item, now) {
    return item.started ? U.secondsSince(item.started, now) : 0;
  }

  function stretch(item, now) {
    return item.focusedSince ? U.secondsSince(item.focusedSince, now) : 0;
  }

  function focusTotal(item, now) {
    return (item.focusSeconds || 0) + stretch(item, now);
  }

  function backgroundStretch(item, now) {
    return item.backgroundSince ? U.secondsSince(item.backgroundSince, now) : 0;
  }

  function backgroundTotal(item, now) {
    return (item.backgroundSeconds || 0) + backgroundStretch(item, now);
  }

  /* Wall-clock time from first start to finish, for done tasks. */
  function span(item) {
    var a = U.ms(item.started), b = U.ms(item.finished);
    return a !== null && b !== null ? Math.max(0, Math.floor((b - a) / 1000)) : 0;
  }

  function idle(s, now) {
    return U.secondsSince(s.lastInteraction, now);
  }

  function upNext(s) {
    return s.queue[0] || null;
  }

  return {
    newState: newState, newItem: newItem, find: find,
    add: add, addAndStart: addAndStart, edit: edit,
    start: start, finish: finish, finishAndNext: finishAndNext,
    toBackground: toBackground, pause: pause, swapWithNext: swapWithNext,
    backgroundToQueue: backgroundToQueue,
    move: move, makeNext: makeNext, moveToLater: moveToLater,
    remove: remove, restore: restore, clearDone: clearDone,
    elapsed: elapsed, stretch: stretch, focusTotal: focusTotal,
    backgroundStretch: backgroundStretch, backgroundTotal: backgroundTotal,
    span: span, idle: idle, upNext: upNext
  };
})();
