/* The timeline layout engine: rows at every start and end, lanes for tasks
   that ran together, cards spanning the rows they ran for, forks and merges,
   gaps, day breaks and height hints. These are the rules that make the graph
   read like a Git history, so they are pinned down here. */
import { load, suite } from './harness.mjs';

const T0 = Date.parse('2026-10-21T09:00:00Z');
const MIN = 60000;
const t = suite('test-timeline');
const QDF = load();
const M = QDF.model, TL = QDF.timeline;

const byTitle = (s, n) => [...s.active, ...s.queue, ...s.done].find(x => x.title === n);

/* Rows as short strings: type, title, lane and graph details. */
function sketch(tl) {
  return tl.rows.filter(r => r.type !== 'day').map(r => {
    let s = r.type + (r.seg ? ':' + r.seg.item.title + '@' + r.lane : '');
    if (r.fork !== null && r.fork !== undefined) s += ' fork' + r.fork;
    r.merges.forEach(m => { s += ' merge' + m.from + '>' + m.to; });
    if (r.caps.length) s += ' caps' + r.caps.join(',');
    return s;
  });
}

function cards(tl) {
  const rowAt = i => tl.rows[i].type === 'day' ? 'day' : tl.rows[i].type;
  return tl.segs.map(sg => sg.item.title + '@' + sg.lane + ' ' + rowAt(sg.startRow) + '→' + rowAt(sg.endRow));
}

/* A morning with some parallel work in it. */
function morning() {
  let now = T0;
  const s = M.newState(now);
  ['Triage', 'Docker', 'Plan', 'Review', 'Vendor'].forEach(n => M.add(s, n, '', null, now));
  M.start(s, byTitle(s, 'Triage').id, now); now += 35 * MIN;
  M.finishAndNext(s, byTitle(s, 'Triage').id, now); now += 15 * MIN;   /* Docker running */
  M.startNext(s, now); now += 20 * MIN;                               /* Plan alongside Docker */
  M.finish(s, byTitle(s, 'Docker').id, now); now += 10 * MIN;         /* Docker done, Plan carries on */
  M.startNext(s, now); now += 5 * MIN;                                /* Review alongside Plan */
  M.pause(s, byTitle(s, 'Plan').id, now, 'end'); now += 3 * MIN;     /* Plan back to the queue */
  return { s, now };
}

t.check('a morning reads like a Git graph', () => {
  const { s, now } = morning();
  const tl = TL.build(s, now);
  t.eq(sketch(tl), [
    'start:Triage@0',
    'start:Docker@0',
    'start:Plan@1 fork0',
    'tick merge0>1',
    'start:Review@0 fork1',
    'tick merge1>0',
    'now caps0'
  ]);
  t.eq(tl.lanes, 2);
  t.eq(tl.cardW, QDF.GEOM.cardW[1], 'two lanes: the two-column card width');
});

t.check('each card spans exactly the rows its stretch ran for', () => {
  const { s, now } = morning();
  const tl = TL.build(s, now);
  t.eq(cards(tl), [
    'Triage@0 start→start',
    'Docker@0 start→tick',
    'Plan@1 start→tick',
    'Review@0 start→now'
  ]);
  const plan = tl.segs.find(sg => sg.item.title === 'Plan');
  const review = tl.segs.find(sg => sg.item.title === 'Review');
  t.ok(plan.startRow < review.startRow && review.startRow < plan.endRow, 'Plan and Review overlap, side by side');
  t.eq(review.open, true);
  t.eq(review.height, null, 'running cards size to their content');
  t.ok(plan.height >= QDF.GEOM.rowMin, 'past cards carry a height hint');
});

t.check('lanes in, through and out follow the parallel work', () => {
  const { s, now } = morning();
  const rows = TL.build(s, now).rows.filter(r => r.type !== 'day');
  const lanes = r => [r.lanesIn, r.ending, r.lanesOut];
  t.eq(lanes(rows[1]), [[0], [0], [0]], 'Triage hands lane 0 straight to Docker');
  t.eq(lanes(rows[2]), [[0], [], [0, 1]], 'Plan branches into lane 1');
  t.eq(lanes(rows[3]), [[0, 1], [0], [1]], 'Docker ends and joins Plan');
  t.eq(lanes(rows[4]), [[1], [], [0, 1]], 'Review takes the free lane 0');
  t.eq(lanes(rows[6]), [[0], [0], []], 'Review runs into now');
});

t.check('the foreground is marked on its start row and nothing else changes', () => {
  let now = T0;
  const s = M.newState(now);
  ['a', 'b'].forEach(n => M.add(s, n, '', null, now));
  M.start(s, byTitle(s, 'a').id, now); now += MIN;
  M.start(s, byTitle(s, 'b').id, now); now += MIN;
  const before = JSON.stringify(TL.build(s, now).segs.map(sg => [sg.lane, sg.startRow, sg.endRow]));
  const fgRow = tl => tl.rows.find(r => r.foreground).seg.item.title;
  t.eq(fgRow(TL.build(s, now)), 'b');
  M.setForeground(s, byTitle(s, 'a').id);
  const tl = TL.build(s, now);
  t.eq(fgRow(tl), 'a');
  t.eq(JSON.stringify(tl.segs.map(sg => [sg.lane, sg.startRow, sg.endRow])), before, 'same layout either way');
  t.eq(tl.rows.find(r => r.type === 'now').caps, [0, 1], 'both running lanes end at now');
});

t.check('gaps of a minute or more with nothing running are shown, shorter ones are not', () => {
  let now = T0;
  const s = M.newState(now);
  ['a', 'b', 'c'].forEach(n => M.add(s, n, '', null, now));
  M.start(s, s.queue[0].id, now); now += 10 * MIN;
  M.pause(s, s.active[0].id, now, 'end'); now += 25 * MIN;
  M.start(s, s.queue[0].id, now); now += 10 * MIN;
  M.pause(s, s.active[0].id, now, 'end'); now += 30 * 1000;
  M.start(s, s.queue[0].id, now); now += 10 * MIN;
  const rows = TL.build(s, now).rows;
  const gaps = rows.filter(r => r.type === 'gap');
  t.eq(gaps.map(g => g.sec), [1500]);
  t.ok(gaps[0].idleOut, 'the dashed line runs on below a gap');
  const next = rows[rows.indexOf(gaps[0]) + 1];
  t.ok(next.idleIn, 'and into the next start');
  t.eq(rows.filter(r => r.type === 'tick').length, 1, 'the short pause is a plain end');
});

t.check('overlapping work never shows as a gap', () => {
  let now = T0;
  const s = M.newState(now);
  ['a', 'b'].forEach(n => M.add(s, n, '', null, now));
  M.start(s, byTitle(s, 'a').id, now); now += 5 * MIN;
  M.start(s, byTitle(s, 'b').id, now); now += 5 * MIN;
  M.finish(s, byTitle(s, 'a').id, now); now += 30 * MIN;
  M.finish(s, byTitle(s, 'b').id, now); now += 5 * MIN;
  const rows = TL.build(s, now).rows;
  t.eq(rows.filter(r => r.type === 'gap').length, 0);
  t.eq(rows.find(r => r.type === 'now').idleSince, new Date(now - 5 * MIN).toISOString());
});

t.check('lanes are reused, lowest first', () => {
  let now = T0;
  const s = M.newState(now);
  ['a', 'b', 'c', 'd'].forEach(n => M.add(s, n, '', null, now));
  ['a', 'b', 'c'].forEach(n => { M.start(s, byTitle(s, n).id, now); now += MIN; });
  M.finish(s, byTitle(s, 'b').id, now); now += MIN;
  M.start(s, byTitle(s, 'd').id, now); now += MIN;
  const tl = TL.build(s, now);
  t.eq(tl.segs.map(sg => sg.item.title + sg.lane), ['a0', 'b1', 'c2', 'd1']);
  t.eq(tl.lanes, 3);
  t.eq(tl.cardW, QDF.GEOM.cardW[2]);
});

t.check('an empty state is just the now row', () => {
  const s = M.newState(T0);
  const tl = TL.build(s, T0);
  t.eq(tl.rows.map(r => r.type), ['day', 'now']);
  t.eq(tl.lanes, 1);
  t.eq(tl.rows[1].idleIn, false, 'no line above now before any history');
});

t.check('day breaks come before the first row of each day, and before now', () => {
  let now = T0 - 2 * 86400000;
  const s = M.newState(now);
  ['a', 'b'].forEach(n => M.add(s, n, '', null, now));
  M.start(s, byTitle(s, 'a').id, now); now += 20 * MIN;
  M.finishAndNext(s, byTitle(s, 'a').id, now); now += 10 * MIN;
  M.pause(s, byTitle(s, 'b').id, now, 'end');
  const rows = TL.build(s, T0).rows;
  t.eq(rows.filter(r => r.type === 'day').length, 2);
  t.eq(rows[0].type, 'day');
  t.eq(rows[rows.findIndex(r => r.type === 'now') - 1].type, 'day');
});

t.check('a stretch started and stopped at the same moment still gets its own row', () => {
  const s = M.newState(T0);
  ['a', 'b'].forEach(n => M.add(s, n, '', null, T0));
  M.start(s, byTitle(s, 'a').id, T0);
  M.finish(s, byTitle(s, 'a').id, T0);
  M.start(s, byTitle(s, 'b').id, T0 + 60 * MIN);
  const tl = TL.build(s, T0 + 70 * MIN);
  const a = tl.segs.find(sg => sg.item.title === 'a');
  t.eq(a.endRow, a.startRow + 1);
});

t.check('height hints duration, within limits', () => {
  const G = QDF.GEOM, h = TL.heightFor;
  t.eq(h(0), G.rowMin);
  t.ok(h(300) < h(1800) && h(1800) < h(3600), 'longer is taller');
  t.eq(h(30 * 3600), G.rowMax);
  t.ok(h(5 * 3600) - h(3600) < h(3600) - h(0), 'logarithmic, not linear');
});

t.check('every stretch of every task appears once', () => {
  const { s, now } = morning();
  const tl = TL.build(s, now);
  const expected = [...s.active, ...s.queue, ...s.done].reduce((n, x) => n + x.stretches.length, 0);
  t.eq(tl.segs.length, expected);
  t.eq(tl.future.map(x => x.title), s.queue.map(x => x.title));
});

t.done();
