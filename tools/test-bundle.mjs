/* Checks the page that actually ships: built from the current sources, one
   style and one script block, and the script evaluates under strict mode with
   every module present. Run after `sh build.sh`. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { makeContext, suite, ROOT, sources } from './harness.mjs';

const t = suite('test-bundle');
const file = path.join(ROOT, 'docs', 'index.html');

t.check('docs/index.html exists', () => t.ok(fs.existsSync(file), 'run sh build.sh first'));
const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

t.check('one style block and one script block', () => {
  t.eq((html.match(/<style>/g) || []).length, 1, 'style blocks');
  t.eq((html.match(/<script>/g) || []).length, 1, 'script blocks');
  t.eq((html.match(/<\/script>/g) || []).length, 1, 'script closers');
});

t.check('document structure', () => {
  t.ok(/^<!DOCTYPE html>/.test(html));
  t.ok(html.indexOf('</head>') > html.indexOf('</style>'), 'styles are in the head');
  t.ok(html.indexOf('<script>') > html.indexOf('id="statusbar"'), 'script after the markup');
  t.ok(/<\/html>\s*$/.test(html));
});

t.check('no external resources', () => {
  t.ok(!/<(script|link)[^>]+(src|href)="https?:/i.test(html), 'fetches something at run time');
  t.ok(!/@import|url\(["']?https?:/i.test(html), 'stylesheet fetches something');
});

const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';

t.check('built script matches the sources (rebuild after editing src/)', () => {
  const body = script.replace(/\/\* ---------- src\/js\/[^*]+ ---------- \*\/\n/g, '');
  const expected = sources().replace(/\/\* src\/js\/[^*]+ \*\/\n/g, '');
  t.ok(body.replace(/\s+/g, '') === ('"use strict";' + expected).replace(/\s+/g, ''), 'docs/index.html is stale');
});

t.check('script evaluates under strict mode', () => {
  const ctx = makeContext();
  vm.runInContext(script + '\n;globalThis.QDF = QDF;', ctx, { filename: 'docs/index.html' });
  const QDF = ctx.QDF;
  for (const key of ['APP', 'util', 'yaml', 'model', 'store', 'serialize', 'ui', 'view', 'editor', 'transfer', 'about', 'keys', 'app']) {
    t.ok(QDF[key], 'missing QDF.' + key);
  }
  t.eq(QDF.APP.format, 'qdvc-focus/1');
});

t.check('.nojekyll is present for GitHub Pages', () => {
  t.ok(fs.existsSync(path.join(ROOT, 'docs', '.nojekyll')));
});

t.done();
