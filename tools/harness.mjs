/* Loads the application's JavaScript into a sandbox for the development
   checks. The DOM stub is deliberately thin: enough for every module to load
   and for the pure views to be called, not a browser. The controller only
   boots on DOMContentLoaded, which the stub never fires. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function sources() {
  const dir = path.join(ROOT, 'src', 'js');
  return fs.readdirSync(dir).sort()
    .filter(f => f.endsWith('.js'))
    .map(f => `/* src/js/${f} */\n` + fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
}

export function memoryStorage() {
  const data = new Map();
  return {
    failWrites: false,
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) {
      if (this.failWrites) throw new Error('QuotaExceededError');
      data.set(k, String(v));
    },
    removeItem(k) { data.delete(k); },
    keys() { return [...data.keys()]; }
  };
}

function stubElement() {
  return {
    style: {}, dataset: {}, children: [], innerHTML: '', textContent: '', value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild(c) { this.children.push(c); return c; }, removeChild(c) { return c; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, click() {}
  };
}

export function makeContext(storage) {
  const document = {
    readyState: 'loading',
    title: '',
    body: stubElement(),
    activeElement: null,
    createElement: stubElement,
    getElementById: () => stubElement(),
    querySelector: () => stubElement(),
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };
  const window = {
    localStorage: storage || memoryStorage(),
    addEventListener() {},
    innerWidth: 1440,
    innerHeight: 900
  };
  const ctx = {
    console, Date, Math, JSON, Number, String, Array, Object, RegExp, Error, isFinite, isNaN, parseInt,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    document, window, navigator: {}, Blob: class {}, URL: {}
  };
  vm.createContext(ctx);
  return ctx;
}

/* Returns the QDF namespace, freshly loaded. */
export function load(storage, code) {
  const ctx = makeContext(storage);
  vm.runInContext('"use strict";\n' + (code || sources()) + '\n;globalThis.QDF = QDF;', ctx, { filename: 'qdvc-focus.js' });
  return ctx.QDF;
}

/* A tiny assertion kit: no framework, readable failures, a summary. */
export function suite(name) {
  let passed = 0, failed = 0;
  const trace = process.env.QDF_TRACE === '1';
  function check(label, fn) {
    try {
      fn();
      passed++;
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${label}\n        ${e.message}`);
      if (trace) console.log(e.stack);
    }
  }
  function eq(actual, expected, what) {
    const a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${what || 'value'}: expected ${b}, got ${a}`);
  }
  function ok(value, what) {
    if (!value) throw new Error(what || 'expected a truthy value');
  }
  function throws(fn, pattern, what) {
    let threw = null;
    try { fn(); } catch (e) { threw = e; }
    if (!threw) throw new Error(`${what || 'call'} should have thrown`);
    if (pattern && !pattern.test(threw.message)) throw new Error(`${what || 'error'}: "${threw.message}" does not match ${pattern}`);
  }
  function done() {
    console.log(`${name}: ${passed} passed${failed ? `, ${failed} FAILED` : ''}`);
    if (failed) process.exitCode = 1;
  }
  return { check, eq, ok, throws, done };
}
