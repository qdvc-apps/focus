/* ==========================================================================
   15-yaml.js — a small, strict YAML subset, emitted and parsed by hand.

   Emits block mappings, block sequences (of scalars or of mappings), plain and
   double-quoted scalars, and `|` / `|-` literal blocks for multi-line text.
   Output is deterministic: key order is insertion order.

   Parses everything it emits, plus the hand edits people actually make:
   comments, blank lines, a leading `---`, CRLF line endings, single-quoted
   strings, `~` for null, `[]` / `{}` and one-line `[a, b]` lists, sequences
   written at the same indentation as their key, and `>` folded blocks.
   Anchors, tags, multi-document streams and flow mappings are not supported
   and are reported as errors rather than misread.
   ========================================================================== */

QDF.yaml = (function () {

  /* ---------------------------------------------------------------- emit */

  function spaces(n) {
    return new Array(n + 1).join(' ');
  }

  function isMap(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  var RESERVED = /^(true|false|yes|no|on|off|null|~|y|n)$/i;
  var NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$|^0x[0-9a-f]+$|^[+-]?\.(inf|nan)$/i;

  function scalar(v) {
    if (v === null) return 'null';
    if (v === true || v === false) return String(v);
    if (typeof v === 'number') return isFinite(v) ? String(v) : JSON.stringify(String(v));
    var s = String(v);
    if (s === '' ||
        /^[\s\-?:,\[\]{}#&*!|>'"%@`]/.test(s) ||
        /\s$/.test(s) ||
        /:(\s|$)/.test(s) ||
        /\s#/.test(s) ||
        /[\u0000-\u001f\u007f]/.test(s) ||
        RESERVED.test(s) ||
        NUMERIC.test(s)) {
      return JSON.stringify(s);
    }
    return s;
  }

  function keyText(k) {
    return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(k) ? k : JSON.stringify(String(k));
  }

  /* Multi-line text reads best as a literal block, but only when the block
     can be read back exactly: no tabs or CRs, no whitespace-only lines, no
     leading space on the first line, at most one trailing newline. */
  function blockable(s) {
    if (typeof s !== 'string' || s.indexOf('\n') === -1) return false;
    if (/[\r\t]/.test(s) || /\n\n$/.test(s) || /^\n/.test(s)) return false;
    if (/^ /.test(s)) return false;
    if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s)) return false;
    var lines = s.replace(/\n$/, '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s+$/.test(lines[i])) return false;
    }
    return true;
  }

  function emitValue(prefix, v, indent, out) {
    if (blockable(v)) {
      var trailing = /\n$/.test(v);
      out.push(prefix + ' ' + (trailing ? '|' : '|-'));
      (trailing ? v.slice(0, -1) : v).split('\n').forEach(function (line) {
        out.push(line === '' ? '' : spaces(indent + 2) + line);
      });
    } else {
      out.push(prefix + ' ' + scalar(v));
    }
  }

  function hasKeys(obj) {
    return Object.keys(obj).some(function (k) { return obj[k] !== undefined; });
  }

  function emitMap(obj, indent, out) {
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === undefined) return;
      var head = spaces(indent) + keyText(k) + ':';
      if (Array.isArray(v)) {
        if (!v.length) { out.push(head + ' []'); return; }
        out.push(head);
        emitSeq(v, indent + 2, out);
      } else if (isMap(v)) {
        if (!hasKeys(v)) { out.push(head + ' {}'); return; }
        out.push(head);
        emitMap(v, indent + 2, out);
      } else {
        emitValue(head, v, indent, out);
      }
    });
  }

  function emitSeq(arr, indent, out) {
    arr.forEach(function (item) {
      var dash = spaces(indent) + '-';
      if (isMap(item) && hasKeys(item)) {
        var tmp = [];
        emitMap(item, indent + 2, tmp);
        tmp[0] = dash + ' ' + tmp[0].slice(indent + 2);
        Array.prototype.push.apply(out, tmp);
      } else if (isMap(item)) {
        out.push(dash + ' {}');
      } else if (Array.isArray(item) && item.length) {
        out.push(dash);
        emitSeq(item, indent + 2, out);
      } else if (Array.isArray(item)) {
        out.push(dash + ' []');
      } else {
        emitValue(dash, item, indent, out);
      }
    });
  }

  /* `blankBetween` puts an empty line between top-level keys whose value
     spans several lines, which makes a long file far easier to scan. */
  function emit(doc, blankBetween) {
    var out = [];
    if (!isMap(doc)) throw new Error('emit expects a mapping at the top level');
    var keys = Object.keys(doc).filter(function (k) { return doc[k] !== undefined; });
    var lastMulti = false;
    keys.forEach(function (k, n) {
      var chunk = {};
      chunk[k] = doc[k];
      var lines = [];
      emitMap(chunk, 0, lines);
      if (blankBetween && n > 0 && (lines.length > 1 || lastMulti)) out.push('');
      lastMulti = lines.length > 1;
      Array.prototype.push.apply(out, lines);
    });
    return out.join('\n') + '\n';
  }

  /* --------------------------------------------------------------- parse */

  function parse(text) {
    var lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    var i = 0;
    var at = null;   /* the line a scalar being read came from */

    function fail(message, lineIndex) {
      var n = (lineIndex !== undefined ? lineIndex : at !== null ? at : i) + 1;
      var err = new Error('Line ' + n + ': ' + message);
      err.line = n;
      throw err;
    }

    function isSkippable(line) {
      return /^\s*(#.*)?$/.test(line);
    }

    function indentOf(line) {
      var m = /^( *)(\t?)/.exec(line);
      if (m[2]) fail('Tabs cannot be used for indentation; use spaces.');
      return m[1].length;
    }

    function skip() {
      while (i < lines.length && isSkippable(lines[i])) i++;
    }

    function isDash(body) {
      return body === '-' || body.slice(0, 2) === '- ';
    }

    /* Reads a quoted scalar starting at s[0]; returns { value, end }. */
    function readQuoted(s) {
      var q = s.charAt(0), out = '', j = 1;
      if (q === "'") {
        while (j < s.length) {
          var c = s.charAt(j);
          if (c === "'") {
            if (s.charAt(j + 1) === "'") { out += "'"; j += 2; continue; }
            return { value: out, end: j + 1 };
          }
          out += c; j++;
        }
        fail('Unclosed single quote.');
      }
      var ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\u0000',
                  b: '\b', f: '\f', e: '\u001b', a: '\u0007', v: '\u000b', ' ': ' ' };
      while (j < s.length) {
        var ch = s.charAt(j);
        if (ch === '"') return { value: out, end: j + 1 };
        if (ch === '\\') {
          var nx = s.charAt(j + 1);
          if (nx === 'u' || nx === 'x' || nx === 'U') {
            var len = nx === 'u' ? 4 : nx === 'x' ? 2 : 8;
            var hex = s.substr(j + 2, len);
            if (!new RegExp('^[0-9a-fA-F]{' + len + '}$').test(hex)) fail('Bad escape \\' + nx + hex + '.');
            var code = parseInt(hex, 16);
            out += code > 0xffff
              ? String.fromCharCode(0xd800 + ((code - 0x10000) >> 10), 0xdc00 + ((code - 0x10000) & 0x3ff))
              : String.fromCharCode(code);
            j += 2 + len;
            continue;
          }
          if (!Object.prototype.hasOwnProperty.call(ESC, nx)) fail('Unknown escape \\' + nx + '.');
          out += ESC[nx];
          j += 2;
          continue;
        }
        out += ch; j++;
      }
      fail('Unclosed double quote.');
    }

    function afterQuoted(rest) {
      if (!/^\s*(#.*)?$/.test(rest)) fail('Unexpected text after a quoted value: ' + rest.trim());
    }

    function parseScalar(raw) {
      var s = raw.trim();
      if (s.charAt(0) === '"' || s.charAt(0) === "'") {
        var q = readQuoted(s);
        afterQuoted(s.slice(q.end));
        return q.value;
      }
      s = s.replace(/(^|\s)#.*$/, '').trim();
      if (/^[&*!]/.test(s)) fail('Anchors, aliases and tags are not supported.');
      if (s === '' || s === '~' || /^null$/i.test(s)) return null;
      if (/^true$/i.test(s)) return true;
      if (/^false$/i.test(s)) return false;
      if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
      if (s === '[]') return [];
      if (s === '{}') return {};
      if (s.charAt(0) === '[') {
        if (s.charAt(s.length - 1) !== ']') fail('Unclosed [ list.');
        return splitFlow(s.slice(1, -1)).map(parseScalar);
      }
      if (s.charAt(0) === '{') fail('Inline {…} mappings are not supported; write one key per line.');
      return s;
    }

    function splitFlow(inner) {
      var parts = [], cur = '', quote = '';
      for (var j = 0; j < inner.length; j++) {
        var c = inner.charAt(j);
        if (quote) {
          cur += c;
          if (c === '\\' && quote === '"') { cur += inner.charAt(++j); continue; }
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") { quote = c; cur += c; }
        else if (c === ',') { parts.push(cur); cur = ''; }
        else if (c === '[' || c === '{') fail('Nested inline lists are not supported.');
        else cur += c;
      }
      if (cur.trim() !== '' || parts.length) parts.push(cur);
      return parts.filter(function (p, n) { return p.trim() !== '' || n < parts.length - 1; });
    }

    /* "key: rest" → { key, rest } or null when the text is not a mapping
       entry. A colon only separates when followed by a space or the end. */
    function splitKey(body) {
      var key, rest;
      if (body.charAt(0) === '"' || body.charAt(0) === "'") {
        var q = readQuoted(body);
        var after = body.slice(q.end);
        var m = /^\s*:(\s+|$)/.exec(after);
        if (!m) return null;
        key = q.value;
        rest = after.slice(m[0].length);
      } else {
        if (body.charAt(0) === '#') return null;
        var at = -1;
        for (var j = 0; j < body.length; j++) {
          if (body.charAt(j) === ':' && (j === body.length - 1 || /\s/.test(body.charAt(j + 1)))) { at = j; break; }
          if (body.charAt(j) === '#' && j > 0 && /\s/.test(body.charAt(j - 1))) break;
        }
        if (at < 1) return null;
        key = body.slice(0, at).trim();
        rest = body.slice(at + 1);
        if (key.charAt(0) === '?') fail('Complex keys are not supported.');
      }
      return { key: key, rest: rest.trim() };
    }

    function parseBlock(parentIndent, indicator) {
      var folded = indicator.charAt(0) === '>';
      var chomp = indicator.charAt(1) || '';
      var raw = [], blockIndent = -1;
      while (i < lines.length) {
        var line = lines[i];
        if (/^\s*$/.test(line)) { raw.push(''); i++; continue; }
        var ind = indentOf(line);
        if (ind <= parentIndent) break;
        if (blockIndent < 0) blockIndent = ind;
        if (ind < blockIndent) fail('This line is indented less than the text block it belongs to.');
        raw.push(line.slice(blockIndent));
        i++;
      }
      var trailing = 0;
      while (raw.length && raw[raw.length - 1] === '') { raw.pop(); trailing++; }
      if (!raw.length) return '';
      var body;
      if (folded) {
        body = '';
        raw.forEach(function (l, n) {
          if (n === 0) body = l;
          else if (l === '') body += '\n';
          else if (raw[n - 1] === '' || /^\s/.test(l)) body += (/\n$/.test(body) ? '' : '\n') + l;
          else body += ' ' + l;
        });
      } else {
        body = raw.join('\n');
      }
      if (chomp === '-') return body;
      if (chomp === '+') return body + '\n' + new Array(trailing + 1).join('\n');
      return body + '\n';
    }

    function parseNode(minIndent) {
      skip();
      if (i >= lines.length) return null;
      var ind = indentOf(lines[i]);
      if (ind < minIndent) return null;
      return isDash(lines[i].slice(ind)) ? parseSeq(ind) : parseMap(ind);
    }

    function parseValue(rest, ownIndent, lineIndex) {
      if (/^[|>][-+]?\s*(#.*)?$/.test(rest)) return parseBlock(ownIndent, rest.replace(/\s*#.*$/, '').trim());
      var saved = at;
      at = lineIndex;
      try {
        if (/^[|>]/.test(rest)) fail('Unsupported block indicator ' + rest + '.');
        return parseScalar(rest);
      } finally {
        at = saved;
      }
    }

    function parseSeq(ind) {
      var out = [];
      for (;;) {
        skip();
        if (i >= lines.length) break;
        var li = indentOf(lines[i]);
        var body = lines[i].slice(li);
        if (li < ind) break;
        if (li > ind) fail('Unexpected indentation.');
        if (!isDash(body)) break;
        var rest = body === '-' ? '' : body.slice(2);
        var restTrim = rest.replace(/^ +/, '');
        var itemIndent = li + 2 + (rest.length - restTrim.length);
        if (restTrim === '' || restTrim.charAt(0) === '#') {
          i++;
          out.push(parseNode(li + 1));
        } else if (isDash(restTrim)) {
          lines[i] = spaces(itemIndent) + restTrim;
          out.push(parseSeq(itemIndent));
        } else if (splitKey(restTrim)) {
          lines[i] = spaces(itemIndent) + restTrim;
          out.push(parseMap(itemIndent));
        } else {
          i++;
          out.push(parseValue(restTrim, li, i - 1));
        }
      }
      return out;
    }

    function parseMap(ind) {
      var out = {};
      for (;;) {
        skip();
        if (i >= lines.length) break;
        var li = indentOf(lines[i]);
        var body = lines[i].slice(li);
        if (li < ind) break;
        if (li > ind) fail('Unexpected indentation.');
        if (isDash(body)) break;
        if (li === 0 && /^\.\.\.\s*$/.test(body)) break;
        if (li === 0 && /^---(\s|$)/.test(body)) fail('Only one document per file is supported.');
        var kv = splitKey(body);
        if (!kv) fail('Expected "key: value" but found: ' + body);
        if (Object.prototype.hasOwnProperty.call(out, kv.key)) fail('Duplicate key "' + kv.key + '".');
        var lineIndex = i;
        i++;
        if (kv.rest === '' || kv.rest.charAt(0) === '#') {
          skip();
          if (i < lines.length) {
            var ni = indentOf(lines[i]);
            var nb = lines[i].slice(ni);
            if (ni > li) out[kv.key] = parseNode(ni);
            else if (ni === li && isDash(nb)) out[kv.key] = parseSeq(ni);
            else out[kv.key] = null;
          } else {
            out[kv.key] = null;
          }
        } else {
          out[kv.key] = parseValue(kv.rest, li, lineIndex);
        }
      }
      return out;
    }

    skip();
    if (i < lines.length && /^---\s*(#.*)?$/.test(lines[i])) { i++; }
    var result = parseNode(0);
    skip();
    if (i < lines.length && /^\.\.\.\s*$/.test(lines[i])) { i++; skip(); }
    if (i < lines.length) fail('Unexpected content: ' + lines[i].trim());
    return result;
  }

  return { emit: emit, parse: parse, scalar: scalar };
})();
