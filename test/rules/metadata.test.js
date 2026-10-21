import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findings, html } from '../helpers.js';

const NEXT = { 'package.json': '{"dependencies":{"next":"15"}}' };

test('title: missing, placeholder, long and fine', () => {
  assert.equal(findings('title', { 'index.html': html({ title: null }) })[0].severity, 'error');
  assert.match(findings('title', { 'index.html': html({ title: 'Vite App' }) })[0].message, /placeholder/);
  assert.equal(findings('title', { 'index.html': html({ title: 'A'.repeat(80) }) })[0].severity, 'info');
  assert.deepEqual(findings('title', { 'index.html': html() }), []);
});

test('title: Next.js metadata and layout templates', () => {
  const layout = `export const metadata = { title: { default: 'Acme', template: '%s | Acme' } }\nexport default function L({children}){ return <html lang="en"><body>{children}</body></html> }`;
  const page = `export const metadata = { title: 'Pricing plans and limits' }\nexport default function P(){ return <h1>Pricing</h1> }`;
  assert.deepEqual(findings('title', { ...NEXT, 'app/layout.tsx': layout, 'app/pricing/page.tsx': page }), []);
  const bare = findings('title', { ...NEXT, 'app/pricing/page.tsx': 'export default function P(){ return <h1>Pricing</h1> }' });
  assert.equal(bare[0].severity, 'error');
});

test('title: frameworks where a layout may supply it are downgraded', () => {
  const f = findings('title', { 'package.json': '{"dependencies":{"astro":"5"}}', 'src/pages/about.astro': '---\n---\n<h1>About</h1>' });
  assert.equal(f[0].severity, 'warn');
  assert.deepEqual(findings('title', { 'package.json': '{"dependencies":{"astro":"5"}}', 'src/pages/about.astro': '---\nimport Layout from "../layouts/Base.astro"\n---\n<Layout title="About Acme analytics"><h1>About</h1></Layout>' }), []);
});

test('meta-description: missing, short and fine', () => {
  assert.equal(findings('meta-description', { 'index.html': html({ description: null }) }).length, 1);
  assert.equal(findings('meta-description', { 'index.html': html({ description: 'Short.' }) })[0].severity, 'info');
  assert.deepEqual(findings('meta-description', { 'index.html': html() }), []);
  const md = findings('meta-description', { 'content/guide.md': '---\ntitle: Guide\ndescription: How to measure user onboarding with cohort charts, step by step, for product teams.\n---\n# Guide\n' });
  assert.deepEqual(md, []);
});

test('duplicate-title: shared titles across pages', () => {
  const f = findings('duplicate-title', { 'a.html': html({ title: 'Acme analytics' }), 'b.html': html({ title: 'Acme analytics' }), 'c.html': html({ title: 'Something else entirely' }) });
  assert.equal(f.length, 2);
  assert.match(f[0].message, /shared by 2 pages/);
});

test('duplicate-title: Next.js pages inheriting the layout default', () => {
  const layout = `export const metadata = { title: 'Acme analytics platform' }\nexport default function L({children}){ return <html lang="en"><body>{children}</body></html> }`;
  const p = 'export default function P(){ return <h1>X</h1> }';
  const f = findings('duplicate-title', { ...NEXT, 'app/layout.tsx': layout, 'app/page.tsx': p, 'app/about/page.tsx': p });
  assert.equal(f.length, 2);
  assert.match(f[0].message, /inherited from app\/layout.tsx/);
});

test('duplicate-description: shared descriptions', () => {
  const d = 'Acme analytics helps product teams understand retention and onboarding.';
  assert.equal(findings('duplicate-description', { 'a.html': html({ description: d }), 'b.html': html({ description: d }) }).length, 2);
  assert.deepEqual(findings('duplicate-description', { 'a.html': html({ description: d }), 'b.html': html({ description: d + ' Now with SQL.' }) }), []);
});

test('canonical: missing, fragment, relative, inherited', () => {
  assert.equal(findings('canonical', { 'index.html': html({ canonical: null }) })[0].severity, 'warn');
  const frag = findings('canonical', { 'c/post.html': html({ canonical: 'https://acme.test/#post' }) });
  assert.equal(frag[0].severity, 'error');
  assert.match(frag[0].message, /fragment/);
  assert.equal(findings('canonical', { 'pricing.html': html({ canonical: '/pricing' }) })[0].severity, 'info');
  const layout = `export const metadata = { metadataBase: new URL('https://acme.test'), alternates: { canonical: 'https://acme.test/' } }\nexport default function L({children}){ return <html lang="en"><body>{children}</body></html> }`;
  const inh = findings('canonical', { ...NEXT, 'app/layout.tsx': layout, 'app/page.tsx': 'export default () => <h1>A</h1>', 'app/blog/page.tsx': 'export default () => <h1>B</h1>' });
  assert.equal(inh.length, 1);
  assert.equal(inh[0].file, 'app/blog/page.tsx');
  assert.match(inh[0].message, /inherited/);
  assert.deepEqual(findings('canonical', { 'pricing.html': html() }), []);
});

test('canonical: points to a different path', () => {
  const f = findings('canonical', { 'pricing.html': html({ canonical: 'https://acme.test/plans' }) });
  assert.equal(f[0].severity, 'info');
  assert.match(f[0].message, /\/plans/);
});

test('html-lang: per HTML file and per framework root layout', () => {
  assert.equal(findings('html-lang', { 'index.html': html({ lang: null }) }).length, 1);
  assert.deepEqual(findings('html-lang', { 'index.html': html() }), []);
  const layout = 'export default function L({children}){ return <html><body>{children}</body></html> }';
  const f = findings('html-lang', { ...NEXT, 'app/layout.tsx': layout, 'app/page.tsx': 'export default () => <h1>A</h1>' });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'app/layout.tsx');
  const ok = findings('html-lang', { ...NEXT, 'app/layout.tsx': layout.replace('<html>', '<html lang="en-GB">'), 'app/page.tsx': 'export default () => <h1>A</h1>' });
  assert.deepEqual(ok, []);
});

test('open-graph: lists missing tags', () => {
  const f = findings('open-graph', { 'index.html': html({ og: false, head: '<meta property="og:title" content="Acme">' }) });
  assert.equal(f.length, 1);
  assert.match(f[0].message, /og:description, og:image, og:url/);
  assert.deepEqual(findings('open-graph', { 'index.html': html() }), []);
});
