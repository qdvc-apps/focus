/* Every file in examples/ must import without warnings and re-export to the
   same bytes, so the examples double as a reference for the format. */
import fs from 'node:fs';
import path from 'node:path';
import { load, suite, ROOT } from './harness.mjs';

const t = suite('test-example');
const QDF = load();
const dir = path.join(ROOT, 'examples');
const files = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f));

t.check('there is at least one example', () => t.ok(files.length > 0));

for (const f of files) {
  t.check(`${f} imports cleanly and round-trips`, () => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const saved = Date.parse(QDF.yaml.parse(text).saved);
    t.ok(!isNaN(saved), 'needs a saved time');
    const r = QDF.serialize.fromYaml(text, saved);
    t.eq(r.warnings, []);
    t.ok(QDF.serialize.toYaml(r.state, saved) === text, 're-export differs from the file');
  });
}

t.done();
