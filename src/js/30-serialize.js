/* ==========================================================================
   30-serialize.js — state ⇄ document ⇄ YAML.

   The document is the state with snake_case keys and nothing derived, in a
   fixed key order, so exporting the same state twice gives the same bytes.
   The same document (as JSON) is what is kept in localStorage, so loading a
   saved session and importing a file go through one validation path.

   A stretch is written as a one-key mapping holding an ISO 8601 interval:
       - focus: 2026-10-21T09:00:00.000Z/2026-10-21T09:40:00.000Z
       - background: 2026-10-21T09:40:00.000Z/..
   where `..` marks the open end of a stretch still running.

   Import is forgiving about hand edits and about version 1 files, which had
   totals instead of stretches; paperwork/STATE-FORMAT.md lists every repair.
   ========================================================================== */

QDF.serialize = (function () {
  var U = QDF.util;
  var KINDS = { focus: true, background: true };

  function stretchToDoc(st) {
    var o = {};
    o[st.kind] = st.from + '/' + (st.to || '..');
    return o;
  }

  function itemToDoc(item) {
    var o = { id: item.id, title: item.title };
    if (item.notes) o.notes = item.notes;
    o.created = item.created;
    if (item.finished) o.finished = item.finished;
    if (item.stretches.length) o.stretches = item.stretches.map(stretchToDoc);
    return o;
  }

  function toDoc(s, now) {
    return {
      format: QDF.APP.format,
      saved: U.iso(now),
      created: s.created,
      last_interaction: s.lastInteraction,
      current: s.current ? itemToDoc(s.current) : null,
      queue: s.queue.map(itemToDoc),
      background: s.background.map(itemToDoc),
      done: s.done.map(itemToDoc)
    };
  }

  var HEADER =
    '# ' + QDF.APP.name + ' state\n' +
    '# queue: the first entry is up next. done: newest first.\n' +
    '# stretches: when each task was in focus or in the background, as\n' +
    '# ISO 8601 intervals in UTC; ".." marks one still running.\n';

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

  function parseStretch(raw, warn, where) {
    var kind, value;
    if (isMap(raw) && Object.keys(raw).length === 1 && KINDS[Object.keys(raw)[0]]) {
      kind = Object.keys(raw)[0];
      value = String(raw[kind] == null ? '' : raw[kind]);
      var parts = value.split('/');
      if (parts.length !== 2) { warn('Ignored a stretch in ' + where + ' that is not "start/end".'); return null; }
      var from = time(parts[0]);
      var openEnd = /^\s*(\.\.)?\s*$/.test(parts[1]);
      var to = openEnd ? null : time(parts[1]);
      if (!from || (!openEnd && !to)) { warn('Ignored a stretch in ' + where + ' with an unreadable time.'); return null; }
      return { kind: kind, from: from, to: to };
    }
    /* The long-hand form someone might type: { kind, from, to } */
    if (isMap(raw) && KINDS[raw.kind] && time(raw.from)) {
      return { kind: raw.kind, from: time(raw.from), to: raw.to ? time(raw.to) : null };
    }
    warn('Ignored an entry in ' + where + ' stretches that is not a focus or background stretch.');
    return null;
  }

  /* Version 1 kept totals, not stretches. Rebuild plausible stretches from
     them: banked time laid end to end from `started`, then the live stretch
     where it really began. */
  function fromVersion1(raw) {
    var out = [];
    var t = U.ms(time(raw.started)) || U.ms(time(raw.created));
    var fs = Math.max(0, Number(raw.focus_seconds) || 0);
    var bs = Math.max(0, Number(raw.background_seconds) || 0);
    if (t !== null && fs) { out.push({ kind: 'focus', from: U.iso(t), to: U.iso(t + fs * 1000) }); t += fs * 1000; }
    if (t !== null && bs) { out.push({ kind: 'background', from: U.iso(t), to: U.iso(t + bs * 1000) }); t += bs * 1000; }
    if (time(raw.focused_since)) out.push({ kind: 'focus', from: time(raw.focused_since), to: null });
    if (time(raw.background_since)) out.push({ kind: 'background', from: time(raw.background_since), to: null });
    if (!out.length && time(raw.started)) {
      out.push({ kind: 'focus', from: time(raw.started), to: time(raw.finished) || time(raw.started) });
    }
    return out;
  }

  /* Sorted, no overlaps, no stretch ending before it starts, and at most
     one open stretch, which must be the last. */
  function tidy(list, now) {
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
    } else if ('started' in raw || 'focus_seconds' in raw || 'focused_since' in raw || 'background_since' in raw) {
      item.stretches = fromVersion1(raw);
      ctx.converted = true;
    }
    tidy(item.stretches, now);

    var last = item.stretches[item.stretches.length - 1];
    var openKind = { current: 'focus', background: 'background' }[where];
    if (openKind) {
      if (!last || last.to || last.kind !== openKind) {
        if (last && !last.to) last.to = U.iso(Math.max(now, U.ms(last.from)));
        var from = last && last.to && U.ms(last.to) > now ? last.to : U.iso(now);
        item.stretches.push({ kind: openKind, from: from, to: null });
      }
    } else if (last && !last.to) {
      var close = where === 'done' && time(raw.finished) ? time(raw.finished) : U.iso(now);
      last.to = U.ms(close) < U.ms(last.from) ? last.from : close;
      warn('Closed a stretch that was still running on "' + item.title + '" in ' + label + '.');
    }

    if (where === 'done') {
      item.finished = time(raw.finished) || (last && last.to) || U.iso(now);
    }
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

  /* Returns { state, warnings, version }. Throws when the document cannot
     be a state at all, with a message meant for the person importing it. */
  function fromDocDetailed(doc, now) {
    if (!isMap(doc)) {
      throw new Error('This does not look like a ' + QDF.APP.name + ' state: expected keys such as "current" and "queue" at the top level.');
    }
    var version = 2;
    if (doc.format !== undefined && doc.format !== null) {
      var m = /^qdvc-focus\/(\d+)$/.exec(String(doc.format));
      if (!m) throw new Error('Unrecognised format "' + doc.format + '"; expected ' + QDF.APP.format + '.');
      version = Number(m[1]);
      if (version > 2) throw new Error('This file was written by a newer version (' + doc.format + ').');
    } else if (!('current' in doc) && !('queue' in doc) && !('background' in doc) && !('done' in doc)) {
      throw new Error('This does not look like a ' + QDF.APP.name + ' state: none of "current", "queue", "background" or "done" are present.');
    }

    var warnings = [];
    var ctx = { now: now, seen: {}, converted: false, warn: function (w) { warnings.push(w); } };
    var s = QDF.model.newState(now);
    s.created = time(doc.created) || s.created;
    s.lastInteraction = time(doc.last_interaction) || s.lastInteraction;

    var cur = doc.current;
    if (Array.isArray(cur)) {
      ctx.warn('"current" holds a list; the first entry is in focus and the rest were queued.');
      s.current = cur.length ? itemFromDoc(cur[0], 'current', ctx, 'current') : null;
      s.queue = cur.slice(1).map(function (raw, n) {
        return itemFromDoc(raw, 'queue', ctx, 'current #' + (n + 2));
      }).filter(Boolean);
    } else if (cur !== undefined && cur !== null && cur !== '') {
      s.current = itemFromDoc(cur, 'current', ctx, 'current');
    }
    s.queue = s.queue.concat(list(doc, 'queue', ctx));
    s.background = list(doc, 'background', ctx);
    s.done = list(doc, 'done', ctx);
    s.done.sort(function (a, b) { return U.ms(b.finished) - U.ms(a.finished); });

    if (ctx.converted) {
      warnings.unshift('Converted from format qdvc-focus/1, which kept totals rather than a history: ' +
        'earlier stretches are reconstructed, so their exact times are approximate.');
    }
    return { state: s, warnings: warnings, version: version };
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
