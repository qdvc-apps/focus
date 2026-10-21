/* ==========================================================================
   30-serialize.js — state ⇄ document ⇄ YAML.

   The document is the state with snake_case keys and nothing derived, in a
   fixed key order, so exporting the same state twice gives the same bytes.
   The same document (as JSON) is what is kept in localStorage, so loading a
   saved session and importing a file go through one validation path.

   Import is forgiving about hand edits: missing ids are generated, duplicate
   ids are renamed, a bare string in a list becomes a task with that title,
   missing or unreadable times are filled in, and fields that do not belong
   where a task sits (a `finished` time on a queued task, say) are dropped.
   paperwork/STATE-FORMAT.md is the full description.
   ========================================================================== */

QDF.serialize = (function () {
  var U = QDF.util;

  /* [property, yaml key, kind] in document order. */
  var FIELDS = [
    ['id', 'id', 'text'],
    ['title', 'title', 'text'],
    ['notes', 'notes', 'text'],
    ['created', 'created', 'time'],
    ['started', 'started', 'time'],
    ['focusedSince', 'focused_since', 'time'],
    ['backgroundSince', 'background_since', 'time'],
    ['finished', 'finished', 'time'],
    ['focusSeconds', 'focus_seconds', 'seconds'],
    ['backgroundSeconds', 'background_seconds', 'seconds']
  ];

  /* Which live-stretch field a task may carry, by where it sits. */
  var OWN = {
    current: 'focusedSince',
    background: 'backgroundSince',
    done: 'finished',
    queue: null
  };

  function itemToDoc(item) {
    var o = {};
    FIELDS.forEach(function (f) {
      var v = item[f[0]];
      if (v === undefined || v === null || v === '') return;
      if (f[2] === 'seconds' && !v) return;
      o[f[1]] = v;
    });
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
    '# queue: the first entry is up next. Times are ISO 8601 (UTC);\n' +
    '# *_seconds hold time banked from earlier stretches.\n';

  function toYaml(s, now) {
    return HEADER + QDF.yaml.emit(toDoc(s, now), true);
  }

  /* ------------------------------------------------------------- import */

  function isMap(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function itemFromDoc(raw, where, now, seen, warnings, position) {
    if (typeof raw === 'string' || typeof raw === 'number') raw = { title: String(raw) };
    if (!isMap(raw)) {
      warnings.push('Skipped an entry in ' + position + ' that is not a task.');
      return null;
    }
    var item = {};
    FIELDS.forEach(function (f) {
      var v = raw[f[1]];
      if (v === undefined || v === null) return;
      if (f[2] === 'text') {
        if (typeof v === 'object') return;
        item[f[0]] = String(v);
      } else if (f[2] === 'time') {
        if (v instanceof Date) v = v.toISOString();
        if (U.isTime(String(v))) item[f[0]] = new Date(U.ms(String(v))).toISOString();
        else warnings.push('Ignored an unreadable ' + f[1] + ' time in ' + position + '.');
      } else {
        var n = Number(v);
        if (isFinite(n) && n > 0) item[f[0]] = Math.round(n);
      }
    });

    item.title = String(item.title || '').replace(/\s+/g, ' ').trim() || 'Untitled task';
    item.notes = String(item.notes || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    item.focusSeconds = item.focusSeconds || 0;
    item.backgroundSeconds = item.backgroundSeconds || 0;
    if (!item.created) item.created = item.started || U.iso(now);

    if (!item.id || !/^[\w.:-]{1,80}$/.test(item.id)) item.id = U.uid(now);
    while (seen[item.id]) item.id = U.uid(now) + '-' + Object.keys(seen).length;
    seen[item.id] = true;

    /* Only the field that belongs to this position survives. */
    ['focusedSince', 'backgroundSince', 'finished'].forEach(function (k) {
      if (k !== OWN[where]) delete item[k];
    });
    if (where === 'current') {
      if (!item.focusedSince) item.focusedSince = U.iso(now);
      if (!item.started) item.started = item.focusedSince;
    } else if (where === 'background') {
      if (!item.backgroundSince) item.backgroundSince = U.iso(now);
      if (!item.started) item.started = item.backgroundSince;
    } else if (where === 'done') {
      if (!item.finished) item.finished = U.iso(now);
      if (!item.started) item.started = item.finished;
    }
    return item;
  }

  function list(doc, key, now, seen, warnings) {
    var v = doc[key];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      warnings.push('Ignored "' + key + '" because it is not a list.');
      return [];
    }
    return v.map(function (raw, n) {
      return itemFromDoc(raw, key, now, seen, warnings, key + ' #' + (n + 1));
    }).filter(Boolean);
  }

  /* Returns { state, warnings }. Throws when the document cannot be a state
     at all, with a message meant for the person importing it. */
  function fromDocDetailed(doc, now) {
    if (!isMap(doc)) {
      throw new Error('This does not look like a ' + QDF.APP.name + ' state: expected keys such as "current" and "queue" at the top level.');
    }
    var format = doc.format;
    if (format !== undefined && format !== null) {
      var m = /^qdvc-focus\/(\d+)$/.exec(String(format));
      if (!m) throw new Error('Unrecognised format "' + format + '"; expected ' + QDF.APP.format + '.');
      if (Number(m[1]) > 1) throw new Error('This file was written by a newer version (' + format + ').');
    } else if (!('current' in doc) && !('queue' in doc) && !('background' in doc) && !('done' in doc)) {
      throw new Error('This does not look like a ' + QDF.APP.name + ' state: none of "current", "queue", "background" or "done" are present.');
    }

    var warnings = [], seen = {};
    var s = QDF.model.newState(now);
    if (U.isTime(String(doc.created || ''))) s.created = new Date(U.ms(String(doc.created))).toISOString();
    if (U.isTime(String(doc.last_interaction || ''))) {
      s.lastInteraction = new Date(U.ms(String(doc.last_interaction))).toISOString();
    }

    var cur = doc.current;
    if (Array.isArray(cur)) {
      warnings.push('"current" holds a list; the first entry is in focus and the rest were queued.');
      s.current = cur.length ? itemFromDoc(cur[0], 'current', now, seen, warnings, 'current') : null;
      s.queue = cur.slice(1).map(function (raw, n) {
        return itemFromDoc(raw, 'queue', now, seen, warnings, 'current #' + (n + 2));
      }).filter(Boolean);
    } else if (cur !== undefined && cur !== null && cur !== '') {
      s.current = itemFromDoc(cur, 'current', now, seen, warnings, 'current');
    }
    s.queue = s.queue.concat(list(doc, 'queue', now, seen, warnings));
    s.background = list(doc, 'background', now, seen, warnings);
    s.done = list(doc, 'done', now, seen, warnings);
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
