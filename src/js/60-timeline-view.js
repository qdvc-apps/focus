/* ==========================================================================
   60-timeline-view.js — draws QDF.timeline.build as HTML.

   The past and present are one CSS grid: a time column, the graph column,
   then one column per lane. Every row of the layout is a grid row; each card
   is placed in its lane's column and spans the rows its stretch lasted, so
   tasks that ran together sit side by side. The graph is drawn per row:
   lines are bars anchored to the top or bottom of the row, forks and merges
   are fixed-height SVG curves between the row top and the node, which sits
   --node-y from the top, so rows can be any height without the drawing
   stretching.

   The queue below the now line is a plain list of rows, so that dragging to
   reorder it stays simple.
   ========================================================================== */

QDF.view.graphWidth = function (tl) {
  var G = QDF.GEOM;
  return G.laneX0 * 2 + (tl.lanes - 1) * G.laneW;
};

QDF.view.timeline = function (tl, s, now, ui) {
  var U = QDF.util, M = QDF.model, I = QDF.icon, T = QDF.view.tick, G = QDF.GEOM, V = QDF.view;
  var NY = G.nodeY;
  var W = V.graphWidth(tl);
  var selected = ui && ui.selectedId;
  var multi = tl.lanes > 1;

  function x(L) { return G.laneX0 + L * G.laneW; }
  function colour(L) { return L % 5; }

  function line(L, style, part) {
    var pos = part === 'full' ? 'top:0;bottom:0'
      : part === 'top' ? 'top:0;height:' + NY + 'px'
      : 'top:' + NY + 'px;bottom:0';
    var lc = style === 'future' ? '' : ' lc' + colour(style === 'idle' ? 0 : L);
    return '<span class="ln ln-' + style + lc + '" style="left:' + x(L) + 'px;' + pos + '"></span>';
  }

  /* An S-curve from lane a at the row top to lane b at the node line,
     drawn twice: the tube, then a thin highlight along it. */
  function curve(a, b, lane) {
    var xa = x(a), xb = x(b), m = NY / 2;
    var d = 'M' + xa + ' 0C' + xa + ' ' + m + ' ' + xb + ' ' + m + ' ' + xb + ' ' + NY;
    return '<svg class="curve lc' + colour(lane) + '" width="' + W + '" height="' + NY +
      '" viewBox="0 0 ' + W + ' ' + NY + '" aria-hidden="true" focusable="false"><path d="' + d + '"/><path d="' + d + '"/></svg>';
  }

  function node(L, cls, inner) {
    return '<span class="node ' + cls + ' lc' + colour(L) + '" style="left:' + x(L) + 'px">' + (inner || '') + '</span>';
  }

  function graph(r) {
    var h = [];
    r.through.forEach(function (L) { h.push(line(L, 'solid', 'full')); });
    r.merges.forEach(function (m) {
      h.push(m.from === m.to ? line(m.from, 'solid', 'top') : curve(m.from, m.to, m.from));
    });
    if (r.type === 'start') {
      if (r.ending.indexOf(r.lane) !== -1) h.push(line(r.lane, 'solid', 'top'));
      else if (r.fork !== null) h.push(curve(r.fork, r.lane, r.lane));
      else if (r.idleIn) h.push(line(0, 'idle', 'top'));
      h.push(line(r.lane, 'solid', 'bottom'));
      var sg = r.seg;
      h.push(sg.open
        ? node(r.lane, r.foreground ? 'node-present' : 'node-running')
        : sg.outcome === 'done' ? node(r.lane, 'node-done', I('check')) : node(r.lane, ''));
    } else {
      if (r.idleIn) h.push(line(0, 'idle', 'top'));
      if (r.idleOut) h.push(line(0, 'idle', 'bottom'));
    }
    r.caps.forEach(function (L) {
      h.push(line(L, 'solid', 'top'));
      h.push('<span class="end-cap lc' + colour(L) + '" style="left:' + x(L) + 'px"></span>');
    });
    return h.join('');
  }

  function sel(id) { return id === selected ? ' is-selected' : ''; }

  function time(r) {
    switch (r.type) {
      case 'start': return U.esc(U.timeOfDay(r.seg.stretch.from));
      case 'tick': return '<span class="tl-tick-time">' + U.esc(U.timeOfDay(U.iso(r.t))) + '</span>';
      case 'now': return T('tod', null, 0, now);
      default: return '';
    }
  }

  var OUTCOME = {
    done: '<span class="chip chip-done">' + I('check') + 'Done</span>',
    paused: '<span class="chip">' + I('pause') + 'Paused</span>'
  };

  function dot(lane) {
    return multi ? '<span class="lane-dot lc' + colour(lane) + '" aria-hidden="true"></span>' : '';
  }

  function card(sg) {
    var item = sg.item, id = U.esc(item.id);
    var place = 'grid-row:' + (sg.startRow + 1) + '/' + (sg.endRow + 1) + ';grid-column:' + (3 + sg.lane);
    if (sg.open) {
      return V.running(sg, s, now, {
        place: place,
        foreground: M.foreground(s) === item,
        selected: item.id === selected,
        dot: dot(sg.lane)
      });
    }
    return '<div class="tl-card is-past' + sel(item.id) + '" style="' + place + ';min-height:' + sg.height + 'px" data-select="' + id + '" tabindex="0">' +
      '<div class="tl-title">' + dot(sg.lane) + U.esc(item.title) + '</div>' +
      '<div class="tl-meta"><span>' + U.esc(U.duration(sg.sec)) + '</span><span>until ' +
        U.esc(U.timeOfDay(sg.stretch.to)) + '</span>' + OUTCOME[sg.outcome] + '</div>' +
    '</div>';
  }

  function band(r, i) {
    var place = 'grid-row:' + (i + 1) + ';grid-column:3/-1';
    if (r.type === 'day') {
      return '<div class="tl-day" style="' + place + '"><span class="tl-day-name">' + U.esc(U.dayLabel(U.iso(r.t), now)) + '</span>' +
        '<span class="tl-day-date">' + U.esc(U.longDate(U.iso(r.t), now)) + '</span><hr class="etched"></div>';
    }
    if (r.type === 'gap') {
      return '<div class="tl-line tl-gap" style="' + place + '">Nothing running for ' + U.esc(U.duration(r.sec)) + '</div>';
    }
    if (r.type === 'now') {
      return '<div class="tl-nowline" id="tl-now" data-drop="now" style="grid-row:' + (i + 1) + ';grid-column:2/-1">' +
        '<span class="now-tag">Now</span>' + (s.active.length ? '' : V.nowEmpty(s, now, r)) + '</div>';
    }
    return '';
  }

  /* -------------------------------------------------- past and present */
  /* Lanes shrink to fit a narrow stage (drawers open) before the timeline
     has to scroll sideways. */
  var cols = '58px ' + W + 'px repeat(' + tl.lanes + ', minmax(200px, ' + tl.cardW + 'px))';
  var rowsCss = tl.rows.map(function (r) { return 'minmax(' + r.height + 'px, auto)'; }).join(' ');
  var cells = [];
  tl.rows.forEach(function (r, i) {
    var cls = 'tl-cell tl-' + r.type;
    cells.push('<div class="' + cls + ' tl-time" style="grid-row:' + (i + 1) + ';grid-column:1">' + time(r) + '</div>');
    cells.push('<div class="' + cls + ' tl-graph" style="grid-row:' + (i + 1) + ';grid-column:2">' + graph(r) + '</div>');
    cells.push(band(r, i));
  });
  tl.segs.forEach(function (sg) { cells.push(card(sg)); });

  var hasPast = tl.segs.length > 0;
  var out = [
    '<div class="tl-origin">' + (hasPast ? 'The start of your history' : 'Your history will build up here as you work.') + '</div>',
    '<div class="tl-grid" style="grid-template-columns:' + cols + ';grid-template-rows:' + rowsCss + '">' + cells.join('') + '</div>'
  ];

  /* ---------------------------------------------------------- future */
  function tool(icon, act, label, item) {
    return '<button type="button" class="tool" data-act="' + act + '" data-id="' + U.esc(item.id) + '" title="' + label +
      '" aria-label="' + label + ': ' + U.esc(item.title) + '">' + I(icon) + '</button>';
  }

  function futureRow(item, index) {
    var id = U.esc(item.id), first = M.started(item);
    return '<div class="tl-row tl-future-row" data-row-id="' + id + '">' +
      '<div class="tl-time"></div>' +
      '<div class="tl-graph">' + line(0, 'future', 'full') +
        node(0, 'node-future' + (index === 0 ? ' node-next' : '')) + '</div>' +
      '<div class="tl-body"><div class="tl-card is-future' + (index === 0 ? ' is-next' : '') + sel(item.id) +
          '" draggable="true" data-drag-id="' + id + '" data-select="' + id + '" tabindex="0">' +
        '<div class="tl-title">' + (index === 0 ? '<span class="chip chip-next">Up next</span> ' : '') + U.esc(item.title) + '</div>' +
        (U.firstLine(item.notes) ? '<div class="tl-note">' + U.esc(U.firstLine(item.notes)) + '</div>' : '') +
        '<div class="tl-meta">' + (first
          ? '<span>Paused</span><span>' + U.esc(U.duration(M.total(item, now))) + ' so far</span>'
          : '<span>Added ' + T('ago', item.created, 0, now) + '</span>') + '</div>' +
        '<div class="tl-tools">' +
          tool('play', 'start', 'Start now, alongside anything running', item) +
          (index === 0 ? '' : tool('up', 'make-next', 'Do this next', item)) +
        '</div>' +
      '</div></div>' +
    '</div>';
  }

  /* The queue keeps a comfortable width even when many lanes made the
     cards above narrow. */
  out.push('<div class="tl-future" data-drop="future" style="--col-w:' + Math.max(tl.cardW, 360) + 'px">' +
    tl.future.map(futureRow).join('') +
    '<div class="tl-row tl-add">' +
      '<div class="tl-time"></div>' +
      '<div class="tl-graph">' + line(0, 'future', 'top') + node(0, 'node-add', I('plus')) + '</div>' +
      '<div class="tl-body"><form class="add-form" data-form="add" autocomplete="off">' +
          '<input class="field" id="add-input" name="title" maxlength="300" placeholder="Add a task to the queue…" aria-label="Add a task to the queue">' +
          '<button type="submit" class="btn">' + I('plus') + '<span>Add</span></button>' +
        '</form>' +
        '<div class="add-hint"><kbd>Enter</kbd> queues it · <kbd>Shift</kbd>+<kbd>Enter</kbd> makes it up next · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> starts it now</div>' +
      '</div>' +
    '</div>' +
  '</div>');

  return out.join('');
};
