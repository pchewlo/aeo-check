import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkup, textOf } from '../src/parse/markup.js';
import { parseFrontmatter, parseMarkdown } from '../src/parse/markdown.js';
import { parseRobots, groupFor, isAllowed, parseSitemap, parseLlmsTxt } from '../src/parse/sitefiles.js';
import { nextMetadata, clientSignals, headCalls } from '../src/parse/js.js';
import { siteOf } from './helpers.js';

const names = (src, mode) => parseMarkup(src, { mode }).elements.map((e) => e.name);

test('markup: HTML with implicit closes and raw text', () => {
  const d = parseMarkup('<ul><li>a<li>b</ul><p>one<p>two<script>if (a < b) x()</script>');
  assert.deepEqual(d.elements.map((e) => e.tag), ['ul', 'li', 'li', 'p', 'p', 'script']);
  assert.equal(d.elements[1].children.length, 1);
});

test('markup: JSX ignores generics and comparisons', () => {
  const src = 'const [a, setA] = useState<string>("");\nif (x < y && y > 2) {}\nexport default function P(){ return <main className="m"><h1>Hi</h1>{items.map(i => <li key={i}>{i}</li>)}</main> }';
  assert.deepEqual(names(src, 'jsx'), ['main', 'h1', 'li']);
  const d = parseMarkup(src, { mode: 'jsx' });
  assert.equal(d.elements[0].attrs.class.value, 'm');
  assert.equal(d.elements[0].line, 3);
});

test('markup: JSX attributes, spreads and string expressions', () => {
  const d = parseMarkup('export const C = (p) => <img {...p} alt={"A chart"} src={src} />', { mode: 'jsx' });
  const img = d.elements[0];
  assert.equal(img.spread, true);
  assert.equal(img.attrs.alt.value, 'A chart');
  assert.equal(img.attrs.alt.dynamic, false);
  assert.equal(img.attrs.src.dynamic, true);
});

test('markup: Vue and Svelte bindings', () => {
  const vue = parseMarkup('<div><img :src="x" alt="Logo"><a @click="go">Go</a><p>{{ msg }}</p></div>', { mode: 'template' });
  const [, img, a] = vue.elements;
  assert.equal(img.attrs.src.dynamic, true);
  assert.ok('onclick' in a.attrs);
  const svelte = parseMarkup('{#if ok}<p>Hi {name}</p>{/if}<button on:click={() => goto("/a")}>A</button>', { mode: 'template' });
  assert.deepEqual(svelte.elements.map((e) => e.tag), ['p', 'button']);
  assert.ok('onclick' in svelte.elements[1].attrs);
});

test('markup: text extraction skips scripts and svg', () => {
  const d = parseMarkup('<body><p>Hello <b>world</b></p><script>var x</script><svg><text>no</text></svg></body>');
  assert.equal(textOf(d.root).replace(/\s+/g, ' ').trim(), 'Hello world');
});

test('markdown: frontmatter, headings, tables, links and images', () => {
  const src = '---\ntitle: "Guide"\ntags: [a, b]\nauthor:\n  name: Jane\n---\n# Guide\n\nIntro with [a link](/x).\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n![Chart](/c.png)\n';
  const fm = parseFrontmatter(src);
  assert.equal(fm.data.title, 'Guide');
  assert.deepEqual(fm.data.tags, ['a', 'b']);
  assert.equal(fm.data.author.name, 'Jane');
  const md = parseMarkdown(fm.body, fm.bodyLine);
  assert.equal(md.blocks[0].kind, 'heading');
  assert.equal(md.blocks[0].line, 7);
  assert.equal(md.links[0].href, '/x');
  assert.equal(md.blocks.find((b) => b.kind === 'table').hasHeader, true);
  assert.equal(md.images[0].alt, 'Chart');
});

test('robots: group selection and longest-match precedence', () => {
  const r = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://a.test/sitemap.xml');
  assert.equal(r.sitemaps[0].url, 'https://a.test/sitemap.xml');
  const star = groupFor(r, 'PerplexityBot');
  assert.equal(isAllowed(star.rules, '/private/x').allowed, false);
  assert.equal(isAllowed(star.rules, '/private/ok/y').allowed, true);
  assert.equal(isAllowed(groupFor(r, 'gptbot').rules, '/').allowed, false);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow: /*.pdf$').groups[0].rules, '/a.pdf').allowed, false);
});

test('sitemap and llms.txt readers', () => {
  const sm = parseSitemap('<urlset>\n<url><loc>https://a.test/</loc><lastmod>2026-01-01</lastmod></url>\n</urlset>');
  assert.equal(sm.urls[0].lastmod, '2026-01-01');
  assert.equal(sm.urls[0].line, 2);
  const l = parseLlmsTxt('# A\n\n> Summary\n\n## Docs\n\n- [X](https://a.test/x): notes\n');
  assert.equal(l.problems.length, 0);
  assert.equal(l.sections[0].links[0].notes, 'notes');
});

test('Next.js metadata: titles, robots, canonical and generateMetadata', () => {
  const m = nextMetadata("export const metadata: Metadata = {\n  title: { default: 'Acme', template: '%s | Acme' },\n  description: \"Analytics\",\n  alternates: { canonical: '/' },\n  robots: { index: false },\n  openGraph: { title: 'Acme', images: ['/og.png'] },\n}");
  assert.equal(m.title.text, 'Acme');
  assert.equal(m.titleTemplate, '%s | Acme');
  assert.equal(m.description.text, 'Analytics');
  assert.equal(m.canonical.href, '/');
  assert.equal(m.robots.noindex, true);
  assert.equal(m.og.image, true);
  const g = nextMetadata('export async function generateMetadata({ params }) { const p = await get(params.slug); return { title: p.title, description: p.summary } }');
  assert.equal(g.title.dynamic, true);
});

test('Nuxt useSeoMeta and client signals', () => {
  const h = headCalls("useSeoMeta({ title: 'Pricing', description: 'Plans and limits', ogImage: '/og.png' })");
  assert.equal(h.title.text, 'Pricing');
  const s = clientSignals("'use client'\nuseEffect(() => {\n  fetch('/api').then(setData)\n}, [])\nwindow.addEventListener('hashchange', r)");
  assert.equal(s.useClient, true);
  assert.deepEqual(s.effectFetch, [2]);
  assert.deepEqual(s.hashRouting, [5]);
});

test('site model: routes for Next, Astro, SvelteKit, Nuxt and static HTML', () => {
  const routes = (files) => siteOf(files).pages.map((p) => p.route).sort();
  assert.deepEqual(routes({ 'package.json': '{"dependencies":{"next":"15"}}', 'app/page.tsx': 'x', 'app/(marketing)/pricing/page.tsx': 'x', 'app/blog/[slug]/page.tsx': 'x', 'app/_private/page.tsx': 'x', 'pages/api/x.ts': 'x' }), ['/', '/blog/[slug]', '/pricing']);
  assert.deepEqual(routes({ 'package.json': '{"dependencies":{"astro":"5"}}', 'src/pages/index.astro': '<h1>x</h1>', 'src/pages/blog/[...slug].astro': '<h1>x</h1>', 'src/content/blog/first.md': '# First' }), ['/', '/blog/[...slug]', '/blog/first']);
  assert.deepEqual(routes({ 'package.json': '{"devDependencies":{"@sveltejs/kit":"2"}}', 'src/routes/+page.svelte': '<h1>x</h1>', 'src/routes/about/+page.svelte': '<h1>x</h1>' }), ['/', '/about']);
  assert.deepEqual(routes({ 'package.json': '{"dependencies":{"nuxt":"3"}}', 'pages/index.vue': '<template><h1>x</h1></template>', 'pages/docs/intro.vue': '<template><h1>x</h1></template>' }), ['/', '/docs/intro']);
  assert.deepEqual(routes({ 'index.html': '<h1>x</h1>', 'about/index.html': '<h1>x</h1>', 'public/contact.html': '<h1>x</h1>', 'README.md': '# x' }), ['/', '/about', '/contact']);
});

test('site model: repo markdown needs frontmatter, a content folder or a docs generator', () => {
  const routes = (files) => siteOf(files).pages.map((p) => p.route).sort();
  assert.deepEqual(routes({ 'docs/notes.md': '# Notes', 'REPO-MAP.md': '# Map' }), []);
  assert.deepEqual(routes({ 'docs/intro.md': '---\ntitle: Intro\n---\n# Intro' }), ['/intro']);
  assert.deepEqual(routes({ 'docs/intro.md': '# Intro', 'mkdocs.yml': 'site_name: x' }), ['/intro']);
  assert.deepEqual(routes({ 'content/post.md': '# Post' }), ['/post']);
});
