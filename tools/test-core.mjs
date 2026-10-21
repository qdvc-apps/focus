/* The domain model, the serialiser and the store, on a controlled clock.
   The property that matters most: export → import → export is byte-identical,
   which is what makes the YAML safe to keep, diff and hand-edit. */
import { load, suite, memoryStorage } from './harness.mjs';

const T0 = Date.parse('2026-10-21T09:00:00Z');
const MIN = 60000;
const t = suite('test-core');

function fresh() {
  const QDF = load();
  return { QDF, M: QDF.model, s: QDF.model.newState(T0) };
}

function ids(list) { return list.map(x => x.title); }

/* --------------------------------------------------------------- model */

t.check('add puts tasks at the end, or first when asked', () => {
  const { M, s } = fresh();
  M.add(s, 'a', '', null, T0);
  M.add(s, 'b', '', null, T0);
  M.add(s, 'c', '', { next: true }, T0);
  t.eq(ids(s.queue), ['c', 'a', 'b']);
  t.eq(M.add(s, '   ', '', null, T0), null, 'blank title is refused');
  t.eq(s.queue[0].title, 'c');
});

t.check('titles are tidied and notes keep their lines', () => {
  const { M, s } = fresh();
  const item = M.add(s, '  two   spaces\n', 'line 1\r\nline 2  \n\n', null, T0);
  t.eq(item.title, 'two spaces');
  t.eq(item.notes, 'line 1\nline 2');
});

t.check('start focuses a queued task and sends the current one to up next', () => {
  const { M, s } = fresh();
  const a = M.add(s, 'a', '', null, T0), b = M.add(s, 'b', '', null, T0);
  M.add(s, 'c', '', null, T0);
  M.start(s, a.id, T0);
  t.eq(s.current.title, 'a');
  t.eq(s.current.started, new Date(T0).toISOString());
  const r = M.start(s, b.id, T0 + 10 * MIN);
  t.eq(r.previous.title, 'a');
  t.eq(s.current.title, 'b');
  t.eq(ids(s.queue), ['a', 'c']);
  t.eq(s.queue[0].focusSeconds, 600, 'banked focus');
  t.eq(s.queue[0].focusedSince, undefined, 'no live stretch in the queue');
  t.eq(M.start(s, b.id, T0), null, 'starting the current task is a no-op');
});

t.check('finishAndNext logs the task and starts up next', () => {
  const { M, s } = fresh();
  const a = M.add(s, 'a', '', null, T0);
  M.add(s, 'b', '', null, T0);
  M.start(s, a.id, T0);
  const r = M.finishAndNext(s, T0 + 25 * MIN);
  t.eq(r.done.title, 'a');
  t.eq(r.next.title, 'b');
  t.eq(s.done[0].focusSeconds, 1500);
  t.eq(s.done[0].finished, new Date(T0 + 25 * MIN).toISOString());
  t.eq(M.span(s.done[0]), 1500);
  t.eq(s.current.title, 'b');
  t.eq(s.queue.length, 0);
  M.finishAndNext(s, T0 + 30 * MIN);
  t.eq(s.current, null, 'nothing left to start');
  t.eq(M.finishAndNext(s, T0), null, 'no current task is a no-op');
});

t.check('background lane: send, time, bring forward, finish', () => {
  const { M, s } = fresh();
  const build = M.add(s, 'build', '', null, T0);
  M.add(s, 'email', '', null, T0);
  M.start(s, build.id, T0);
  const r = M.toBackground(s, T0 + 5 * MIN);
  t.eq(r.sent.title, 'build');
  t.eq(r.next.title, 'email');
  t.eq(s.background[0].backgroundSince, new Date(T0 + 5 * MIN).toISOString());
  t.eq(M.backgroundStretch(s.background[0], T0 + 20 * MIN), 900);
  M.start(s, build.id, T0 + 20 * MIN);
  t.eq(s.current.title, 'build');
  t.eq(s.current.backgroundSeconds, 900);
  t.eq(s.current.focusSeconds, 300);
  t.eq(ids(s.queue), ['email'], 'email went back to up next');
  t.eq(s.queue[0].focusSeconds, 900);
  M.toBackground(s, T0 + 22 * MIN);
  t.eq(s.current.title, 'email');
  const done = M.finish(s, build.id, T0 + 30 * MIN);
  t.eq(done.backgroundSeconds, 900 + 480);
  t.eq(done.focusSeconds, 300 + 120);
  t.eq(s.background.length, 0);
  t.eq(s.current.title, 'email', 'finishing a background task leaves focus alone');
});

t.check('several tasks can run in the background at once', () => {
  const { M, s } = fresh();
  ['x', 'y', 'z'].forEach(n => M.add(s, n, '', null, T0));
  M.start(s, s.queue[0].id, T0);
  M.toBackground(s, T0 + MIN);
  M.toBackground(s, T0 + 2 * MIN);
  t.eq(ids(s.background), ['x', 'y']);
  t.eq(s.current.title, 'z');
  M.toBackground(s, T0 + 3 * MIN);
  t.eq(s.current, null, 'empty queue leaves nothing in focus');
  t.eq(ids(s.background), ['x', 'y', 'z']);
});

t.check('pause, swap and backgroundToQueue', () => {
  const { M, s } = fresh();
  ['a', 'b', 'c'].forEach(n => M.add(s, n, '', null, T0));
  M.start(s, s.queue[0].id, T0);
  M.swapWithNext(s, T0 + MIN);
  t.eq(s.current.title, 'b');
  t.eq(ids(s.queue), ['a', 'c']);
  M.pause(s, T0 + 2 * MIN, 'end');
  t.eq(s.current, null);
  t.eq(ids(s.queue), ['a', 'c', 'b']);
  M.start(s, s.queue[1].id, T0 + 3 * MIN);
  M.pause(s, T0 + 4 * MIN, 'front');
  t.eq(ids(s.queue), ['c', 'a', 'b']);
  M.start(s, s.queue[0].id, T0 + 5 * MIN);
  M.toBackground(s, T0 + 6 * MIN);
  const c = s.background[0];
  M.backgroundToQueue(s, c.id, T0 + 16 * MIN);
  t.eq(s.queue[0].title, 'c');
  t.eq(s.queue[0].backgroundSeconds, 600);
  t.eq(s.queue[0].backgroundSince, undefined);
});

t.check('move, makeNext and moveToLater', () => {
  const { M, s } = fresh();
  ['a', 'b', 'c', 'd'].forEach(n => M.add(s, n, '', null, T0));
  const id = n => s.queue.find(x => x.title === n).id;
  M.makeNext(s, id('c'));
  t.eq(ids(s.queue), ['c', 'a', 'b', 'd']);
  t.eq(M.makeNext(s, id('c')), null, 'already next');
  M.moveToLater(s, id('a'), null);
  t.eq(ids(s.queue), ['c', 'b', 'd', 'a'], 'to the end');
  M.moveToLater(s, id('a'), id('b'));
  t.eq(ids(s.queue), ['c', 'a', 'b', 'd'], 'before b');
  M.moveToLater(s, id('c'), id('a'));
  t.eq(ids(s.queue), ['a', 'c', 'b', 'd'], 'up next dropped above the first later task lands second');
  M.moveToLater(s, id('d'), id('a'));
  t.eq(ids(s.queue), ['a', 'd', 'c', 'b'], 'a later task never takes the up-next slot');
  M.move(s, id('b'), 99);
  t.eq(ids(s.queue), ['a', 'd', 'c', 'b']);
  const { M: M2, s: s2 } = fresh();
  const only = M2.add(s2, 'only', '', null, T0);
  t.eq(M2.moveToLater(s2, only.id, null), null, 'a lone task stays put');
});

t.check('remove, restore, clearDone, edit', () => {
  const { M, s } = fresh();
  ['a', 'b'].forEach(n => M.add(s, n, '', null, T0));
  M.start(s, s.queue[0].id, T0);
  M.finishAndNext(s, T0 + MIN);
  const a = s.done[0];
  M.restore(s, a.id);
  t.eq(s.queue[s.queue.length - 1].title, 'a');
  t.eq(s.queue[s.queue.length - 1].finished, undefined);
  t.eq(M.edit(s, a.id, { title: 'a2', notes: 'n' }).title, 'a2');
  t.eq(M.edit(s, a.id, { title: 'a2', notes: 'n' }), null, 'no change reports null');
  t.eq(M.edit(s, a.id, { title: '   ' }), null, 'blank title keeps the old one');
  M.remove(s, s.current.id);
  t.eq(s.current, null);
  M.start(s, a.id, T0 + 2 * MIN);
  M.finish(s, a.id, T0 + 3 * MIN);
  t.eq(M.clearDone(s), 1);
  t.eq(M.clearDone(s), null);
});

t.check('elapsed counts from first start, across stretches', () => {
  const { M, s } = fresh();
  const a = M.add(s, 'a', '', null, T0);
  M.add(s, 'b', '', null, T0);
  M.start(s, a.id, T0);
  M.swapWithNext(s, T0 + 10 * MIN);
  M.swapWithNext(s, T0 + 30 * MIN);
  t.eq(s.current.title, 'a');
  t.eq(M.elapsed(s.current, T0 + 40 * MIN), 2400);
  t.eq(M.stretch(s.current, T0 + 40 * MIN), 600);
  t.eq(M.focusTotal(s.current, T0 + 40 * MIN), 1200);
});

/* ----------------------------------------------------------- serialise */

function busyState(QDF) {
  const M = QDF.model, s = M.newState(T0);
  ['Write: notes', 'Run "build"', 'PR #12', 'true', '42', 'Café ✓'].forEach((n, k) =>
    M.add(s, n, k === 0 ? 'line 1\nline 2' : '', null, T0));
  M.start(s, s.queue[0].id, T0);
  M.toBackground(s, T0 + 5 * MIN);
  M.finishAndNext(s, T0 + 9 * MIN);
  M.start(s, s.background[0].id, T0 + 12 * MIN);
  return s;
}

t.check('export → import → export is byte-identical', () => {
  const QDF = load();
  const s = busyState(QDF);
  const now = T0 + 20 * MIN;
  const first = QDF.serialize.toYaml(s, now);
  const back = QDF.serialize.fromYaml(first, now);
  t.eq(back.warnings, []);
  const second = QDF.serialize.toYaml(back.state, now);
  t.ok(first === second, 'second export differs:\n' + second);
  t.ok(/^# QDVC Focus state/.test(first));
  t.ok(/\nformat: qdvc-focus\/1\n/.test(first));
});

t.check('import is forgiving about hand edits', () => {
  const QDF = load();
  const text = [
    'current:',
    '  title: Hand written',
    'queue:',
    '  - just a title',
    '  - id: dup',
    '    title: First',
    '    finished: 2026-10-21T08:00:00Z',
    '  - id: dup',
    '    title: Second',
    '  - id: has spaces',
    '    title: "   "',
    '    started: yesterday',
    'background:',
    '  - title: Waiting',
    'done:',
    '  - title: Old',
    '    focus_seconds: -5'
  ].join('\n');
  const now = T0;
  const r = QDF.serialize.fromYaml(text, now);
  const s = r.state;
  t.eq(s.current.title, 'Hand written');
  t.eq(s.current.focusedSince, new Date(now).toISOString(), 'a current task gets a live stretch');
  t.eq(s.queue.map(x => x.title), ['just a title', 'First', 'Second', 'Untitled task']);
  t.eq(s.queue[1].finished, undefined, 'finished dropped from a queued task');
  t.ok(s.queue[1].id !== s.queue[2].id, 'duplicate ids renamed');
  t.ok(/^[\w.:-]+$/.test(s.queue[3].id), 'unusable id replaced');
  t.eq(s.queue[3].started, undefined, 'unreadable time dropped');
  t.ok(r.warnings.some(w => /started/.test(w)), 'warned about the time');
  t.ok(s.background[0].backgroundSince, 'background task gets a stretch');
  t.eq(s.done[0].focusSeconds, 0);
  t.ok(s.done[0].finished);
});

t.check('import rejects things that are not a state', () => {
  const QDF = load();
  t.throws(() => QDF.serialize.fromYaml('', T0), /nothing to import/);
  t.throws(() => QDF.serialize.fromYaml('- a\n- b\n', T0), /does not look like/);
  t.throws(() => QDF.serialize.fromYaml('name: x\nage: 3\n', T0), /none of/);
  t.throws(() => QDF.serialize.fromYaml('format: other/1\n', T0), /Unrecognised format/);
  t.throws(() => QDF.serialize.fromYaml('format: qdvc-focus/2\n', T0), /newer version/);
  t.throws(() => QDF.serialize.fromYaml('current:\n  title: x\n   y: 1\n', T0), /Line 3/);
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
  t.eq(S.get().lastInteraction, new Date(T0 + MIN).toISOString());
  t.eq(S.undoLabel(), 'Add task');
  t.eq(S.commit('No-op', () => null), null);
  t.eq(S.undoLabel(), 'Add task', 'no-ops do not add undo steps');
  const before = S.get();
  clock.t += MIN;
  S.commit('Start', (s, now) => M.start(s, s.queue[0].id, now));
  t.ok(before.current === null, 'previous state object is untouched');
  t.eq(S.undo(), 'Start');
  t.eq(S.get().current, null);
  t.eq(S.get().queue.length, 1);
  t.eq(events, ['commit', 'commit', 'undo']);

  const reloaded = storeWith(storage, clock);
  t.eq(reloaded.store.get().queue.map(x => x.title), ['a'], 'persisted across loads');
});

t.check('store: touch counts as interaction without an undo step', () => {
  const storage = memoryStorage(), clock = { t: T0 };
  const QDF = storeWith(storage, clock);
  clock.t += 30 * MIN;
  QDF.store.touch();
  t.eq(QDF.model.idle(QDF.store.get(), clock.t), 0);
  t.eq(QDF.store.undoLabel(), null);
});

t.check('store: replace is undoable and unreadable saves are kept aside', () => {
  const storage = memoryStorage(), clock = { t: T0 };
  storage.setItem('qdvc-focus.v1', '{not json');
  const QDF = storeWith(storage, clock);
  t.ok(/could not be read/.test(QDF.store.takeNotice()));
  t.eq(storage.getItem('qdvc-focus.v1.unreadable'), '{not json');
  const other = QDF.model.newState(T0);
  QDF.model.add(other, 'imported', '', null, T0);
  QDF.store.replace(other, 'Import');
  t.eq(QDF.store.get().queue[0].title, 'imported');
  QDF.store.undo();
  t.eq(QDF.store.get().queue.length, 0);
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
