/* ==========================================================================
   35-timeline.js — lays the state out as a timeline, past at the top and
   future at the bottom, the way a Git graph lays out commits.

   Lane 0 is the main line: whatever was in focus. A background stretch
   forks off into its own lane (1, 2, …) at the moment it starts and merges
   back when it ends — into the task's next focus stretch if it was brought
   forward, or through an end marker if it finished or went back to the
   queue. Background work still running carries its lane down to the "now"
   row, where it ends.

   build(state, now) → { rows, lanes, now }. Each row has a `type`:

     day        a date heading
     focus      a past focus stretch (lane 0); `outcome` is how it ended:
                'done', 'background' or 'paused'
     gap        a stretch of nothing in focus (lane 0, dashed)
     bg         a background stretch starting (its own lane, forks from 0)
     bgEnd      a background stretch ending other than by being brought
                forward; `outcome` is 'done', 'queued' or 'ended'
     present    the task in focus now
     now        the present moment
     future     a queued task; index 0 is up next
     add        the "add a task" row at the very end

   and the graph information the view needs:

     lane       which lane the row's node sits on
     lanesIn    background lanes arriving from above
     lanesOut   background lanes continuing below
     mergeLane  a background lane that ends in this row's node (focus/present)
     endLanes   background lanes that end at this row (now)
     main       { in, out, through } styles of lane 0: 'solid' (focused),
                'idle' (nothing in focus), 'future', or null (no line)
     height     the row's minimum height in pixels, or null for "fit"

   Pure: no DOM, no clock of its own. tools/test-timeline.mjs covers it.
   ========================================================================== */

QDF.timeline = (function () {
  var U = QDF.util, M = QDF.model, G = QDF.GEOM;

  /* At the same instant, endings come before starts, and a background
     stretch starting (the fork) before the next focus stretch. */
  var ORDER = { bgEnd: 0, bg: 1, gap: 2, focus: 3 };

  /* Height hints duration: logarithmic, so five minutes and five hours both
     fit on screen, but a long stretch visibly takes more room. */
  function heightFor(sec) {
    var h = G.rowMin + 20 * Math.log(1 + sec / 300) / Math.LN2;
    return Math.round(Math.min(G.rowMax, h));
  }

  function collect(s, now) {
    var events = [], segs = [];
    var groups = [
      ['done', s.done],
      ['current', s.current ? [s.current] : []],
      ['background', s.background],
      ['queue', s.queue]
    ];
    groups.forEach(function (g) {
      var where = g[0];
      g[1].forEach(function (item) {
        var st = item.stretches, lastIndex = st.length - 1;
        st.forEach(function (x, k) {
          var from = U.ms(x.from), to = x.to ? U.ms(x.to) : null;
          var key = item.id + '#' + k;
          var prev = st[k - 1], next = st[k + 1];
          if (x.kind === 'focus') {
            segs.push({ from: from, to: to === null ? now : to });
            if (!x.to) return;  /* the open focus stretch is the present row */
            events.push({
              type: 'focus', t: from, key: key, item: item, where: where, stretch: x, index: k,
              sec: M.duration(x, now),
              outcome: item.finished && k === lastIndex ? 'done'
                : next && next.kind === 'background' && next.from === x.to ? 'background' : 'paused',
              mergeKey: prev && prev.kind === 'background' && prev.to === x.from ? item.id + '#' + (k - 1) : null
            });
          } else {
            events.push({
              type: 'bg', t: from, key: key, item: item, where: where, stretch: x, index: k,
              open: !x.to, sec: M.duration(x, now)
            });
            if (x.to && !(next && next.kind === 'focus' && next.from === x.to)) {
              events.push({
                type: 'bgEnd', t: to, key: key, item: item, where: where, stretch: x, index: k,
                outcome: next ? 'queued'
                  : item.finished ? 'done'
                  : where === 'queue' ? 'queued' : 'ended'
              });
            }
          }
        });
      });
    });

    segs.sort(function (a, b) { return a.from - b.from; });
    for (var n = 0; n + 1 < segs.length; n++) {
      var gap = (segs[n + 1].from - segs[n].to) / 1000;
      if (gap >= G.gapMin) events.push({ type: 'gap', t: segs[n].to, sec: Math.floor(gap), key: 'gap#' + n });
    }

    events.sort(function (a, b) {
      if (a.t !== b.t) return a.t - b.t;
      if (a.key === b.key) return a.type === 'bg' ? -1 : 1;
      return ORDER[a.type] - ORDER[b.type];
    });
    return { events: events, segs: segs };
  }

  function build(s, now) {
    var c = collect(s, now);
    var segs = c.segs;

    function activeAt(t) {
      for (var k = 0; k < segs.length; k++) {
        if (segs[k].from <= t && t < segs[k].to) return true;
      }
      return false;
    }

    /* ---------------------------------------------------- row sequence */
    var rows = [], lastDay = null;
    function dayBreak(t) {
      var d = U.dayKey(U.iso(t));
      if (d !== lastDay) { rows.push({ type: 'day', t: t, day: d, key: 'day#' + d }); lastDay = d; }
    }
    c.events.forEach(function (e) { dayBreak(e.t); rows.push(e); });

    dayBreak(now);
    var lastFocusEnd = null;
    segs.forEach(function (sg) { if (lastFocusEnd === null || sg.to > lastFocusEnd) lastFocusEnd = sg.to; });

    if (s.current) {
      var cur = s.current, k = cur.stretches.length - 1, open = cur.stretches[k], prev = cur.stretches[k - 1];
      rows.push({
        type: 'present', t: U.ms(open.from), key: 'present', item: cur, stretch: open, index: k,
        mergeKey: prev && prev.kind === 'background' && prev.to === open.from ? cur.id + '#' + (k - 1) : null
      });
    }
    rows.push({
      type: 'now', t: now, key: 'now',
      idleSince: !s.current && lastFocusEnd !== null ? U.iso(lastFocusEnd) : null
    });
    s.queue.forEach(function (item, i) {
      rows.push({ type: 'future', key: 'future#' + item.id, item: item, index: i });
    });
    rows.push({ type: 'add', key: 'add' });

    /* ----------------------------------------------------------- lanes */
    var lanes = [], laneOf = {}, maxLane = 0, began = false, prevOut = null;

    function active() {
      var out = [];
      for (var L = 1; L < lanes.length; L++) if (lanes[L]) out.push(L);
      return out;
    }

    rows.forEach(function (r) {
      r.lanesIn = active();
      r.lane = 0;

      if (r.type === 'bg') {
        var L = 1;
        while (lanes[L]) L++;
        lanes[L] = r.key;
        laneOf[r.key] = L;
        r.lane = L;
        if (L > maxLane) maxLane = L;
      } else if (r.type === 'bgEnd') {
        r.lane = laneOf[r.key] || 0;
        if (r.lane) lanes[r.lane] = null;
      } else if ((r.type === 'focus' || r.type === 'present') && r.mergeKey && laneOf[r.mergeKey] &&
                 lanes[laneOf[r.mergeKey]] === r.mergeKey) {
        r.mergeLane = laneOf[r.mergeKey];
        lanes[r.mergeLane] = null;
      } else if (r.type === 'now') {
        r.endLanes = r.lanesIn;
        lanes = [];
      }
      r.lanesOut = active();

      /* lane 0 */
      switch (r.type) {
        case 'focus':
        case 'present':
          r.main = { in: began ? prevOut : null, out: 'solid' };
          began = true;
          break;
        case 'gap':
          r.main = { in: 'idle', out: 'idle', through: true };
          break;
        case 'now':
          r.main = { in: began ? (s.current ? 'solid' : 'idle') : null, out: 'future' };
          began = true;
          break;
        case 'future':
          r.main = { in: 'future', out: 'future' };
          break;
        case 'add':
          r.main = { in: 'future', out: null };
          break;
        default:
          if (!began) { r.main = null; break; }
          var style = activeAt(r.t) ? 'solid' : 'idle';
          r.main = { in: style, out: style, through: true };
      }
      if (r.main) prevOut = r.main.out;

      r.height =
        r.type === 'focus' ? heightFor(r.sec) :
        r.type === 'bg' ? (r.open ? 70 : 48) :
        r.type === 'bgEnd' ? 44 :
        r.type === 'gap' ? 32 :
        r.type === 'day' ? 44 :
        r.type === 'future' ? (r.index === 0 ? 58 : 48) :
        null;
    });

    return { rows: rows, lanes: maxLane + 1, now: now };
  }

  return { build: build, heightFor: heightFor };
})();
