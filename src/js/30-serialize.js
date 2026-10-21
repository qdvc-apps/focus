/* ==========================================================================
   30-serialize.js — state ⇄ document ⇄ YAML.

   The document is the state with snake_case keys and nothing derived, in a
   fixed key order, so exporting the same state twice gives the same bytes.
   The same document (as JSON) is what is kept in localStorage, so loading a
   saved session and importing a file go through one validation path.

   A stretch is written as an ISO 8601 interval:
       - 2026-10-21T09:00:00.000Z/2026-10-21T09:40:00.000Z
       - 2026-10-21T09:40:00.000Z/..
   where `..` marks the open end of a stretch still running.

   Import is forgiving about hand edits; paperwork/STATE-FORMAT.md lists
   every repair. Earlier formats are refused: the app is pre-release.
   ========================================================================== */

QDF.serialize = (function () {
  var U = QDF.util;

  function itemToDoc(item) {
    var o = { id: item.id, title: item.title };
    if (item.notes) o.notes = item.notes;
    o.created = item.created;
    if (item.finished) o.finished = item.finished;
    if (item.stretches.length) {
      o.stretches = item.stretches.map(function (st) { return st.from + '/' + (st.to || '..'); });
    }
    return o;
  }

  function toDoc(s, now) {
    return {
      format: QDF.APP.format,
      saved: U.iso(now),
      created: s.created,
      last_interaction: s.lastInteraction,
      foreground: s.foreground,
      active: s.active.map(itemToDoc),
      queue: s.queue.map(itemToDoc),
      done: s.done.map(itemToDoc)
    };
  }

  var HEADER =
    '# ' + QDF.APP.name + ' state\n' +
    '# active: running now, in parallel; foreground is the one you are attending to.\n' +
    '# queue: the first entry is up next. done: newest first.\n' +
    '# stretches: when each task was running, as ISO 8601 intervals in UTC;\n' +
    '# ".." marks one still running.\n';

  function toYaml(s, now) {
    return HEADER + QDF.yaml.emit(toDoc(s, now), true);
  }

  /* ------------------------------------------------------------- import */

  function isMap(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function time(v) {
    if (v instanceof Date) v = v.toISOString();
    if (v === null || v === undefined) return null;
    var t = U.ms(String(v).trim());
    return t === null ? null : new Date(t).toISOString();
  }

  function parseStretch(raw, warn, label) {
    if (isMap(raw) && time(raw.from)) {   /* the long-hand form, { from, to } */
      return { from: time(raw.from), to: raw.to ? time(raw.to) : null };
    }
    var parts = String(raw == null ? '' : raw).split('/');
    if (typeof raw !== 'string' || parts.length !== 2) {
      warn('Ignored a stretch in ' + label + ' that is not "start/end".');
      return null;
    }
    var from = time(parts[0]);
    var openEnd = /^\s*(\.\.)?\s*$/.test(parts[1]);
    var to = openEnd ? null : time(parts[1]);
    if (!from || (!openEnd && !to)) {
      warn('Ignored a stretch in ' + label + ' with an unreadable time.');
      return null;
    }
    return { from: from, to: to };
  }

  /* Sorted, no overlaps within one task, no stretch ending before it
     starts, and at most one open stretch, which must be the last. */
  function tidy(list) {
    list.sort(function (a, b) { return U.ms(a.from) - U.ms(b.from); });
    for (var k = 0; k < list.length; k++) {
      var st = list[k], next = list[k + 1];
      if (next && (!st.to || U.ms(st.to) > U.ms(next.from))) st.to = next.from;
      if (st.to && U.ms(st.to) < U.ms(st.from)) st.to = st.from;
    }
    return list;
  }

  function itemFromDoc(raw, where, ctx, label) {
    var now = ctx.now, warn = ctx.warn;
    if (typeof raw === 'string' || typeof raw === 'number') raw = { title: String(raw) };
    if (!isMap(raw)) { warn('Skipped an entry in ' + label + ' that is not a task.'); return null; }

    var item = {
      id: typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id) : '',
      title: String(typeof raw.title === 'object' || raw.title == null ? '' : raw.title).replace(/\s+/g, ' ').trim() || 'Untitled task',
      notes: String(typeof raw.notes === 'object' || raw.notes == null ? '' : raw.notes).replace(/\r\n?/g, '\n').replace(/\s+$/, ''),
      created: time(raw.created),
      stretches: []
    };

    if (!item.id || !/^[\w.:-]{1,80}$/.test(item.id)) item.id = U.uid(now);
    while (ctx.seen[item.id]) item.id = U.uid(now) + '-' + Object.keys(ctx.seen).length;
    ctx.seen[item.id] = true;

    if (Array.isArray(raw.stretches)) {
      raw.stretches.forEach(function (r) {
        var st = parseStretch(r, warn, label);
        if (st) item.stretches.push(st);
      });
    } else if (raw.stretches != null) {
      warn('Ignored "stretches" in ' + label + ' because it is not a list.');
    }
    tidy(item.stretches);

    var last = item.stretches[item.stretches.length - 1];
    if (where === 'active') {
      if (!last || last.to) {
        var from = last && U.ms(last.to) > now ? last.to : U.iso(now);
        item.stretches.push({ from: from, to: null });
      }
    } else if (last && !last.to) {
      var close = where === 'done' && time(raw.finished) ? time(raw.finished) : U.iso(now);
      last.to = U.ms(close) < U.ms(last.from) ? last.from : close;
      warn('Closed a stretch that was still running on "' + item.title + '" in ' + label + '.');
    }

    if (where === 'done') item.finished = time(raw.finished) || (last && last.to) || U.iso(now);
    if (!item.created) item.created = item.stretches.length ? item.stretches[0].from : U.iso(now);
    return item;
  }

  function list(doc, key, ctx) {
    var v = doc[key];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) { ctx.warn('Ignored "' + key + '" because it is not a list.'); return []; }
    return v.map(function (raw, n) {
      return itemFromDoc(raw, key, ctx, key + ' #' + (n + 1));
    }).filter(Boolean);
  }

  /* Returns { state, warnings }. Throws when the document cannot be a state
     at all, with a message meant for the person importing it. */
  function fromDocDetailed(doc, now) {
    if (!isMap(doc)) {
      throw new Error('This does not look like a ' + QDF.APP.name + ' state: expected keys such as "active" and "queue" at the top level.');
    }
    if (doc.format !== undefined && doc.format !== null) {
      var m = /^qdvc-focus\/(\d+)$/.exec(String(doc.format));
      if (!m) throw new Error('Unrecognised format "' + doc.format + '"; expected ' + QDF.APP.format + '.');
      var v = Number(m[1]);
      if (v > 3) throw new Error('This file was written by a newer version (' + doc.format + ').');
      if (v < 3) throw new Error('This file is in an earlier format (' + doc.format + ') that this version no longer reads.');
    } else if (!('active' in doc) && !('queue' in doc) && !('done' in doc)) {
      throw new Error('This does not look like a ' + QDF.APP.name + ' state: none of "active", "queue" or "done" are present.');
    }

    var warnings = [];
    var ctx = { now: now, seen: {}, warn: function (w) { warnings.push(w); } };
    var s = QDF.model.newState(now);
    s.created = time(doc.created) || s.created;
    s.lastInteraction = time(doc.last_interaction) || s.lastInteraction;
    s.active = list(doc, 'active', ctx);
    s.queue = list(doc, 'queue', ctx);
    s.done = list(doc, 'done', ctx);
    s.done.sort(function (a, b) { return U.ms(b.finished) - U.ms(a.finished); });

    var fg = doc.foreground == null ? null : String(doc.foreground);
    var known = s.active.some(function (x) { return x.id === fg; });
    if (fg && !known) ctx.warn('"foreground" names a task that is not running; the most recently started one is in the foreground instead.');
    s.foreground = known ? fg : (s.active.length ? s.active[s.active.length - 1].id : null);
    return { state: s, warnings: warnings };
  }

  function fromDoc(doc, now) {
    return fromDocDetailed(doc, now).state;
  }

  function fromYaml(text, now) {
    if (!String(text || '').trim()) throw new Error('There is nothing to import.');
    return fromDocDetailed(QDF.yaml.parse(text), now);
  }

  return {
    toDoc: toDoc, toYaml: toYaml,
    fromDoc: fromDoc, fromDocDetailed: fromDocDetailed, fromYaml: fromYaml
  };
})();
