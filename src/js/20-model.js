/* ==========================================================================
   20-model.js — the domain, as pure operations on a plain state object.

   State:
     created, lastInteraction   ISO times
     active                     tasks running now, in the order they started;
                                any number can run in parallel
     foreground                 id of the active task you are attending to,
                                or null. A pointer, not history: changing it
                                leaves every stretch untouched.
     queue                      tasks waiting; queue[0] is "up next"
     done                       finished tasks, newest first

   Task:
     id, title, notes, created
     stretches   every period the task was running, oldest first:
                 { from, to }, with `to` null for the one still running.
                 An active task's last stretch is open; queued and done
                 tasks have none open. Stretches of different tasks may
                 overlap freely: that is what working in parallel means.
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
      active: [],
      foreground: null,
      queue: [],
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

  var LISTS = ['active', 'queue', 'done'];

  function find(s, id) {
    for (var n = 0; n < LISTS.length; n++) {
      var list = s[LISTS[n]];
      for (var k = 0; k < list.length; k++) {
        if (list[k].id === id) return { list: LISTS[n], index: k, item: list[k] };
      }
    }
    return null;
  }

  /* -------------------------------------------------------- foreground */

  function foreground(s) {
    if (!s.active.length) return null;
    for (var k = 0; k < s.active.length; k++) if (s.active[k].id === s.foreground) return s.active[k];
    return s.active[s.active.length - 1];
  }

  /* When the foreground task leaves, attention passes to the task started
     most recently among those still running. */
  function settleForeground(s) {
    var fg = foreground(s);
    s.foreground = fg ? fg.id : null;
  }

  function setForeground(s, id) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'active' || s.foreground === id) return null;
    s.foreground = id;
    return loc.item;
  }

  /* ---------------------------------------------------------- stretches */

  function openStretch(item) {
    var last = item.stretches[item.stretches.length - 1];
    return last && !last.to ? last : null;
  }

  /* Take a task off whatever list it is on and close its running stretch. */
  function detach(s, loc, now) {
    s[loc.list].splice(loc.index, 1);
    var open = openStretch(loc.item);
    if (open) open.to = U.iso(now);
    if (loc.list === 'active') settleForeground(s);
    return loc.item;
  }

  function run(s, item, now) {
    item.stretches.push({ from: U.iso(now), to: null });
    s.active.push(item);
    s.foreground = item.id;
    return item;
  }

  /* ------------------------------------------------------------ creating */

  function add(s, title, notes, opts, now) {
    if (!cleanTitle(title)) return null;
    var item = newItem(title, notes, now);
    if (opts && opts.next) s.queue.unshift(item);
    else s.queue.push(item);
    return item;
  }

  /* Creates a task and starts it at once, alongside anything running. */
  function addAndStart(s, title, notes, now) {
    if (!cleanTitle(title)) return null;
    return run(s, newItem(title, notes, now), now);
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

  /* ------------------------------------------------------------ running */

  /* Starts a queued task alongside whatever is already running, and puts
     it in the foreground. Nothing else stops. */
  function start(s, id, now) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'queue') return null;
    detach(s, loc, now);
    return run(s, loc.item, now);
  }

  function startNext(s, now) {
    return s.queue.length ? start(s, s.queue[0].id, now) : null;
  }

  function finish(s, id, now) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'active') return null;
    var item = detach(s, loc, now);
    item.finished = U.iso(now);
    s.done.unshift(item);
    return item;
  }

  /* "Move on": this task is done and up next starts in its place. */
  function finishAndNext(s, id, now) {
    var done = finish(s, id, now);
    if (!done) return null;
    return { done: done, next: startNext(s, now) };
  }

  /* Stop running a task without finishing it: back to the queue, at the
     front (as up next) or at the end. */
  function pause(s, id, now, where) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'active') return null;
    var item = detach(s, loc, now);
    if (where === 'end') s.queue.push(item);
    else s.queue.unshift(item);
    return item;
  }

  /* Pause this task and start up next instead. */
  function swapWithNext(s, id, now) {
    if (!s.queue.length) return null;
    var next = s.queue[0];
    var paused = pause(s, id, now, 'end');
    if (!paused) return null;
    s.queue.pop();
    s.queue.splice(1, 0, paused);
    var started = start(s, next.id, now);
    return { paused: paused, started: started };
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
    s[loc.list].splice(loc.index, 1);
    if (loc.list === 'active') settleForeground(s);
    return loc.item;
  }

  function restore(s, id) {
    var loc = find(s, id);
    if (!loc || loc.list !== 'done') return null;
    s.done.splice(loc.index, 1);
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

  /* Total time the task has been running, across all its stretches. */
  function total(item, now) {
    var sum = 0;
    item.stretches.forEach(function (st) { sum += duration(st, now); });
    return sum;
  }

  /* The live stretch: how long since it was last started. */
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
    foreground: foreground, setForeground: setForeground,
    add: add, addAndStart: addAndStart, edit: edit,
    start: start, startNext: startNext, finish: finish, finishAndNext: finishAndNext,
    pause: pause, swapWithNext: swapWithNext,
    move: move, makeNext: makeNext, moveBefore: moveBefore,
    remove: remove, restore: restore, clearDone: clearDone,
    duration: duration, started: started, elapsed: elapsed, total: total, live: live,
    span: span, idle: idle, upNext: upNext
  };
})();
