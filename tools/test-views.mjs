/* Renders every view in a range of states and checks the markup: no
   "undefined" or "NaN" leaking through, task text always escaped, tags
   balanced, and every button wired to something that exists. */
import fs from 'node:fs';
import path from 'node:path';
import { load, suite, ROOT } from './harness.mjs';

const T0 = Date.parse('2026-10-21T09:00:00Z');
const MIN = 60000;
const t = suite('test-views');
const QDF = load();
const M = QDF.model, V = QDF.view;

const HOSTILE = '<img src=x onerror="alert(1)"> & \'quotes\'';

function states() {
  const out = {};
  out.empty = M.newState(T0);

  const queued = M.newState(T0);
  M.add(queued, 'only queued', '', null, T0);
  out.queuedNothingInFocus = queued;

  const busy = M.newState(T0 - 3 * 86400000);
  ['a', 'b', 'c', 'd', 'e'].forEach((n, k) => M.add(busy, 'Task ' + n, k % 2 ? 'note ' + n + '\nsecond line' : '', null, T0 - 3 * 86400000));
  let now = T0 - 2 * 86400000;
  M.start(busy, busy.queue[0].id, now);
  M.finishAndNext(busy, now += 40 * MIN);
  M.toBackground(busy, now += 5 * MIN);
  now = T0 - 60 * MIN;
  M.finishAndNext(busy, now);
  M.toBackground(busy, now += 3 * MIN);
  M.finish(busy, busy.background[0].id, now += 2 * MIN);
  out.busy = busy;

  const hostile = M.newState(T0);
  M.add(hostile, HOSTILE, HOSTILE, null, T0);
  M.add(hostile, HOSTILE, HOSTILE, null, T0);
  M.add(hostile, HOSTILE, HOSTILE, null, T0);
  M.start(hostile, hostile.queue[0].id, T0);
  M.toBackground(hostile, T0 + MIN);
  M.finishAndNext(hostile, T0 + 2 * MIN);
  M.add(hostile, HOSTILE, HOSTILE, null, T0);
  out.hostile = hostile;

  const long = M.newState(T0);
  M.add(long, 'x'.repeat(300), 'y'.repeat(2000), null, T0);
  M.start(long, long.queue[0].id, T0 - 30 * 3600000);
  out.longRunning = long;
  return out;
}

const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'circle', 'path', 'rect', 'ellipse', 'stop']);

function balanced(html) {
  const stack = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    if (m[0].startsWith('</')) {
      const top = stack.pop();
      if (top !== tag) return `closing </${tag}> but open <${top}>`;
    } else if (!VOID.has(tag) && !m[2]) {
      stack.push(tag);
    }
  }
  return stack.length ? `unclosed <${stack.join('>, <')}>` : null;
}

function views(s, now) {
  return {
    now: V.now(s, now),
    queue: V.queue(s, now),
    background: V.background(s, now),
    done: V.done(s, now, { doneCollapsed: false }),
    doneCollapsed: V.done(s, now, { doneCollapsed: true }),
    idle: V.idle(s, now),
    status: V.status(s, now, { savedAt: now, error: null }),
    statusError: V.status(s, now, { savedAt: null, error: 'Could not save <here>' })
  };
}

for (const [name, s] of Object.entries(states())) {
  const now = T0 + 5 * MIN;
  for (const [view, html] of Object.entries(views(s, now))) {
    const label = `${name} / ${view}`;
    t.check(`${label}: no undefined or NaN`, () => {
      const text = html.replace(/<[^>]+>/g, ' ');
      t.ok(!/\bundefined\b|\bNaN\b/.test(text) && !/="(undefined|NaN|null)"/.test(html), label + ': ' + html.slice(0, 300));
    });
    t.check(`${label}: balanced markup`, () => {
      const problem = balanced(html);
      t.ok(!problem, problem);
    });
    t.check(`${label}: task text is escaped`, () => {
      t.ok(!html.includes('<img'), 'raw <img found');
      /* Escaped text may sit inside a quoted attribute; what must never
         happen is an event-handler attribute of its own. */
      for (const tag of html.match(/<[a-z][^>]*>/gi) || []) {
        const names = [...tag.matchAll(/\s([\w-]+)(?:="[^"]*")?/g)].map(m => m[1].toLowerCase());
        t.ok(!names.some(n => n.startsWith('on')), 'event handler attribute in ' + tag);
      }
    });
  }
}

t.check('the now view shows the clock from first start', () => {
  const s = M.newState(T0);
  M.add(s, 'a', '', null, T0);
  M.start(s, s.queue[0].id, T0);
  const html = V.now(s, T0 + 3723000);
  t.ok(html.includes('>1:02:03<'), 'clock text');
  t.ok(html.includes('data-tick="clock"'), 'clock ticks');
});

t.check('the idle indicator changes level with time', () => {
  const s = M.newState(T0);
  t.ok(V.idle(s, T0).includes('data-level="ok"'));
  t.ok(V.idle(s, T0 + QDF.IDLE.warnAfter * MIN).includes('data-level="warn"'));
  t.ok(V.idle(s, T0 + QDF.IDLE.alertAfter * MIN).includes('data-level="alert"'));
});

t.check('formats', () => {
  const U = QDF.util;
  t.eq(U.clock(0), '0:00:00');
  t.eq(U.clock(36000 + 61), '10:01:01');
  t.eq(U.duration(0), '0m');
  t.eq(U.duration(25), '<1m');
  t.eq(U.duration(25, true), '25s');
  t.eq(U.duration(125, true), '2m 05s');
  t.eq(U.duration(3700), '1h 01m');
  t.eq(U.duration(90000), '1d 1h');
  t.eq(U.ago(30), 'just now');
  t.eq(U.ago(600), '10m ago');
});

t.check('YAML highlighting escapes everything', () => {
  const html = QDF.transfer.highlight('title: "<b>x</b>"\n- <i>\n# <c>\n  plain <d>\n');
  t.ok(!/<(b|i|c|d)>/.test(html), html);
  t.ok(html.includes('&lt;b&gt;'));
});

/* -------------------------------------------------------- static wiring */

const src = p => fs.readFileSync(path.join(ROOT, 'src', p), 'utf8');
const js = fs.readdirSync(path.join(ROOT, 'src', 'js')).sort().map(f => src('js/' + f)).join('\n');
const shell = src('10-shell.html');

t.check('every data-act has a handler, and every handler is used', () => {
  const used = new Set();
  for (const m of (js + shell).matchAll(/data-act="([\w-]+)"/g)) used.add(m[1]);
  for (const m of js.matchAll(/\btool\('\w+', '([\w-]+)'/g)) used.add(m[1]);
  const handlers = new Set(Object.keys(QDF.app.actions));
  const missing = [...used].filter(a => !handlers.has(a));
  const unused = [...handlers].filter(a => !used.has(a));
  t.eq(missing, [], 'buttons without a handler');
  t.eq(unused, [], 'handlers no button uses');
});

t.check('every icon name exists', () => {
  const names = new Set();
  for (const m of js.matchAll(/\b(?:I|QDF\.icon)\('(\w+)'/g)) names.add(m[1]);
  for (const m of js.matchAll(/\bicon: '(\w+)'/g)) names.add(m[1]);
  for (const m of shell.matchAll(/data-icon="(\w+)"/g)) names.add(m[1]);
  const missing = [...names].filter(n => !QDF.ICONS[n]);
  t.eq(missing, []);
  t.ok(names.size > 10, 'found the icon uses');
});

t.check('every element the controller looks up exists in the shell', () => {
  const app = src('js/90-app.js') + src('js/50-ui.js') + src('js/68-transfer.js');
  const dynamic = new Set(['idle-chip', 'quick-start-input', 'btn-done-next']);
  const ids = new Set();
  for (const m of app.matchAll(/(?:\$|getElementById)\('([\w-]+)'\)/g)) ids.add(m[1]);
  const missing = [...ids].filter(id => !dynamic.has(id) && !shell.includes(`id="${id}"`));
  t.eq(missing, []);
});

t.done();
