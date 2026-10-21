import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findings, html, siteOf } from '../helpers.js';
import { runRules } from '../../src/engine.js';

const page = { 'index.html': html({ canonical: 'https://acme.test/' }) };

test('robots-ai-search: flags a wildcard block and named blocks', () => {
  const star = findings('robots-ai-search', { ...page, 'robots.txt': 'User-agent: *\nDisallow: /\n' });
  assert.equal(star.length, 1);
  assert.match(star[0].message, /OAI-SearchBot/);
  assert.equal(star[0].line, 2);
  const named = findings('robots-ai-search', { ...page, 'public/robots.txt': 'User-agent: PerplexityBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n' });
  assert.equal(named.length, 1);
  assert.match(named[0].message, /PerplexityBot is blocked from the whole site/);
});

test('robots-ai-search: a specific Allow group overrides the wildcard block', () => {
  const r = 'User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nUser-agent: ChatGPT-User\nUser-agent: Claude-SearchBot\nUser-agent: Claude-User\nUser-agent: PerplexityBot\nUser-agent: Perplexity-User\nUser-agent: Googlebot\nUser-agent: Bingbot\nUser-agent: Applebot\nAllow: /\n';
  assert.deepEqual(findings('robots-ai-search', { ...page, 'robots.txt': r }), []);
});

test('robots-ai-search: partial blocks are warnings', () => {
  const f = findings('robots-ai-search', { ...page, 'blog/post.html': html(), 'robots.txt': 'User-agent: Claude-SearchBot\nDisallow: /blog\n' });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warn');
  assert.match(f[0].message, /\/blog\/post/);
});

test('robots-ai-search: reads Next.js app/robots.ts', () => {
  const src = `export default function robots() { return { rules: [{ userAgent: '*', disallow: '/' }], sitemap: 'https://acme.test/sitemap.xml' } }`;
  const f = findings('robots-ai-search', { 'package.json': '{"dependencies":{"next":"15"}}', 'app/page.tsx': 'export default function P(){return <h1>Hi</h1>}', 'app/robots.ts': src });
  assert.equal(f.length, 1);
});

test('robots-ai-training: reports blocked training crawlers as info', () => {
  const f = findings('robots-ai-training', { ...page, 'robots.txt': 'User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n' });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'info');
  assert.match(f[0].message, /GPTBot, ClaudeBot/);
  assert.deepEqual(findings('robots-ai-training', { ...page, 'robots.txt': 'User-agent: *\nAllow: /\n' }), []);
});

test('robots-txt: missing file and missing Sitemap line', () => {
  assert.match(findings('robots-txt', page)[0].message, /No robots.txt/);
  assert.match(findings('robots-txt', { ...page, 'robots.txt': 'User-agent: *\nAllow: /\n' })[0].message, /no "Sitemap:"/);
  assert.deepEqual(findings('robots-txt', { ...page, 'robots.txt': 'User-agent: *\nAllow: /\nSitemap: https://acme.test/sitemap.xml\n' }), []);
});

test('sitemap-present: missing, static and generated', () => {
  assert.equal(findings('sitemap-present', page).length, 1);
  assert.deepEqual(findings('sitemap-present', { ...page, 'public/sitemap.xml': '<urlset><url><loc>https://acme.test/</loc></url></urlset>' }), []);
  assert.deepEqual(findings('sitemap-present', { ...page, 'package.json': '{"dependencies":{"@astrojs/sitemap":"3"}}' }), []);
});

test('sitemap-lastmod: missing and build-stamped lastmod', () => {
  const missing = findings('sitemap-lastmod', { ...page, 'sitemap.xml': '<urlset><url><loc>https://acme.test/</loc></url><url><loc>https://acme.test/a</loc><lastmod>2026-01-01</lastmod></url></urlset>' });
  assert.match(missing[0].message, /1 of 2/);
  const urls = [1, 2, 3, 4, 5].map((i) => `<url><loc>https://acme.test/${i}</loc><lastmod>2026-10-01T00:00:00Z</lastmod></url>`).join('');
  const same = findings('sitemap-lastmod', { ...page, 'sitemap.xml': `<urlset>${urls}</urlset>` });
  assert.equal(same[0].severity, 'info');
  const gen = findings('sitemap-lastmod', { 'package.json': '{"dependencies":{"next":"15"}}', 'app/page.tsx': 'export default () => <h1>x</h1>', 'app/sitemap.ts': 'export default function s(){ return [{ url: "https://acme.test" }] }' });
  assert.equal(gen.length, 1);
});

test('llms-txt-present: missing and present', () => {
  assert.equal(findings('llms-txt-present', page).length, 1);
  assert.deepEqual(findings('llms-txt-present', { ...page, 'public/llms.txt': '# Acme\n' }), []);
});

test('llms-txt-valid: checks the llmstxt.org layout', () => {
  const good = '# Acme\n\n> Product analytics for small teams.\n\n## Docs\n\n- [Pricing](https://acme.test/pricing): plans and limits\n\n## Optional\n\n- [Blog](https://acme.test/blog)\n';
  assert.deepEqual(findings('llms-txt-valid', { ...page, 'llms.txt': good }), []);
  const bad = findings('llms-txt-valid', { ...page, 'llms.txt': 'Acme docs\n\n## Docs\n\n- Pricing page\n' });
  const msgs = bad.map((f) => f.message).join('\n');
  assert.match(msgs, /No H1/);
  assert.match(msgs, /not a markdown link/);
  assert.ok(bad.some((f) => f.severity === 'error'));
});

test('noindex: meta tag, Next metadata and host headers', () => {
  const meta = findings('noindex', { 'index.html': html({ head: '<meta name="robots" content="noindex, nofollow">' }) });
  assert.equal(meta.length, 1);
  assert.equal(meta[0].line, 10);
  const login = findings('noindex', { 'login.html': html({ head: '<meta name="robots" content="noindex">' }) });
  assert.deepEqual(login, []);
  const next = findings('noindex', { 'package.json': '{"dependencies":{"next":"15"}}', 'app/page.tsx': 'export const metadata = { title: "Acme", robots: { index: false } }\nexport default () => <h1>Acme</h1>' });
  assert.equal(next.length, 1);
  const hdr = findings('noindex', { ...page, 'vercel.json': '{"headers":[{"source":"/(.*)","headers":[{"key":"X-Robots-Tag","value":"noindex"}]}]}' });
  assert.equal(hdr.length, 1);
  assert.equal(hdr[0].file, 'vercel.json');
});

test('nosnippet: robots nosnippet and large data-nosnippet blocks', () => {
  const f = findings('nosnippet', { 'index.html': html({ head: '<meta name="robots" content="max-snippet:0">' }) });
  assert.equal(f.length, 1);
  const block = findings('nosnippet', { 'index.html': html({ body: `<h1>Acme</h1><div data-nosnippet>${'word '.repeat(40)}</div>` }) });
  assert.equal(block.length, 1);
  assert.deepEqual(findings('nosnippet', page), []);
});

test('hash-routing: detects hashchange routers and fragment links', () => {
  const js = "window.addEventListener('hashchange', route);\nfunction route(){ const h = location.hash.slice(1); }";
  const f = findings('hash-routing', { ...page, 'app.js': js });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'app.js');
  const vue = findings('hash-routing', { ...page, 'src/router.ts': "import { createRouter, createWebHashHistory } from 'vue-router'\nexport default createRouter({ history: createWebHashHistory(), routes })" });
  assert.equal(vue.length, 1);
  const links = findings('hash-routing', { 'index.html': html({ body: '<h1>A</h1><a href="#/a">a</a><a href="#/b">b</a><a href="#/c">c</a>' }) });
  assert.equal(links.length, 1);
  assert.equal(links[0].severity, 'warn');
  assert.deepEqual(findings('hash-routing', { ...page, 'app.js': 'history.pushState({}, "", "/a")' }), []);
});

test('client-only-content: empty SPA shell', () => {
  const shell = '<!doctype html><html lang="en"><head><title>App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
  const f = findings('client-only-content', { 'index.html': shell });
  assert.equal(f.length, 1);
  assert.match(f[0].message, /id="root"/);
  assert.deepEqual(findings('client-only-content', page), []);
});

test('client-only-content: innerHTML writes in a static page', () => {
  const src = '<!doctype html><html lang="en"><body><main id="app"></main><script>\nconst app = document.getElementById("app");\napp.innerHTML = `<h1>Hi</h1>`;\n</script></body></html>';
  const f = findings('client-only-content', { 'index.html': src });
  assert.equal(f.length, 1);
  assert.match(f[0].message, /innerHTML \(line 3\)/);
});

test('client-only-content: Next.js page that fetches in useEffect', () => {
  const src = `'use client'\nimport { useEffect, useState } from 'react'\nexport default function Page() {\n  const [posts, setPosts] = useState([])\n  useEffect(() => { fetch('/api/posts').then(r => r.json()).then(setPosts) }, [])\n  return <main>{posts.map(p => <p key={p.id}>{p.body}</p>)}</main>\n}`;
  const f = findings('client-only-content', { 'package.json': '{"dependencies":{"next":"15"}}', 'app/blog/page.tsx': src });
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 5);
  assert.match(f[0].message, /use client/);
  const server = `export default async function Page() {\n  const posts = await getPosts()\n  return <main>{posts.map(p => <p key={p.id}>{p.body}</p>)}</main>\n}`;
  assert.deepEqual(findings('client-only-content', { 'package.json': '{"dependencies":{"next":"15"}}', 'app/blog/page.tsx': server }), []);
});

test('client-only-content: ssr:false components are warned', () => {
  const src = "import dynamic from 'next/dynamic'\nconst Chart = dynamic(() => import('../Chart'), { ssr: false })\nexport default function P(){ return <main><h1>Report</h1><Chart /></main> }";
  const f = findings('client-only-content', { 'package.json': '{"dependencies":{"next":"15"}}', 'pages/report.tsx': src });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warn');
});

test('meta-refresh: flags client-side redirects', () => {
  const f = findings('meta-refresh', { 'old.html': '<html><head><meta http-equiv="refresh" content="0; url=/new"></head><body></body></html>' });
  assert.equal(f.length, 1);
  assert.match(f[0].message, /to \/new/);
  assert.deepEqual(findings('meta-refresh', page), []);
});

test('crawler-access: flags AI user agents that are blocked when browsers are not', () => {
  const site = siteOf({});
  site.mode = 'url';
  site.origin = 'https://acme.test';
  site.pages = [{ file: 'https://acme.test/' }];
  site.probes = [{ token: 'browser', status: 200 }, { token: 'OAI-SearchBot', status: 403, challenge: false }, { token: 'ClaudeBot', status: 403, challenge: true }, { token: 'PerplexityBot', status: 200 }];
  site.pages[0] = { ...site.pages[0], head: {}, blocks: [], headings: [], links: [], images: [], tables: [], jsonLd: [], times: [], nosnippetEls: [], clickNav: [], bylineHints: [], emptyRoots: [], scripts: [], signals: {}, route: '/', isUtility: false, isRedirect: false };
  const f = runRules(site, { only: ['crawler-access'] });
  assert.equal(f.length, 1);
  assert.match(f[0].message, /OAI-SearchBot \(403\), ClaudeBot \(challenge page\)/);
  site.probes = [{ token: 'browser', status: 200 }, { token: 'OAI-SearchBot', status: 200 }];
  assert.deepEqual(runRules(site, { only: ['crawler-access'] }), []);
});
