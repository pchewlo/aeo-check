import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { RULES } from '../src/rules/index.js';
import { SOURCES } from '../src/sources.js';

const testDir = new URL('./', import.meta.url);
const testText = [
  ...readdirSync(new URL('./rules/', testDir)).map((f) => readFileSync(new URL(`./rules/${f}`, testDir), 'utf8')),
  ...readdirSync(testDir).filter((f) => f.endsWith('.test.js') && f !== 'coverage.test.js').map((f) => readFileSync(new URL(f, testDir), 'utf8')),
].join('\n');

test('every rule has a test that names it', () => {
  const missing = RULES.filter((r) => !testText.includes(`'${r.id}'`) && !testText.includes(`${r.id}:`));
  assert.deepEqual(missing.map((r) => r.id), []);
});

test('every rule is well formed and cites known sources', () => {
  const ids = new Set();
  for (const r of RULES) {
    assert.match(r.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
    ids.add(r.id);
    assert.ok(['error', 'warn', 'info'].includes(r.severity), r.id);
    assert.ok(['site', 'page', 'markup'].includes(r.scope), r.id);
    assert.ok(r.title && r.rationale && r.fix, r.id);
    assert.equal(typeof r.check, 'function');
    assert.ok(r.sources.length > 0, r.id);
    for (const s of r.sources) assert.ok(SOURCES[s], `${r.id} cites unknown source ${s}`);
  }
  assert.ok(RULES.length >= 25);
});
