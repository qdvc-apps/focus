/* The domain model, the serialiser and the store, on a controlled clock.
   The property that matters most: export → import → export is byte-identical,
   which is what makes the YAML safe to keep, diff and hand-edit. */
import { load, suite, memoryStorage } from './harness.mjs';

const T0 = Date.parse('2026-10-21T09:00:00Z');
const MIN = 60000;
const iso = ms => new Date(ms).toISOString();
const t = suite('test-core');

function fresh() {
  const QDF = load();
  return { QDF, M: QDF.model, s: QDF.model.newState(T0) };
}

function titles(list) { return list.map(x => x.title); }
const byTitle = (s, n) => [...s.active, ...s.queue, ...s.done].find(x => x.title === n);

/* --------------------------------------------------------------- model */

t.check('add puts tasks at the end, or first when asked', () => {
  const { M, s } = fresh();
  M.add(s, 'a', '', null, T0);
  M.add(s, 'b', '', null, T0);
  M.add(s, 'c', '', { next: true }, T0);
  t.eq(titles(s.queue), ['c', 'a', 'b']);
  t.eq(M.add(s, '   ', '', null, T0), null, 'blank title is refused');
  t.eq(s.queue[0].stretches, []);
});

t.check('titles are tidied and notes keep their lines', () => {
  const { M, s } = fresh();
  const item = M.add(s, '  two   spaces\n', 'line 1\r\nline 2  \n\n', null, T0);
  t.eq(item.title, 'two spaces');
  t.eq(item.notes, 'line 1\nline 2');
});

t.check('starting runs tasks in parallel; nothing else stops', () => {
  const { M, s } = fresh();
  ['a', 'b', 'c'].forEach(n => M.add(s, n, '', null, T0));
  M.start(s, byTitle(s, 'a').id, T0);
  M.start(s, byTitle(s, 'b').id, T0 + 10 * MIN);
  t.eq(titles(s.active), ['a', 'b']);
  t.eq(byTitle(s, 'a').stretches, [{ from: iso(T0), to: null }], 'a is still running');
  t.eq(s.foreground, byTitle(s, 'b').id, 'the newly started task comes to the foreground');
  t.eq(M.start(s, byTitle(s, 'b').id, T0), null, 'starting a running task is a no-op');
  t.eq(titles(s.queue), ['c']);
});

t.check('the foreground is a pointer: switching it changes no history', () => {
  const { M, s } = fresh();
  ['a', 'b'].forEach(n => M.add(s, n, '', null, T0));
  M.start(s, s.queue[0].id, T0);
  M.start(s, s.queue[0].id, T0 + MIN);
  const before = JSON.stringify(s.active);
  t.ok(M.setForeground(s, byTitle(s, 'a').id));
  t.eq(s.foreground, byTitle(s, 'a').id);
  t.eq(JSON.stringify(s.active), before, 'stretches and order untouched');
  t.eq(M.setForeground(s, byTitle(s, 'a').id), null, 'already in the foreground');
  M.add(s, 'q', '', null, T0);
  t.eq(M.setForeground(s, byTitle(s, 'q').id), null, 'only running tasks can be in the foreground');
});

t.check('when the foreground task stops, the most recently started one takes over', () => {
  const { M, s } = fresh();
  ['a', 'b', 'c'].forEach(n => M.add(s, n, '', null, T0));
  ['a', 'b', 'c'].forEach((n, k) => M.start(s, byTitle(s, n).id, T0 + k * MIN));
  M.setForeground(s, byTitle(s, 'a').id);
  M.finish(s, byTitle(s, 'a').id, T0 + 5 * MIN);
  t.eq(s.foreground, byTitle(s, 'c').id);
  M.pause(s, byTitle(s, 'c').id, T0 + 6 * MIN, 'front');
  t.eq(s.foreground, byTitle(s, 'b').id);
  M.remove(s, byTitle(s, 'b').id);
  t.eq(s.foreground, null, 'nothing running, nothing in the foreground');
});

t.check('finishAndNext logs the task and starts up next alongside the rest', () => {
  const { M, s } = fresh();
  ['a', 'b', 'c'].forEach(n => M.add(s, n, '', null, T0));
  M.start(s, byTitle(s, 'a').id, T0);
  M.start(s, byTitle(s, 'b').id, T0);
  const r = M.finishAndNext(s, byTitle(s, 'b').id, T0 + 25 * MIN);
  t.eq(r.done.title, 'b');
  t.eq(r.next.title, 'c');
  t.eq(titles(s.active), ['a', 'c']);
  t.eq(s.done[0].finished, iso(T0 + 25 * MIN));
  t.eq(M.span(s.done[0]), 1500);
  t.eq(M.openStretch(s.done[0]), null);
  t.eq(M.finishAndNext(s, 'nope', T0), null);
});

t.check('pause and swap', () => {
  const { M, s } = fresh();
  ['a', 'b', 'c'].forEach(n => M.add(s, n, '', null, T0));
  M.start(s, byTitle(s, 'a').id, T0);
  const r = M.swapWithNext(s, byTitle(s, 'a').id, T0 + MIN);
  t.eq(r.paused.title, 'a');
  t.eq(r.started.title, 'b');
  t.eq(titles(s.active), ['b']);
  t.eq(titles(s.queue), ['a', 'c'], 'the paused task is up next');
  M.pause(s, byTitle(s, 'b').id, T0 + 2 * MIN, 'end');
  t.eq(titles(s.queue), ['a', 'c', 'b']);
  t.eq(byTitle(s, 'b').stretches, [{ from: iso(T0 + MIN), to: iso(T0 + 2 * MIN) }]);
  t.eq(M.swapWithNext(s, 'nope', T0), null);
});

t.check('move, makeNext and moveBefore', () => {
  const { M, s } = fresh();
  ['a', 'b', 'c', 'd'].forEach(n => M.add(s, n, '', null, T0));
  const id = n => byTitle(s, n).id;
  M.makeNext(s, id('c'));
  t.eq(titles(s.queue), ['c', 'a', 'b', 'd']);
  t.eq(M.makeNext(s, id('c')), null, 'already next');
  M.moveBefore(s, id('a'), null);
  t.eq(titles(s.queue), ['c', 'b', 'd', 'a'], 'to the end');
  M.moveBefore(s, id('a'), id('b'));
  t.eq(titles(s.queue), ['c', 'a', 'b', 'd'], 'before b');
  M.moveBefore(s, id('d'), id('c'));
  t.eq(titles(s.queue), ['d', 'c', 'a', 'b'], 'before the first becomes up next');
  t.eq(M.moveBefore(s, id('c'), id('a')), null, 'already there');
  t.eq(M.moveBefore(s, id('c'), id('c')), null, 'before itself');
});

t.check('remove, restore, clearDone, edit', () => {
  const { M, s } = fresh();
  ['a', 'b'].forEach(n => M.add(s, n, '', null, T0));
  M.start(s, byTitle(s, 'a').id, T0);
  M.finishAndNext(s, byTitle(s, 'a').id, T0 + MIN);
  const a = byTitle(s, 'a');
  M.restore(s, a.id);
  t.eq(s.queue[s.queue.length - 1].title, 'a');
  t.eq(a.finished, undefined);
  t.eq(a.stretches.length, 1, 'history is kept');
  t.eq(M.edit(s, a.id, { title: 'a2', notes: 'n' }).title, 'a2');
  t.eq(M.edit(s, a.id, { title: 'a2', notes: 'n' }), null, 'no change reports null');
  t.eq(M.edit(s, a.id, { title: '   ' }), null, 'a blank title keeps the old one');
  M.remove(s, byTitle(s, 'b').id);
  t.eq(s.active, []);
  M.start(s, a.id, T0 + 2 * MIN);
  M.finish(s, a.id, T0 + 3 * MIN);
  t.eq(M.clearDone(s), 1);
  t.eq(M.clearDone(s), null);
});

t.check('times: elapsed from first start, totals across stretches, the live stretch', () => {
  const { M, s } = fresh();
  ['a', 'b'].forEach(n => M.add(s, n, '', null, T0));
  const a = byTitle(s, 'a');
  M.start(s, a.id, T0);
  M.pause(s, a.id, T0 + 10 * MIN, 'front');
  M.start(s, a.id, T0 + 30 * MIN);
  t.eq(M.elapsed(a, T0 + 40 * MIN), 2400);
  t.eq(M.live(a, T0 + 40 * MIN), 600);
  t.eq(M.total(a, T0 + 40 * MIN), 1200);
});

/* ----------------------------------------------------------- serialise */

function busyState(QDF) {
  const M = QDF.model, s = M.newState(T0);
  ['Write: notes', 'Run "build"', 'PR #12', 'true', '42', 'Café ✓'].forEach((n, k) =>
    M.add(s, n, k === 0 ? 'line 1\nline 2' : '', null, T0));
  M.start(s, s.queue[0].id, T0);
  M.start(s, s.queue[0].id, T0 + 5 * MIN);
  M.finishAndNext(s, s.active[0].id, T0 + 9 * MIN);
  M.pause(s, s.active[0].id, T0 + 12 * MIN, 'end');
  M.setForeground(s, s.active[0].id);
  return s;
}

t.check('export → import → export is byte-identical', () => {
  const QDF = load();
  const s = busyState(QDF);
  const now = T0 + 20 * MIN;
  const first = QDF.serialize.toYaml(s, now);
  const back = QDF.serialize.fromYaml(first, now);
  t.eq(back.warnings, []);
  t.eq(back.state.foreground, s.foreground);
  const second = QDF.serialize.toYaml(back.state, now);
  t.ok(first === second, 'second export differs:\n' + second);
  t.ok(/\nformat: qdvc-focus\/3\n/.test(first));
  t.ok(/\n {6}- 2026-10-21T09:00:00\.000Z\/2026-10-21T09:09:00\.000Z\n/.test(first), 'closed stretch as an interval');
  t.ok(/\n {6}- [^\n]+\/\.\.\n/.test(first), 'running stretch ends in ..');
});

t.check('import is forgiving about hand edits', () => {
  const QDF = load();
  const text = [
    'foreground: ghost',
    'active:',
    '  - title: Hand written',
    '  - title: Also running',
    '    stretches:',
    '      - 2026-10-21T08:00:00Z/2026-10-21T08:30:00Z',
    'queue:',
    '  - just a title',
    '  - id: dup',
    '    title: First',
    '    finished: 2026-10-21T08:00:00Z',
    '  - id: dup',
    '    title: Second',
    '    stretches:',
    '      - 2026-10-21T08:10:00Z/2026-10-21T08:00:00Z',
    '      - 2026-10-21T07:00:00Z/2026-10-21T07:30:00Z',
    '      - from: 2026-10-21T07:20:00Z',
    '        to: 2026-10-21T07:40:00Z',
    '      - yesterday/today',
    '      - 42',
    '  - id: has spaces',
    '    title: "   "',
    'done:',
    '  - title: Old',
    '    stretches:',
    '      - 2026-10-21T06:00:00Z/..'
  ].join('\n');
  const now = T0;
  const r = QDF.serialize.fromYaml(text, now);
  const s = r.state;
  t.eq(titles(s.active), ['Hand written', 'Also running']);
  t.eq(s.active[0].stretches, [{ from: iso(now), to: null }], 'a running task gets a running stretch');
  t.eq(s.active[1].stretches.length, 2, 'a closed last stretch is followed by a running one');
  t.eq(s.foreground, s.active[1].id, 'an unknown foreground falls back to the latest started');
  t.ok(r.warnings.some(w => /foreground/.test(w)));
  t.eq(titles(s.queue), ['just a title', 'First', 'Second', 'Untitled task']);
  t.eq(s.queue[1].finished, undefined, 'finished dropped from a queued task');
  t.ok(s.queue[1].id !== s.queue[2].id, 'duplicate ids renamed');
  t.ok(/^[\w.:-]+$/.test(s.queue[3].id), 'unusable id replaced');
  t.eq(s.queue[2].stretches.map(x => [x.from.slice(11, 16), x.to.slice(11, 16)]),
    [['07:00', '07:20'], ['07:20', '07:40'], ['08:10', '08:10']], 'sorted, overlaps trimmed, reversed end clamped');
  t.ok(r.warnings.some(w => /unreadable time/.test(w)));
  t.ok(r.warnings.some(w => /not "start\/end"/.test(w)));
  t.eq(s.done[0].stretches[0].to, s.done[0].finished, 'a running stretch on a done task closes at finish');
  t.ok(r.warnings.some(w => /Closed a stretch/.test(w)));
});

t.check('import rejects things that are not a state, and earlier formats', () => {
  const QDF = load();
  t.throws(() => QDF.serialize.fromYaml('', T0), /nothing to import/);
  t.throws(() => QDF.serialize.fromYaml('- a\n- b\n', T0), /does not look like/);
  t.throws(() => QDF.serialize.fromYaml('name: x\nage: 3\n', T0), /none of/);
  t.throws(() => QDF.serialize.fromYaml('format: other/1\n', T0), /Unrecognised format/);
  t.throws(() => QDF.serialize.fromYaml('format: qdvc-focus/4\n', T0), /newer version/);
  t.throws(() => QDF.serialize.fromYaml('format: qdvc-focus/2\nqueue: []\n', T0), /earlier format/);
  t.throws(() => QDF.serialize.fromYaml('format: qdvc-focus/1\nqueue: []\n', T0), /earlier format/);
  t.throws(() => QDF.serialize.fromYaml('active:\n  - title: x\n   y: 1\n', T0), /Line 3/);
});

/* --------------------------------------------------------------- store */

function storeWith(storage, clock) {
  const QDF = load(storage);
  QDF.store.configure({ now: () => clock.t, storage });
  QDF.store.load();
  return QDF;
}

t.check('store: commit saves, stamps interaction and can be undone', () => {
  const storage = memoryStorage(), clock = { t: T0 };
  const QDF = storeWith(storage, clock);
  const S = QDF.store, M = QDF.model;
  const events = [];
  S.onChange(e => events.push(e.type));
  clock.t += MIN;
  S.commit('Add task', (s, now) => M.add(s, 'a', '', null, now));
  t.eq(S.get().lastInteraction, iso(T0 + MIN));
  t.eq(S.undoLabel(), 'Add task');
  t.eq(S.commit('No-op', () => null), null);
  t.eq(S.undoLabel(), 'Add task', 'no-ops do not add undo steps');
  const before = S.get();
  clock.t += MIN;
  S.commit('Start', (s, now) => M.start(s, s.queue[0].id, now));
  t.ok(before.active.length === 0, 'previous state object is untouched');
  t.eq(S.undo(), 'Start');
  t.eq(S.get().active, []);
  t.eq(S.get().queue[0].stretches, [], 'undo removes the stretch too');
  t.eq(events, ['commit', 'commit', 'undo']);
  const reloaded = storeWith(storage, clock);
  t.eq(reloaded.store.get().queue.map(x => x.title), ['a'], 'persisted across loads');
});

t.check('store: switching the foreground is saved but is not an undo step', () => {
  const storage = memoryStorage(), clock = { t: T0 };
  const QDF = storeWith(storage, clock);
  const S = QDF.store, M = QDF.model;
  S.commit('Add', (s, now) => { M.add(s, 'a', '', null, now); return M.add(s, 'b', '', null, now); });
  S.commit('Start a', (s, now) => M.start(s, s.queue[0].id, now));
  S.commit('Start b', (s, now) => M.start(s, s.queue[0].id, now));
  const a = S.get().active[0].id;
  clock.t += 5 * MIN;
  t.ok(S.quiet(s => M.setForeground(s, a)));
  t.eq(S.get().foreground, a);
  t.eq(S.undoLabel(), 'Start b', 'nothing added to the undo stack');
  t.eq(M.idle(S.get(), clock.t), 0, 'counts as an interaction');
  t.eq(storeWith(storage, clock).store.get().foreground, a, 'saved');
  t.eq(S.quiet(s => M.setForeground(s, a)), null, 'a no-op stays a no-op');
});

t.check('store: an unreadable or earlier-format save is kept aside, not lost', () => {
  const storage = memoryStorage(), clock = { t: T0 };
  storage.setItem('qdvc-focus.v1', JSON.stringify({ format: 'qdvc-focus/2', queue: [] }));
  const QDF = storeWith(storage, clock);
  t.ok(/could not be read/.test(QDF.store.takeNotice()));
  t.ok(/qdvc-focus\/2/.test(storage.getItem('qdvc-focus.v1.unreadable')));
  t.eq(QDF.store.get().queue, []);
});

t.check('store: touch counts as interaction without an undo step', () => {
  const storage = memoryStorage(), clock = { t: T0 };
  const QDF = storeWith(storage, clock);
  clock.t += 30 * MIN;
  QDF.store.touch();
  t.eq(QDF.model.idle(QDF.store.get(), clock.t), 0);
  t.eq(QDF.store.undoLabel(), null);
});

t.check('store: replace is undoable', () => {
  const storage = memoryStorage(), clock = { t: T0 };
  const QDF = storeWith(storage, clock);
  const other = QDF.model.newState(T0);
  QDF.model.add(other, 'imported', '', null, T0);
  QDF.store.replace(other, 'Import');
  t.eq(QDF.store.get().queue[0].title, 'imported');
  QDF.store.undo();
  t.eq(QDF.store.get().queue.length, 0);
});

t.check('store: resetAll removes every key the app owns, and only those', () => {
  const storage = memoryStorage(), clock = { t: T0 };
  storage.setItem('someone-else', 'keep me');
  const QDF = storeWith(storage, clock);
  QDF.store.commit('Add', (s, now) => QDF.model.add(s, 'a', '', null, now));
  storage.setItem('qdvc-focus.prefs.v1', '{"theme":"dark","timers":false}');
  storage.setItem('qdvc-focus.v1.unreadable', 'x');
  t.eq(QDF.store.usage().keys, 3);
  const events = [];
  QDF.store.onChange(e => events.push(e.type));
  t.ok(QDF.store.resetAll());
  t.eq(storage.keys(), ['someone-else']);
  t.eq(QDF.store.get().queue, []);
  t.eq(QDF.store.undoLabel(), null, 'no undo after a reset');
  t.eq(events, ['reset']);
});

t.check('store: a failing write is reported, not thrown', () => {
  const storage = memoryStorage(), clock = { t: T0 };
  const QDF = storeWith(storage, clock);
  storage.failWrites = true;
  QDF.store.commit('Add', (s, now) => QDF.model.add(s, 'a', '', null, now));
  t.ok(/Could not save/.test(QDF.store.info().error));
  storage.failWrites = false;
  QDF.store.commit('Add', (s, now) => QDF.model.add(s, 'b', '', null, now));
  t.eq(QDF.store.info().error, null);
});

t.check('store: undo depth is bounded', () => {
  const storage = memoryStorage(), clock = { t: T0 };
  const QDF = storeWith(storage, clock);
  for (let k = 0; k < QDF.APP.undoDepth + 10; k++) {
    QDF.store.commit('Add', (s, now) => QDF.model.add(s, 't' + k, '', null, now));
  }
  let n = 0;
  while (QDF.store.undo()) n++;
  t.eq(n, QDF.APP.undoDepth);
  t.eq(QDF.store.get().queue.length, 10);
});

t.done();
