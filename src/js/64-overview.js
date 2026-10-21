/* ==========================================================================
   64-overview.js — the left drawer: today at a glance, what is going on
   right now, and a list of days to jump to on the timeline.
   ========================================================================== */

QDF.view.overview = function (s, now) {
  var U = QDF.util, M = QDF.model, T = QDF.view.tick;
  var t0 = U.dayStart(now);
  var all = s.done.concat(s.current ? [s.current] : [], s.background, s.queue);

  /* ----------------------------------------------------------- today */
  var focusBanked = 0, longest = 0, switches = 0, first = null, openFrom = null;
  var focusSegs = [], bgSegs = [];
  all.forEach(function (item) {
    item.stretches.forEach(function (st) {
      var a = U.ms(st.from), b = st.to ? U.ms(st.to) : now;
      if (b <= t0) return;
      a = Math.max(a, t0);
      var sec = Math.max(0, (b - a) / 1000);
      if (first === null || a < first) first = a;
      if (st.kind === 'focus') {
        if (st.to) focusBanked += sec; else openFrom = U.iso(a);
        longest = Math.max(longest, sec);
        switches++;
        focusSegs.push([a, b]);
      } else {
        bgSegs.push([a, b]);
      }
    });
  });
  var doneToday = s.done.filter(function (d) { return U.ms(d.finished) >= t0; }).length;

  var tiles =
    tile(T('dur', openFrom, focusBanked, now), 'Focused today') +
    tile(String(doneToday), doneToday === 1 ? 'Task done' : 'Tasks done') +
    tile(U.esc(U.duration(longest)), 'Longest stretch') +
    tile(String(switches), switches === 1 ? 'Stretch of focus' : 'Stretches of focus');

  var ribbon = '';
  if (first !== null) {
    var start = Math.floor(first / 3600000) * 3600000;
    var end = Math.max(start + 3600000, Math.ceil(now / 3600000) * 3600000);
    var range = end - start;
    var pct = function (v) { return ((v - start) / range * 100).toFixed(3) + '%'; };
    var w = function (a, b) { return ((b - a) / range * 100).toFixed(3) + '%'; };
    var ticks = '';
    for (var h = start + 3600000; h < end; h += 3600000) ticks += '<span class="rb-tick" style="left:' + pct(h) + '"></span>';
    ribbon =
      '<div class="ribbon" role="img" aria-label="Today: focus on the upper track, background work on the lower">' + ticks +
        focusSegs.map(function (g) { return '<span class="rb-seg rb-focus lc0" style="left:' + pct(g[0]) + ';width:' + w(g[0], g[1]) + '"></span>'; }).join('') +
        bgSegs.map(function (g) { return '<span class="rb-seg rb-bg lc1" style="left:' + pct(g[0]) + ';width:' + w(g[0], g[1]) + '"></span>'; }).join('') +
      '</div>' +
      '<div class="rb-scale"><span>' + U.esc(U.timeOfDay(U.iso(start))) + '</span><span>' + U.esc(U.timeOfDay(U.iso(end))) + '</span></div>';
  }

  function tile(value, label) {
    return '<div class="tile"><div class="tile-value">' + value + '</div><div class="tile-label">' + label + '</div></div>';
  }

  /* ------------------------------------------------------- right now */
  var next = M.upNext(s);
  function row(key, value) {
    return '<div class="ov-row"><span class="ov-key">' + key + '</span><span class="ov-val">' + value + '</span></div>';
  }
  var rightNow =
    row('In focus', s.current ? U.esc(s.current.title) : '<span class="dim">Nothing</span>') +
    row('Up next', next ? U.esc(next.title) : '<span class="dim">Nothing queued</span>') +
    row('Queued', U.esc(U.plural(s.queue.length, 'task'))) +
    row('Background', s.background.length ? U.esc(s.background.length + ' running') : '<span class="dim">Nothing running</span>');

  /* ------------------------------------------------------------ days */
  var days = {};
  function day(key) {
    return days[key] || (days[key] = { key: key, focus: 0, done: 0, t: 0 });
  }
  all.forEach(function (item) {
    item.stretches.forEach(function (st) {
      if (st.kind !== 'focus') return;
      var d = day(U.dayKey(st.from));
      d.focus += M.duration(st, now);
      d.t = Math.max(d.t, U.ms(st.from));
    });
  });
  s.done.forEach(function (item) { day(U.dayKey(item.finished)).done++; });
  var list = Object.keys(days).sort().reverse().slice(0, 60).map(function (k) {
    var d = days[k];
    var iso = k + 'T12:00:00';
    return '<li><button type="button" class="day-link" data-act="jump-day" data-day="' + U.esc(k) + '">' +
      '<span class="day-name">' + U.esc(U.dayLabel(new Date(iso).toISOString(), now)) + '</span>' +
      '<span class="day-sub">' + (d.done ? d.done + ' done · ' : '') + U.esc(U.duration(d.focus)) + '</span>' +
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
