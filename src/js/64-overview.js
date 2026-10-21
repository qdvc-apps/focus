/* ==========================================================================
   64-overview.js — the left drawer: today at a glance, what is going on
   right now, and a list of days to jump to on the timeline.

   With tasks running in parallel, "time running" means time with at least
   one task running (the union of stretches), not the sum of them.
   ========================================================================== */

QDF.view.overview = function (s, now) {
  var U = QDF.util, M = QDF.model, T = QDF.view.tick;
  var t0 = U.dayStart(now);
  var all = s.done.concat(s.active, s.queue);

  /* Merge intervals into their union; returns total seconds. */
  function unionSeconds(spans) {
    var sorted = spans.slice().sort(function (a, b) { return a[0] - b[0]; });
    var total = 0, cur = null;
    sorted.forEach(function (sp) {
      if (!cur || sp[0] > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [sp[0], sp[1]]; }
      else cur[1] = Math.max(cur[1], sp[1]);
    });
    if (cur) total += cur[1] - cur[0];
    return Math.floor(total / 1000);
  }

  /* ----------------------------------------------------------- today */
  var spans = [], longest = 0;
  all.forEach(function (item) {
    item.stretches.forEach(function (st) {
      var a = U.ms(st.from), b = st.to ? U.ms(st.to) : now;
      if (b <= t0) return;
      a = Math.max(a, t0);
      spans.push([a, b, !st.to]);
      longest = Math.max(longest, (b - a) / 1000);
    });
  });
  var running = unionSeconds(spans);
  var doneToday = s.done.filter(function (d) { return U.ms(d.finished) >= t0; }).length;

  /* Most at once: sweep the starts and ends. */
  var edges = [];
  spans.forEach(function (sp) { edges.push([sp[0], 1], [sp[1], -1]); });
  edges.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  var most = 0, level = 0;
  edges.forEach(function (e) { level += e[1]; most = Math.max(most, level); });

  function tile(value, label, cls) {
    return '<div class="tile' + (cls ? ' ' + cls : '') + '"><div class="tile-value">' + value + '</div><div class="tile-label">' + label + '</div></div>';
  }

  var tiles =
    tile(s.active.length ? T('dur', U.iso(now), running, now) : U.esc(U.duration(running)), 'Running today', s.active.length ? 'timer' : '') +
    tile(String(doneToday), doneToday === 1 ? 'Task done' : 'Tasks done') +
    tile(U.esc(U.duration(longest)), 'Longest stretch') +
    tile(String(most), 'Most at once');

  /* The day at a glance: one track per lane, filled greedily. */
  var ribbon = '';
  if (spans.length) {
    var first = Math.min.apply(null, spans.map(function (sp) { return sp[0]; }));
    var start = Math.floor(first / 3600000) * 3600000;
    var end = Math.max(start + 3600000, Math.ceil(now / 3600000) * 3600000);
    var range = end - start;
    var pct = function (v) { return ((v - start) / range * 100).toFixed(3) + '%'; };
    var tracks = [];
    spans.slice().sort(function (a, b) { return a[0] - b[0]; }).forEach(function (sp) {
      var k = 0;
      while (tracks[k] && tracks[k] > sp[0]) k++;
      tracks[k] = sp[1];
      sp.track = k;
    });
    var n = Math.min(tracks.length, 4), h = Math.floor(22 / n);
    var ticks = '';
    for (var hh = start + 3600000; hh < end; hh += 3600000) ticks += '<span class="rb-tick" style="left:' + pct(hh) + '"></span>';
    ribbon =
      '<div class="ribbon" role="img" aria-label="Today: when tasks were running, one track for each task running at once">' + ticks +
        spans.filter(function (sp) { return sp.track < 4; }).map(function (sp) {
          return '<span class="rb-seg lc' + (sp.track % 5) + '" style="left:' + pct(sp[0]) + ';width:' +
            ((sp[1] - sp[0]) / range * 100).toFixed(3) + '%;top:' + (4 + sp.track * (h + 1)) + 'px;height:' + (h - 1) + 'px"></span>';
        }).join('') +
      '</div>' +
      '<div class="rb-scale"><span>' + U.esc(U.timeOfDay(U.iso(start))) + '</span><span>' + U.esc(U.timeOfDay(U.iso(end))) + '</span></div>';
  }

  /* ------------------------------------------------------- right now */
  var fg = M.foreground(s), next = M.upNext(s);
  function row(key, value) {
    return '<div class="ov-row"><span class="ov-key">' + key + '</span><span class="ov-val">' + value + '</span></div>';
  }
  var others = s.active.length - (fg ? 1 : 0);
  var rightNow =
    row('Foreground', fg ? U.esc(fg.title) : '<span class="dim">Nothing running</span>') +
    row('Alongside', others ? U.esc(U.plural(others, 'other task')) : '<span class="dim">Nothing else</span>') +
    row('Up next', next ? U.esc(next.title) : '<span class="dim">Nothing queued</span>') +
    row('Queued', U.esc(U.plural(s.queue.length, 'task')));

  /* ------------------------------------------------------------ days */
  var days = {};
  function day(key) { return days[key] || (days[key] = { spans: [], done: 0 }); }
  all.forEach(function (item) {
    item.stretches.forEach(function (st) {
      day(U.dayKey(st.from)).spans.push([U.ms(st.from), st.to ? U.ms(st.to) : now]);
    });
  });
  s.done.forEach(function (item) { day(U.dayKey(item.finished)).done++; });
  var list = Object.keys(days).sort().reverse().slice(0, 60).map(function (k) {
    var d = days[k];
    return '<li><button type="button" class="day-link" data-act="jump-day" data-day="' + U.esc(k) + '">' +
      '<span class="day-name">' + U.esc(U.dayLabel(new Date(k + 'T12:00:00').toISOString(), now)) + '</span>' +
      '<span class="day-sub">' + (d.done ? d.done + ' done · ' : '') + U.esc(U.duration(unionSeconds(d.spans))) + '</span>' +
    '</button></li>';
  }).join('');

  return '<div class="dw">' +
    '<div class="dw-head"><span class="label">Overview</span></div>' +
    '<section class="dw-section"><div class="label">Today</div><div class="tiles">' + tiles + '</div>' +
      (ribbon || '<p class="dim">Nothing yet today.</p>') + '</section>' +
    '<section class="dw-section"><div class="label">Right now</div>' + rightNow + '</section>' +
    '<section class="dw-section"><div class="label">Jump to</div><ul class="day-list">' +
      '<li><button type="button" class="day-link" data-act="jump-now"><span class="day-name">Now</span><span class="day-sub">' +
        T('tod', null, 0, now) + '</span></button></li>' + list +
    '</ul></section>' +
  '</div>';
};
