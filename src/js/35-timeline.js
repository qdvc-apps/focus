/* ==========================================================================
   35-timeline.js — lays the state out as a timeline, past at the top and
   the present at the bottom, the way a Git graph lays out branches.

   Every stretch of every task becomes a card. Cards sit in lanes (columns):
   a stretch takes the lowest lane free when it starts and keeps it until it
   ends. A card spans every row from its start to its end, so tasks that ran
   at the same time sit side by side. With one task at a time, everything
   stays in lane 0 and reads as a single line.

   Rows are the moments something changed:
     day     a date heading
     start   a stretch began (the card starts here)
     tick    a stretch ended and nothing else happened at that moment
     gap     a minute or more with nothing running began here
     now     the present: running stretches end here

   build(state, now) → { rows, segs, lanes, nowRow, cardW }

   Each seg (stretch) has: item, where, stretch, from, to, open, sec,
   outcome ('done' | 'paused' | 'running'), lane, startRow, endRow (the row
   whose top it ends at, exclusive), height (card min-height, or null).

   Each row has: type, t, and for the graph column
     lanesIn   lanes running into the row from above
     ending    lanes that end at the top of this row
     through   lanes that run straight through
     lane      the lane of this row's node (start rows)
     merges    [{ from, to }] lanes that end here and join another lane
     caps      lanes that end at this row's node (running work, at now)
     fork      the lane a new branch leaves from, or null
     idleIn, idleOut   whether lane 0 shows the dashed "nothing running"
                       line above / below the node line
     height    the row's minimum height

   Pure: no DOM, no clock of its own. tools/test-timeline.mjs covers it.
   ========================================================================== */

QDF.timeline = (function () {
  var U = QDF.util, M = QDF.model, G = QDF.GEOM;
  var ORDER = { tick: 0, gap: 1, start: 2 };
  var ROW_MIN = { day: 42, start: 36, tick: 10, gap: 30, now: 48 };

  /* Height hints duration: logarithmic, so five minutes and five hours both
     fit on screen, but a long stretch visibly takes more room. */
  function heightFor(sec) {
    var h = G.rowMin + 20 * Math.log(1 + sec / 300) / Math.LN2;
    return Math.round(Math.min(G.rowMax, h));
  }

  function collect(s, now) {
    var segs = [];
    [['done', s.done], ['active', s.active], ['queue', s.queue]].forEach(function (g) {
      g[1].forEach(function (item) {
        var last = item.stretches.length - 1;
        item.stretches.forEach(function (st, k) {
          var to = st.to ? U.ms(st.to) : null;
          segs.push({
            key: item.id + '#' + k, item: item, where: g[0], stretch: st, index: k,
            from: U.ms(st.from), to: to, open: to === null, sec: M.duration(st, now),
            outcome: to === null ? 'running' : item.finished && k === last ? 'done' : 'paused'
          });
        });
      });
    });
    segs.sort(function (a, b) { return a.from - b.from || (a.key < b.key ? -1 : 1); });
    return segs;
  }

  function build(s, now) {
    var segs = collect(s, now);

    /* ------------------------------------------------ the moments */
    var points = [], starts = {}, ends = {};
    segs.forEach(function (sg) {
      points.push({ type: 'start', t: sg.from, seg: sg });
      starts[sg.from] = true;
      if (!sg.open) ends[sg.to] = true;
    });

    /* Holes in the union of all stretches: nothing was running. */
    var cover = segs.map(function (sg) { return [sg.from, sg.open ? now : sg.to]; });
    var gaps = {}, reach = null;
    cover.forEach(function (c) {
      if (reach !== null && c[0] - reach >= G.gapMin * 1000) gaps[reach] = Math.floor((c[0] - reach) / 1000);
      reach = reach === null ? c[1] : Math.max(reach, c[1]);
    });

    Object.keys(ends).forEach(function (k) {
      var t = Number(k);
      if (gaps[t] !== undefined) points.push({ type: 'gap', t: t, sec: gaps[t] });
      else if (!starts[t]) points.push({ type: 'tick', t: t });
    });
    points.sort(function (a, b) { return a.t - b.t || ORDER[a.type] - ORDER[b.type]; });

    /* ------------------------------------------------------- rows */
    var rows = [], lastDay = null;
    function dayBreak(t) {
      var d = U.dayKey(U.iso(t));
      if (d !== lastDay) { rows.push({ type: 'day', t: t, day: d }); lastDay = d; }
    }
    points.forEach(function (p) {
      dayBreak(p.t);
      if (p.type === 'start') p.seg.startRow = rows.length;
      rows.push(p);
    });
    dayBreak(now);
    var nowRow = rows.length;
    var lastEnd = null;
    cover.forEach(function (c) { lastEnd = lastEnd === null ? c[1] : Math.max(lastEnd, c[1]); });
    rows.push({ type: 'now', t: now, idleSince: !s.active.length && lastEnd !== null ? U.iso(lastEnd) : null });

    /* Where each stretch ends: the first row after its start at or after
       its end time; running stretches end at now. */
    segs.forEach(function (sg) {
      if (sg.open) { sg.endRow = nowRow; return; }
      for (var r = sg.startRow + 1; r <= nowRow; r++) {
        if (rows[r].type !== 'day' && rows[r].t >= sg.to) { sg.endRow = r; return; }
      }
      sg.endRow = nowRow;
    });

    /* ------------------------------------------------------ lanes */
    var laneSeg = [], maxLane = 0, began = false;
    var fg = M.foreground(s);

    rows.forEach(function (r, i) {
      var inLanes = [], ending = [], through = [];
      for (var L = 0; L < laneSeg.length; L++) {
        var sg = laneSeg[L];
        if (!sg) continue;
        inLanes.push(L);
        if (sg.endRow === i) ending.push(L); else through.push(L);
      }
      ending.forEach(function (L) { r.endingSegs = (r.endingSegs || []).concat([laneSeg[L]]); laneSeg[L] = null; });

      r.lanesIn = inLanes;
      r.ending = ending;
      r.through = through;
      r.merges = [];
      r.caps = [];
      r.fork = null;
      r.idleIn = began && !inLanes.length;

      if (r.type === 'start') {
        var lane = 0;
        while (laneSeg[lane]) lane++;
        laneSeg[lane] = r.seg;
        r.seg.lane = lane;
        r.lane = lane;
        if (lane > maxLane) maxLane = lane;
        if (ending.indexOf(lane) === -1 && through.length) r.fork = through[0];
        r.foreground = r.seg.open && fg && r.seg.item.id === fg.id;
        began = true;
      }

      if (r.type === 'now') {
        r.endingSegs = r.endingSegs || [];
        var running = r.endingSegs.filter(function (x) { return x.open; }).map(function (x) { return x.lane; });
        r.caps = running;
        ending.forEach(function (L) {
          if (running.indexOf(L) === -1) r.merges.push({ from: L, to: running.length ? running[0] : 0 });
        });
      } else {
        ending.forEach(function (L) {
          if (r.type === 'start' && L === r.lane) return;   /* the same lane carries straight on */
          var to = through.length ? through[0] : r.type === 'start' ? r.lane : 0;
          if (to !== L || r.type !== 'start') r.merges.push({ from: L, to: to });
        });
      }

      var out = through.slice();
      if (r.type === 'start') out.push(r.lane);
      r.lanesOut = r.type === 'now' ? [] : out.sort(function (a, b) { return a - b; });
      r.idleOut = began && !r.lanesOut.length && r.type !== 'now';
      r.height = ROW_MIN[r.type];
    });

    /* ------------------------------------------------ card sizes */
    segs.forEach(function (sg) { sg.height = sg.open ? null : heightFor(sg.sec); });
    var lanes = maxLane + 1;

    return {
      rows: rows,
      segs: segs,
      lanes: lanes,
      nowRow: nowRow,
      cardW: G.cardW[Math.min(lanes, G.cardW.length) - 1],
      future: s.queue
    };
  }

  return { build: build, heightFor: heightFor };
})();
