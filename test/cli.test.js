import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';

const FIX = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CLEAN = join(FIX, 'clean-site');
const NEXT = join(FIX, 'next-app');

async function run(args) {
  let out = '', err = '';
  const stdout = { write: (s) => { out += s; }, isTTY: false };
  const stderr = { write: (s) => { err += s; } };
  const code = await main(args, { stdout, stderr, env: {} });
  return { code, out, err };
}

test('cli: clean site passes, problem site fails', async () => {
  const clean = await run([CLEAN]);
  assert.equal(clean.code, 0);
  assert.match(clean.out, /Overall 100\/100/);
  const bad = await run([NEXT]);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /client-only-content/);
  assert.match(bad.out, /why: /);
  assert.match(bad.out, /fix: /);
});

test('cli: --fail-on and --rule change the exit code', async () => {
  assert.equal((await run([NEXT, '--fail-on', 'none'])).code, 0);
  assert.equal((await run([NEXT, '--rule', 'robots-ai-search=off', '--rule', 'client-only-content=warn'])).code, 0);
  assert.equal((await run([CLEAN, '--fail-on', 'info'])).code, 1);
});

test('cli: json output', async () => {
  const { out } = await run([NEXT, '--format', 'json']);
  const j = JSON.parse(out);
  assert.equal(j.tool, 'aeo-check');
  assert.equal(typeof j.overall, 'number');
  assert.ok(j.counts.error >= 2);
  const pricing = j.pages.find((p) => p.route === '/pricing');
  assert.ok(pricing.findings.some((f) => f.ruleId === 'client-only-content' && f.line === 6 && f.why && f.fix && f.sources.length));
});

test('cli: sarif output', async () => {
  const { out } = await run([NEXT, '--format', 'sarif']);
  const s = JSON.parse(out);
  assert.equal(s.version, '2.1.0');
  const run0 = s.runs[0];
  assert.equal(run0.tool.driver.name, 'aeo-check');
  const r = run0.results.find((x) => x.ruleId === 'client-only-content');
  assert.equal(r.level, 'error');
  assert.equal(r.locations[0].physicalLocation.artifactLocation.uri, 'test/fixtures/next-app/app/pricing/page.tsx');
  assert.equal(r.locations[0].physicalLocation.region.startLine, 6);
  assert.equal(run0.tool.driver.rules[r.ruleIndex].id, 'client-only-content');
});

test('cli: github annotations and markdown summary', async () => {
  const gh = await run([NEXT, '--format', 'github']);
  assert.match(gh.out, /^::error file=test\/fixtures\/next-app\/app\/pricing\/page\.tsx,line=6,title=aeo-check client-only-content::/m);
  const md = await run([NEXT, '--format', 'markdown']);
  assert.match(md.out, /### aeo-check: \d+\/100/);
  assert.match(md.out, /\| error \| `client-only-content` \|/);
});

test('cli: extra report files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aeo-'));
  try {
    await run([NEXT, '--quiet', '--sarif-output', join(dir, 'a.sarif'), '--markdown-output', join(dir, 'a.md')]);
    assert.equal(JSON.parse(readFileSync(join(dir, 'a.sarif'), 'utf8')).version, '2.1.0');
    assert.match(readFileSync(join(dir, 'a.md'), 'utf8'), /aeo-check/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cli: passing files limits findings to those files', async () => {
  const scoped = await run([NEXT, join(NEXT, 'components/Nav.tsx'), '--format', 'json']);
  const j = JSON.parse(scoped.out);
  const all = [...j.site.findings, ...j.files.flatMap((f) => f.findings), ...j.pages.flatMap((p) => p.findings)];
  assert.ok(all.length > 0);
  assert.ok(all.every((f) => f.file === 'components/Nav.tsx'));
});

test('cli: --since reports only changed files, and config files are read', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aeo-'));
  try {
    cpSync(NEXT, dir, { recursive: true });
    const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    git('init', '-q');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
    writeFileSync(join(dir, 'app/page.tsx'), readFileSync(join(dir, 'app/page.tsx'), 'utf8').replace('<h1>Acme analytics</h1>', '<h1>Acme analytics</h1><img src="/x.png" />'));
    const r = await run([dir, '--since', 'HEAD', '--format', 'json']);
    const j = JSON.parse(r.out);
    const all = [...j.site.findings, ...j.files.flatMap((f) => f.findings), ...j.pages.flatMap((p) => p.findings)];
    assert.ok(all.some((f) => f.ruleId === 'img-alt'));
    assert.ok(all.every((f) => f.file === 'app/page.tsx'));
    writeFileSync(join(dir, '.aeo-check.json'), JSON.stringify({ rules: { 'img-alt': 'off' }, failOn: 'none' }));
    const c = await run([dir, '--since', 'HEAD', '--format', 'json']);
    assert.equal(c.code, 0);
    assert.ok(!JSON.parse(c.out).pages.flatMap((p) => p.findings).some((f) => f.ruleId === 'img-alt'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cli: --changed-files limits the report, and an empty list reports nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aeo-'));
  try {
    writeFileSync(join(dir, 'list.txt'), `${join(NEXT, 'app/pricing/page.tsx')}\n`);
    const r = await run([NEXT, '--changed-files', join(dir, 'list.txt'), '--format', 'json']);
    const j = JSON.parse(r.out);
    assert.deepEqual(j.pages.map((p) => p.route), ['/pricing']);
    writeFileSync(join(dir, 'empty.txt'), '');
    const e = await run([NEXT, '--changed-files', join(dir, 'empty.txt'), '--format', 'json']);
    assert.equal(e.code, 0);
    assert.equal(JSON.parse(e.out).counts.error, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cli: help, version, rule list and bad options', async () => {
  assert.match((await run(['--help'])).out, /Usage/);
  assert.match((await run(['--version'])).out, /^\d+\.\d+\.\d+/);
  const list = await run(['--list-rules']);
  const n = Number(/(\d+) rules/.exec(list.out)[1]);
  assert.ok(n >= 25);
  assert.equal((await run(['--nope'])).code, 2);
  assert.equal((await run(['--format', 'xml'])).code, 2);
  assert.equal((await run(['--rule', 'title=loud'])).code, 2);
});
