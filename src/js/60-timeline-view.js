/* ==========================================================================
   60-timeline-view.js — draws the rows from QDF.timeline.build as HTML: a
   time column, the graph column, and a card for each row.

   The graph is drawn per row. Lines are thin bars anchored to the top of the
   row, the bottom, or both; forks and merges are small SVG curves of fixed
   height between the row edge and the node, which sits --node-y from the
   top. So a row can be any height and nothing in the drawing stretches.
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

  function x(L) { return G.laneX0 + L * G.laneW; }
  function colour(L) { return L === 0 ? 0 : ((L - 1) % 4) + 1; }

  function line(L, style, part) {
    var pos = part === 'full' ? 'top:0;bottom:0'
      : part === 'top' ? 'top:0;height:' + NY + 'px'
      : 'top:' + NY + 'px;bottom:0';
    return '<span class="ln ln-' + style + ' lc' + colour(L) + '" style="left:' + x(L) + 'px;' + pos + '"></span>';
  }

  /* An S-curve from lane a at y0 to lane b at y0 + h, drawn twice: the
     tube, then a thin highlight along it. */
  function curve(a, b, y0, h, lane) {
    var xa = x(a), xb = x(b), m = h / 2;
    var d = 'M' + xa + ' 0C' + xa + ' ' + m + ' ' + xb + ' ' + m + ' ' + xb + ' ' + h;
    return '<svg class="curve lc' + colour(lane) + '" style="top:' + y0 + 'px" width="' + W + '" height="' + h +
      '" viewBox="0 0 ' + W + ' ' + h + '" aria-hidden="true" focusable="false"><path d="' + d + '"/><path d="' + d + '"/></svg>';
  }

  function node(L, cls, inner) {
    return '<span class="node ' + cls + ' lc' + colour(L) + '" style="left:' + x(L) + 'px">' + (inner || '') + '</span>';
  }

  function graph(r) {
    var h = [];
    r.lanesIn.forEach(function (L) {
      if (r.lanesOut.indexOf(L) !== -1 && !(r.type === 'bg' && L === r.lane)) h.push(line(L, 'bg', 'full'));
    });
    if (r.type === 'bg') {
      h.push(curve(0, r.lane, 0, NY, r.lane));
      if (r.lanesOut.indexOf(r.lane) !== -1) h.push(line(r.lane, 'bg', 'bottom'));
    }
    if (r.type === 'bgEnd' && r.lane) {
      h.push(line(r.lane, 'bg', 'top'));
      h.push(curve(r.lane, 0, NY, (r.height || 44) - NY, r.lane));
    }
    if (r.mergeLane) h.push(curve(r.mergeLane, 0, 0, NY, r.mergeLane));
    if (r.type === 'now') {
      (r.endLanes || []).forEach(function (L) {
        h.push(line(L, 'bg', 'top'));
        h.push('<span class="end-cap lc' + colour(L) + '" style="left:' + x(L) + 'px"></span>');
      });
    }
    if (r.main) {
      if (r.main.through) h.push(line(0, r.main.in, 'full'));
      else {
        if (r.main.in) h.push(line(0, r.main.in, 'top'));
        if (r.main.out) h.push(line(0, r.main.out, 'bottom'));
      }
    }
    switch (r.type) {
      case 'focus': h.push(r.outcome === 'done' ? node(0, 'node-done', I('check')) : node(0, '')); break;
      case 'present': h.push(node(0, 'node-present')); break;
      case 'bg': h.push(node(r.lane, r.open ? 'node-running' : 'node-small')); break;
      case 'bgEnd': h.push(r.outcome === 'done' ? node(r.lane, 'node-done', I('check')) : node(r.lane, 'node-hollow node-small')); break;
      case 'future': h.push(node(0, 'node-future' + (r.index === 0 ? ' node-next' : ''))); break;
      case 'add': h.push(node(0, 'node-add', I('plus'))); break;
    }
    return h.join('');
  }

  function sel(id) { return id === selected ? ' is-selected' : ''; }

  function time(r) {
    switch (r.type) {
      case 'focus': case 'bg': case 'present': return U.esc(U.timeOfDay(r.stretch.from));
      case 'bgEnd': return U.esc(U.timeOfDay(r.stretch.to));
      case 'now': return T('tod', null, 0, now);
      default: return '';
    }
  }

  var OUTCOME = {
    done: '<span class="chip chip-done">' + I('check') + 'Done</span>',
    background: '<span class="chip">' + I('background') + 'To background</span>',
    paused: '<span class="chip">' + I('pause') + 'Paused</span>'
  };

  function body(r) {
    var item = r.item, id = item ? U.esc(item.id) : '';
    switch (r.type) {
      case 'day':
        return '<span class="tl-day-name">' + U.esc(U.dayLabel(U.iso(r.t), now)) + '</span>' +
          '<span class="tl-day-date">' + U.esc(U.longDate(U.iso(r.t), now)) + '</span><hr class="etched">';

      case 'focus':
        return '<div class="tl-card is-past' + sel(item.id) + '" data-select="' + id + '" tabindex="0">' +
          '<div class="tl-title">' + U.esc(item.title) + '</div>' +
          '<div class="tl-meta"><span>' + U.esc(U.duration(r.sec)) + '</span><span>until ' +
            U.esc(U.timeOfDay(r.stretch.to)) + '</span>' + OUTCOME[r.outcome] + '</div>' +
        '</div>';

      case 'gap':
        return '<div class="tl-line">Nothing in focus for ' + U.esc(U.duration(r.sec)) + '</div>';

      case 'bg':
        return '<div class="tl-card tl-card-bg lc' + (((r.lane - 1) % 4) + 1) + (r.open ? '' : ' is-past') + sel(item.id) +
            '" data-select="' + id + '" tabindex="0">' +
          '<div class="tl-title">' + U.esc(item.title) + '</div>' +
          (r.open
            ? '<div class="tl-meta">Running in the background for ' + T('durp', r.stretch.from, 0, now) + '</div>' +
              '<div class="tl-bg-run"><div class="pole-track" aria-hidden="true"><div class="pole"></div></div>' +
                '<button type="button" class="btn btn-sm" data-act="start" data-id="' + id + '" title="Bring it into focus; what you are on now becomes up next">' +
                  I('forward') + '<span>Bring forward</span></button>' +
                '<button type="button" class="btn btn-sm btn-go" data-act="finish" data-id="' + id + '">' + I('check') + '<span>Done</span></button>' +
              '</div>'
            : '<div class="tl-meta"><span>In the background ' + U.esc(U.duration(r.sec)) + '</span><span>until ' +
              U.esc(U.timeOfDay(r.stretch.to)) + '</span></div>') +
        '</div>';

      case 'bgEnd':
        var what = r.outcome === 'done' ? 'finished in the background'
          : r.outcome === 'queued' ? 'went back to the queue' : 'left the background';
        return '<div class="tl-line" data-select="' + id + '">' +
          '<b>' + U.esc(item.title) + '</b> ' + what + '</div>';

      case 'present':
        return V.present(r, s, now, item.id === selected);

      case 'now':
        return '<span class="now-tag">Now</span>' + (s.current ? '' : V.nowEmpty(s, now, r));

      case 'future':
        var started = M.started(item);
        return '<div class="tl-card is-future' + (r.index === 0 ? ' is-next' : '') + sel(item.id) +
            '" draggable="true" data-drag-id="' + id + '" data-select="' + id + '" tabindex="0">' +
          '<div class="tl-title">' + (r.index === 0 ? '<span class="chip chip-next">Up next</span> ' : '') + U.esc(item.title) + '</div>' +
          (U.firstLine(item.notes) ? '<div class="tl-note">' + U.esc(U.firstLine(item.notes)) + '</div>' : '') +
          '<div class="tl-meta">' + (started
            ? '<span>Paused</span><span>' + U.esc(U.duration(M.focusTotal(item, now))) + ' focused so far</span>'
            : '<span>Added ' + T('ago', item.created, 0, now) + '</span>') + '</div>' +
          '<div class="tl-tools">' +
            tool('play', 'start', 'Start now', item) +
            (r.index === 0 ? '' : tool('up', 'make-next', 'Do this next', item)) +
          '</div>' +
        '</div>';

      case 'add':
        return '<form class="add-form" data-form="add" autocomplete="off">' +
            '<input class="field" id="add-input" name="title" maxlength="300" placeholder="Add a task to the queue…" aria-label="Add a task to the queue">' +
            '<button type="submit" class="btn">' + I('plus') + '<span>Add</span></button>' +
          '</form>' +
          '<div class="add-hint"><kbd>Enter</kbd> adds to the end · <kbd>Shift</kbd>+<kbd>Enter</kbd> adds as up next</div>';
    }
    return '';
  }

  function tool(icon, act, label, item) {
    return '<button type="button" class="tool" data-act="' + act + '" data-id="' + U.esc(item.id) + '" title="' + label +
      '" aria-label="' + label + ': ' + U.esc(item.title) + '">' + I(icon) + '</button>';
  }

  function rowId(r) {
    if (r.type === 'day') return 'tl-day-' + r.day;
    if (r.type === 'present') return 'tl-present';
    if (r.type === 'now') return 'tl-now';
    return null;
  }

  var FILL = { focus: true };
  var hasPast = tl.rows.some(function (r) { return r.type === 'focus' || r.type === 'bg'; });
  var out = ['<div class="tl-origin">' + (hasPast ? 'The start of your history' : 'Your history will build up here as you work.') + '</div>'];
  var inFuture = false;

  tl.rows.forEach(function (r) {
    if (!inFuture && (r.type === 'future' || r.type === 'add')) {
      out.push('<div class="tl-future" data-drop="future">');
      inFuture = true;
    }
    var id = rowId(r);
    out.push('<div class="tl-row tl-' + r.type + (FILL[r.type] ? ' tl-fill' : '') + '"' +
      (id ? ' id="' + id + '"' : '') +
      (r.type === 'future' ? ' data-row-id="' + U.esc(r.item.id) + '"' : '') +
      (r.height ? ' style="min-height:' + r.height + 'px"' : '') + '>' +
      '<div class="tl-time">' + time(r) + '</div>' +
      '<div class="tl-graph">' + graph(r) + '</div>' +
      '<div class="tl-body">' + body(r) + '</div>' +
    '</div>');
  });
  if (inFuture) out.push('</div>');
  return out.join('');
};
