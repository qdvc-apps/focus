/* The YAML subset: everything emitted must parse back to the same value,
   hand-written variants must parse, and malformed input must fail with a
   line number rather than be misread. */
import { load, suite } from './harness.mjs';

const QDF = load();
const Y = QDF.yaml;
const t = suite('test-yaml');

function roundTrip(label, value) {
  t.check(`round trip: ${label}`, () => {
    const text = Y.emit({ v: value });
    t.eq(Y.parse(text), { v: value }, text);
  });
}

[
  ['plain', 'hello world'],
  ['empty string', ''],
  ['colon space', 'a: b'],
  ['trailing colon', 'ends with:'],
  ['hash after space', 'PR #482'],
  ['leading hash', '#tag'],
  ['leading dash', '- not a list'],
  ['leading space', '  indented'],
  ['trailing space', 'space after '],
  ['double quotes', 'say "hi"'],
  ['single quotes', "it's"],
  ['backslash', 'C:\\temp\\new'],
  ['reserved true', 'true'],
  ['reserved no', 'no'],
  ['reserved null', 'null'],
  ['tilde', '~'],
  ['numeric string', '007'],
  ['float string', '1.50'],
  ['exponent string', '1e3'],
  ['unicode', 'Café — ✓ 日本'],
  ['emoji', 'ship it 🚀'],
  ['iso time', '2026-10-21T09:00:00.000Z'],
  ['url', 'https://example.com/a?b=c#d'],
  ['brackets', '[not a list]'],
  ['braces', '{not a map}'],
  ['tab inside', 'a\tb'],
  ['multiline', 'line one\nline two'],
  ['multiline trailing newline', 'line one\nline two\n'],
  ['multiline two trailing newlines', 'a\nb\n\n'],
  ['multiline leading newline', '\nstarts blank'],
  ['multiline blank middle', 'a\n\nb'],
  ['multiline whitespace line', 'a\n   \nb'],
  ['multiline leading space', ' a\nb'],
  ['multiline with colons and hashes', 'key: value\n# not a comment\n- not a list'],
  ['CR', 'a\rb'],
  ['control', 'bell\u0007'],
  ['number', 42],
  ['zero', 0],
  ['negative float', -3.25],
  ['true', true],
  ['false', false],
  ['null', null],
  ['empty list', []],
  ['empty map', {}],
  ['list of scalars', ['a', 'b: c', '', 3, null, 'x\ny']],
  ['list of maps', [{ id: 'a', notes: 'one\ntwo' }, { id: 'b' }]],
  ['nested lists', [['a', 'b'], []]],
  ['nested map', { a: { b: { c: 'deep' } } }],
  ['odd keys', { 'with space': 1, 'colon: key': 2, '': 3 }]
].forEach(([label, value]) => roundTrip(label, value));

t.check('emit is deterministic and puts blank lines between multi-line keys', () => {
  const text = Y.emit({ a: 1, b: { c: 2 }, d: 3, e: [] }, true);
  t.eq(text, 'a: 1\n\nb:\n  c: 2\n\nd: 3\ne: []\n');
});

t.check('hand-written variants', () => {
  const text = [
    '\uFEFF---',
    '# a comment',
    'format: qdvc-focus/1   # trailing comment',
    '',
    'current:',
    "  title: 'It''s quoted'",
    '  notes: >',
    '    folded',
    '    text',
    '',
    '    new paragraph',
    'queue:',
    '- title: same indent as key',
    '  focus_seconds: 60',
    '-   title: extra spaces',
    '- plain string task',
    'background: ~',
    'done: [a, "b, c", 3]',
    '...',
    ''
  ].join('\r\n');
  t.eq(Y.parse(text), {
    format: 'qdvc-focus/1',
    current: { title: "It's quoted", notes: 'folded text\nnew paragraph\n' },
    queue: [
      { title: 'same indent as key', focus_seconds: 60 },
      { title: 'extra spaces' },
      'plain string task'
    ],
    background: null,
    done: ['a', 'b, c', 3]
  });
});

t.check('block chomping indicators', () => {
  t.eq(Y.parse('a: |\n  x\n  y\n\n\nb: 1\n'), { a: 'x\ny\n', b: 1 });
  t.eq(Y.parse('a: |-\n  x\n  y\n'), { a: 'x\ny' });
  t.eq(Y.parse('a: |+\n  x\n\n\nb: 1\n'), { a: 'x\n\n\n', b: 1 });
  t.eq(Y.parse('a: |\n'), { a: '' });
});

t.check('escapes in double quotes', () => {
  t.eq(Y.parse('a: "tab\\there \\u00e9 \\x41 \\U0001F680 \\"q\\""\n'), { a: 'tab\there é A 🚀 "q"' });
});

t.check('empty document parses to null', () => {
  t.eq(Y.parse(''), null);
  t.eq(Y.parse('# only a comment\n\n'), null);
});

[
  ['bad indentation', 'a:\n  b: 1\n   c: 2\n', /Line 3: Unexpected indentation/],
  ['tab indentation', 'a:\n\tb: 1\n', /Line 2: Tabs/],
  ['not a mapping line', 'a: 1\njust words\n', /Line 2: Expected "key: value"/],
  ['duplicate key', 'a: 1\na: 2\n', /Line 2: Duplicate key "a"/],
  ['unclosed double quote', 'a: "open\n', /Line 1: Unclosed double quote/],
  ['unclosed single quote', "a: 'open\n", /Unclosed single quote/],
  ['text after quote', 'a: "x" y\n', /Unexpected text after a quoted value/],
  ['anchor', 'a: &x 1\n', /Anchors/],
  ['alias', 'a: *x\n', /Anchors/],
  ['flow map', 'a: {b: 1}\n', /Inline \{…\} mappings/],
  ['two documents', 'a: 1\n---\nb: 2\n', /Only one document|Unexpected content/],
  ['bad escape', 'a: "\\q"\n', /Unknown escape/],
  ['trailing junk', '- a\nb: 1\n', /Unexpected content/]
].forEach(([label, text, pattern]) => {
  t.check(`rejects: ${label}`, () => t.throws(() => Y.parse(text), pattern, label));
});

t.done();
