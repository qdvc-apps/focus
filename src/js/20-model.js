/* ==========================================================================
   20-model.js — the domain, as pure operations on a plain state object.

   State:
     created, lastInteraction   ISO times
     current                    the task in focus, or null
     queue                      tasks waiting; queue[0] is "up next"
     background                 tasks something else is working on (a build,
                                a render, an upload) while you do another
     done                       finished tasks, newest first

   Task:
     id, title, notes, created
     stretches   every period the task spent in focus or in the background,
                 oldest first: { kind: 'focus' | 'background', from, to }.
                 `to` is null for the one open stretch: the last stretch of
                 the current task (focus) or of a background task
                 (background). Queued and done tasks have no open stretch.
     finished    set only while the task is in `done`

   Everything else (when it started, totals, the live stretch) is derived
   from the stretches. The timeline is drawn from them too.

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
      stretches: []
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

  /* ---------------------------------------------------------- stretches */

  function openStretch(item) {
    var st = item.stretches, last = st[st.length - 1];
    return last && !last.to ? last : null;
  }

  function begin(item, kind, now) {
    item.stretches.push({ kind: kind, from: U.iso(now), to: null });
  }

  function end(item, now) {
    var open = openStretch(item);
    if (open) open.to = U.iso(now);
    return open;
  }

  function focus(s, item, now) {
    begin(item, 'focus', now);
    s.current = item;
  }

  /* Takes the current task out of focus and back into the queue, at the
     front (as up next) or at the end. */
  function suspend(s, now, where) {
    var c = s.current;
    if (!c) return null;
    end(c, now);
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
    end(loc.item, now);
    var previous = suspend(s, now, 'front');
    focus(s, loc.item, now);
    return { item: loc.item, from: loc.list, previous: previous };
  }

  function finish(s, id, now) {
    var loc = find(s, id);
    if (!loc || (loc.list !== 'current' && loc.list !== 'background')) return null;
    detach(s, loc);
    end(loc.item, now);
    loc.item.finished = U.iso(now);
    s.done.unshift(loc.item);
    return loc.item;
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
    end(c, now);
    begin(c, 'background', now);
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

  /* A background task whose machine has finished, but which you will deal
     with later, goes back to the queue as up next. */
  function backgroundToQueue(s, id, now) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'background') return null;
    detach(s, loc);
    end(loc.item, now);
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

  /* Reorder by dropping a task just before another (or at the end when
     `beforeId` is null). Dropping before the first task makes it up next. */
  function moveBefore(s, id, beforeId) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'queue' || id === beforeId) return null;
    var rest = s.queue.filter(function (x) { return x.id !== id; });
    var at = rest.length;
    if (beforeId) {
      for (var k = 0; k < rest.length; k++) if (rest[k].id === beforeId) { at = k; break; }
    }
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

  function duration(st, now) {
    var a = U.ms(st.from), b = st.to ? U.ms(st.to) : now;
    return a === null || b === null ? 0 : Math.max(0, Math.floor((b - a) / 1000));
  }

  function started(item) {
    return item.stretches.length ? item.stretches[0].from : null;
  }

  function elapsed(item, now) {
    var first = started(item);
    return first ? U.secondsSince(first, now) : 0;
  }

  function total(item, kind, now) {
    var sum = 0;
    item.stretches.forEach(function (st) { if (st.kind === kind) sum += duration(st, now); });
    return sum;
  }

  function focusTotal(item, now) { return total(item, 'focus', now); }
  function backgroundTotal(item, now) { return total(item, 'background', now); }

  /* The live stretch: how long since it came into focus (or went into the
     background) this time round. */
  function live(item, now) {
    var open = openStretch(item);
    return open ? duration(open, now) : 0;
  }

  /* Wall-clock time from first start to finish, for done tasks. */
  function span(item) {
    var a = U.ms(started(item)), b = U.ms(item.finished);
    return a !== null && b !== null ? Math.max(0, Math.floor((b - a) / 1000)) : 0;
  }

  function idle(s, now) {
    return U.secondsSince(s.lastInteraction, now);
  }

  function upNext(s) {
    return s.queue[0] || null;
  }

  return {
    newState: newState, newItem: newItem, find: find, openStretch: openStretch,
    add: add, addAndStart: addAndStart, edit: edit,
    start: start, finish: finish, finishAndNext: finishAndNext,
    toBackground: toBackground, pause: pause, swapWithNext: swapWithNext,
    backgroundToQueue: backgroundToQueue,
    move: move, makeNext: makeNext, moveBefore: moveBefore,
    remove: remove, restore: restore, clearDone: clearDone,
    duration: duration, started: started, elapsed: elapsed,
    focusTotal: focusTotal, backgroundTotal: backgroundTotal, live: live,
    span: span, idle: idle, upNext: upNext
  };
})();
