/* The timeline layout engine: row order, lanes, forks and merges, gaps,
   day breaks, line styles and height hints. These are the rules that make
   the graph read like a Git history, so they are pinned down here. */
import { load, suite } from './harness.mjs';

const T0 = Date.parse('2026-10-21T09:00:00Z');
const MIN = 60000;
const t = suite('test-timeline');
const QDF = load();
const M = QDF.model, TL = QDF.timeline;

/* A compact picture of the rows: type, title, lane, and graph details. */
function sketch(tl) {
  return tl.rows.filter(r => r.type !== 'day').map(r => {
    let s = r.type + (r.item ? ':' + r.item.title : '') + '@' + r.lane;
    if (r.mergeLane) s += ' merge' + r.mergeLane;
    if (r.endLanes && r.endLanes.length) s += ' end' + r.endLanes.join(',');
    if (r.outcome) s += ' ' + r.outcome;
    return s;
  });
}

function morning() {
  let now = T0;
  const s = M.newState(now);
  ['Triage', 'Docker', 'Plan', 'Review', 'Vendor'].forEach(n => M.add(s, n, '', null, now));
  M.start(s, s.queue[0].id, now); now += 35 * MIN;
  M.finishAndNext(s, now); now += 15 * MIN;          /* Docker in focus */
  M.toBackground(s, now); now += 20 * MIN;           /* Docker builds; Plan in focus */
  M.toBackground(s, now); now += 10 * MIN;           /* Plan in background; Review in focus */
  M.finish(s, s.background[0].id, now); now += 5 * MIN;   /* Docker finished in background */
  M.start(s, s.background[0].id, now); now += 3 * MIN;    /* Plan brought forward */
  return { s, now };
}

t.check('a morning reads like a Git graph', () => {
  const { s, now } = morning();
  const tl = TL.build(s, now);
  t.eq(sketch(tl), [
    'focus:Triage@0 done',
    'focus:Docker@0 background',
    'bg:Docker@1',
    'focus:Plan@0 background',
    'bg:Plan@2',
    'focus:Review@0 paused',
    'bgEnd:Docker@1 done',
    'present:Plan@0 merge2',
    'now@0',
    'future:Review@0',
    'future:Vendor@0',
    'add@0'
  ]);
  t.eq(tl.lanes, 3);
});

t.check('lanes in and out follow the branches', () => {
  const { s, now } = morning();
  const rows = TL.build(s, now).rows.filter(r => r.type !== 'day');
  const by = k => rows[k];
  t.eq([by(2).lanesIn, by(2).lanesOut], [[], [1]], 'fork opens lane 1');
  t.eq([by(4).lanesIn, by(4).lanesOut], [[1], [1, 2]], 'second fork takes lane 2');
  t.eq([by(6).lanesIn, by(6).lanesOut], [[1, 2], [2]], 'Docker ends, lane 1 closes');
  t.eq([by(7).lanesIn, by(7).lanesOut], [[2], []], 'Plan merges back into its focus');
  t.eq(by(8).endLanes, [], 'nothing left running at now');
});

t.check('running background work carries its lane to now, and lanes are reused', () => {
  let now = T0;
  const s = M.newState(now);
  ['a', 'b', 'c', 'd'].forEach(n => M.add(s, n, '', null, now));
  M.start(s, s.queue[0].id, now); now += MIN;
  M.toBackground(s, now); now += MIN;          /* a running */
  M.toBackground(s, now); now += MIN;          /* b running */
  M.finish(s, s.background[0].id, now); now += MIN;   /* a done: lane 1 free */
  M.toBackground(s, now); now += MIN;          /* c running: reuses lane 1 */
  const rows = TL.build(s, now).rows;
  const bgs = rows.filter(r => r.type === 'bg').map(r => r.item.title + r.lane);
  t.eq(bgs, ['a1', 'b2', 'c1']);
  const nowRow = rows.find(r => r.type === 'now');
  t.eq(nowRow.endLanes, [1, 2]);
  t.eq(nowRow.lanesOut, []);
  t.ok(rows.find(r => r.type === 'bg' && r.item.title === 'c').open);
});

t.check('a background task returned to the queue ends its branch', () => {
  let now = T0;
  const s = M.newState(now);
  ['a', 'b'].forEach(n => M.add(s, n, '', null, now));
  M.start(s, s.queue[0].id, now); now += 5 * MIN;
  M.toBackground(s, now); now += 5 * MIN;
  M.backgroundToQueue(s, s.background[0].id, now); now += 5 * MIN;
  const tl = TL.build(s, now);
  t.eq(sketch(tl), ['focus:a@0 background', 'bg:a@1', 'bgEnd:a@1 queued', 'present:b@0', 'now@0', 'future:a@0', 'add@0']);
  t.eq(tl.rows.find(r => r.type === 'bgEnd').outcome, 'queued');
  t.eq(tl.rows.find(r => r.type === 'future').item.title, 'a');
});

t.check('gaps of a minute or more in focus are shown, shorter ones are not', () => {
  let now = T0;
  const s = M.newState(now);
  ['a', 'b', 'c'].forEach(n => M.add(s, n, '', null, now));
  M.start(s, s.queue[0].id, now); now += 10 * MIN;
  M.pause(s, now, 'end'); now += 25 * MIN;
  M.start(s, s.queue[0].id, now); now += 10 * MIN;
  M.pause(s, now, 'end'); now += 30 * 1000;
  M.start(s, s.queue[0].id, now); now += 10 * MIN;
  const rows = TL.build(s, now).rows;
  const gaps = rows.filter(r => r.type === 'gap');
  t.eq(gaps.map(g => g.sec), [1500]);
  const g = gaps[0];
  t.eq(g.main, { in: 'idle', out: 'idle', through: true });
  const after = rows[rows.indexOf(g) + 1];
  t.eq(after.main.in, 'idle', 'the next focus row starts from the dashed line');
});

t.check('lane 0 styles: none before history, solid when focused, idle otherwise, dotted in the future', () => {
  let now = T0;
  const s = M.newState(now);
  M.add(s, 'a', '', null, now);
  M.add(s, 'b', '', null, now);
  let rows = TL.build(s, now).rows;
  t.eq(rows.find(r => r.type === 'now').main, { in: null, out: 'future' }, 'fresh state: no line above now');
  M.start(s, s.queue[0].id, now); now += 5 * MIN;
  M.toBackground(s, now); now += 5 * MIN;     /* b in focus */
  M.pause(s, now, 'end'); now += 5 * MIN;     /* nothing in focus */
  rows = TL.build(s, now).rows;
  t.eq(rows.find(r => r.type === 'bg').main.in, 'solid', 'fork while b is in focus');
  t.eq(rows.find(r => r.type === 'now').main, { in: 'idle', out: 'future' });
  rows.filter(r => r.type === 'future').forEach(r => t.eq(r.main, { in: 'future', out: 'future' }));
  t.eq(rows[rows.length - 1].main, { in: 'future', out: null });
});

t.check('day breaks come before the first row of each day, and before now', () => {
  let now = T0 - 2 * 86400000;
  const s = M.newState(now);
  ['a', 'b'].forEach(n => M.add(s, n, '', null, now));
  M.start(s, s.queue[0].id, now); now += 20 * MIN;
  M.finishAndNext(s, now); now += 10 * MIN;
  M.pause(s, now, 'end');
  const rows = TL.build(s, T0).rows;
  const days = rows.filter(r => r.type === 'day').map(r => r.day);
  t.eq(days.length, 2);
  t.eq(rows[0].type, 'day');
  t.eq(rows[rows.findIndex(r => r.type === 'now') - 1].type, 'day');
});

t.check('height hints duration, within limits', () => {
  const G = QDF.GEOM, h = TL.heightFor;
  t.eq(h(0), G.rowMin);
  t.ok(h(300) < h(1800) && h(1800) < h(3600), 'longer is taller');
  t.eq(h(30 * 3600), G.rowMax);
  t.ok(h(5 * 3600) - h(3600) < h(3600) - h(0), 'logarithmic, not linear');
});

t.check('every task appears in the timeline where it should', () => {
  const { s, now } = morning();
  const rows = TL.build(s, now).rows;
  const ids = new Set(rows.filter(r => r.item).map(r => r.item.id));
  [s.current, ...s.queue, ...s.background, ...s.done].forEach(item => t.ok(ids.has(item.id), item.title + ' missing'));
  t.eq(rows.filter(r => r.type === 'future').map(r => r.index), s.queue.map((x, k) => k));
});

t.done();
