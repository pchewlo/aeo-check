import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findings, html, para } from '../helpers.js';

const article = (opts = {}) => html({ canonical: 'https://acme.test/blog/onboarding', jsonLd: false, body: `<h1>How to measure onboarding</h1><p>${para(320)}</p>`, ...opts });

test('dates: article with no dates, dates in metadata only, and both', () => {
  assert.match(findings('dates', { 'blog/onboarding.html': article() })[0].message, /No publication or update date/);
  const metaOnly = findings('dates', { 'blog/onboarding.html': article({ head: '<meta property="article:modified_time" content="2026-10-01">' }) });
  assert.equal(metaOnly[0].severity, 'info');
  const both = article({ head: '<meta property="article:modified_time" content="2026-10-01">', body: `<h1>How to measure onboarding</h1><p>Updated <time datetime="2026-10-01">1 October 2026</time></p><p>${para(320)}</p>` });
  assert.deepEqual(findings('dates', { 'blog/onboarding.html': both }), []);
  assert.deepEqual(findings('dates', { 'pricing.html': html() }), []);
});

test('dates: markdown frontmatter and stale dates', () => {
  assert.deepEqual(findings('dates', { 'blog/post.md': `---\ntitle: Post\ndate: ${new Date().toISOString().slice(0, 10)}\n---\n# Post\n\n${para(320)}\n` }), []);
  const stale = findings('dates', { 'blog/post.md': `---\ntitle: Post\ndate: 2019-01-01\n---\n# Post\n\n${para(320)}\n` });
  assert.equal(stale.length, 1);
  assert.match(stale[0].message, /over a year ago/);
});

test('author: byline, meta, JSON-LD, frontmatter', () => {
  assert.equal(findings('author', { 'blog/onboarding.html': article() }).length, 1);
  assert.deepEqual(findings('author', { 'blog/onboarding.html': article({ head: '<meta name="author" content="Jane Smith">' }) }), []);
  assert.deepEqual(findings('author', { 'blog/onboarding.html': article({ body: `<h1>How</h1><p class="byline">By Jane Smith</p><p>${para(320)}</p>` }) }), []);
  assert.deepEqual(findings('author', { 'blog/post.md': '---\ntitle: Post\nauthor: Jane Smith\n---\n# Post\n' }), []);
});

test('structured-data: home, article and product pages', () => {
  assert.match(findings('structured-data', { 'index.html': html({ jsonLd: false }) })[0].message, /Organization or WebSite/);
  assert.deepEqual(findings('structured-data', { 'index.html': html() }), []);
  assert.match(findings('structured-data', { 'blog/onboarding.html': article() })[0].message, /Article/);
  const ok = article({ jsonLd: { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: 'How', author: { '@type': 'Person', name: 'J' }, datePublished: '2026-01-01' } });
  assert.deepEqual(findings('structured-data', { 'blog/onboarding.html': ok }), []);
  assert.equal(findings('structured-data', { 'pricing.html': html({ jsonLd: false }) })[0].severity, 'info');
});

test('structured-data: JSON-LD built in JSX is recognised', () => {
  const src = `export default function Page(){ const ld = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme', url: 'https://acme.test' };\n return <main><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} /><h1>Acme</h1></main> }`;
  assert.deepEqual(findings('structured-data', { 'package.json': '{"dependencies":{"next":"15"}}', 'app/page.tsx': src }), []);
});

test('structured-data-valid: parse errors, missing type, required properties', () => {
  assert.match(findings('structured-data-valid', { 'index.html': html({ jsonLd: '{"@context": "https://schema.org", "@type": "Organization",}' }) })[0].message, /does not parse/);
  assert.match(findings('structured-data-valid', { 'index.html': html({ jsonLd: { '@context': 'https://schema.org', name: 'Acme' } }) })[0].message, /no "@type"/);
  const faq = findings('structured-data-valid', { 'index.html': html({ jsonLd: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'What is Acme?' }] } }) });
  assert.match(faq[0].message, /acceptedAnswer/);
  const art = findings('structured-data-valid', { 'index.html': html({ jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: 'X', author: 'Y', datePublished: 'last week' } }) });
  assert.match(art[0].message, /ISO 8601/);
  assert.deepEqual(findings('structured-data-valid', { 'index.html': html() }), []);
});

test('structured-data-visible: FAQ questions must be on the page', () => {
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'What does the Team plan include?', acceptedAnswer: { '@type': 'Answer', text: 'Ten seats.' } }, { '@type': 'Question', name: 'Is there a free trial?', acceptedAnswer: { '@type': 'Answer', text: 'Yes.' } }] };
  const f = findings('structured-data-visible', { 'index.html': html({ jsonLd: ld }) });
  assert.equal(f.length, 1);
  assert.match(f[0].message, /1 of 2/);
});

test('faq-schema: question headings with answers', () => {
  const body = `<h1>FAQ</h1><h2>What is Acme?</h2><p>${para(30)}</p><h2>How much is it?</h2><p>${para(30)}</p><h2>Is there a trial?</h2><p>${para(30)}</p>`;
  assert.equal(findings('faq-schema', { 'faq.html': html({ body }) }).length, 1);
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] };
  assert.deepEqual(findings('faq-schema', { 'faq.html': html({ body, jsonLd: ld }) }), []);
});

test('breadcrumbs: nested pages', () => {
  assert.equal(findings('breadcrumbs', { 'guides/setup/index.html': html() }).length, 1);
  assert.deepEqual(findings('breadcrumbs', { 'pricing.html': html() }), []);
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] };
  assert.deepEqual(findings('breadcrumbs', { 'guides/setup.html': html({ jsonLd: ld }) }), []);
});

test('js-only-links: onClick navigation, javascript: and href="#"', () => {
  const body = '<h1>A</h1><a onclick="location.href=\'/x\'">X</a><a href="javascript:go()">Y</a><div onclick="location.hash=\'#y\'">Z</div><a href="/ok">OK</a>';
  const f = findings('js-only-links', { 'index.html': html({ body }) });
  assert.equal(f.length, 3);
  const jsx = 'export function Nav(){ const router = useRouter(); return <nav><span onClick={() => router.push("/pricing")}>Pricing</span><a href="#" onClick={() => router.push("/a")}>A</a><Link href="/b">B</Link></nav> }';
  assert.equal(findings('js-only-links', { 'components/Nav.tsx': jsx }).length, 2);
});

test('internal-links: content pages with no links out', () => {
  assert.equal(findings('internal-links', { 'guide.html': html({ body: `<h1>Guide</h1><p>${para(200)}</p>` }) }).length, 1);
  assert.deepEqual(findings('internal-links', { 'guide.html': html({ body: `<h1>Guide</h1><p>${para(200)} See <a href="/pricing">pricing</a>.</p>` }) }), []);
  const nav = findings('internal-links', { 'guide.html': html({ body: `<nav><a href="/">Home</a></nav><h1>Guide</h1><p>${para(200)}</p>` }) });
  assert.equal(nav.length, 1, 'navigation links do not count');
});

test('orphan-pages: pages no other page links to', () => {
  const files = {
    'index.html': html({ body: '<h1>Home</h1><a href="/pricing">Pricing</a>' }),
    'pricing.html': html({ body: '<h1>Pricing</h1><a href="/">Home</a>' }),
    'old-launch.html': html({ body: '<h1>Old</h1>' }),
  };
  const f = findings('orphan-pages', files);
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'old-launch.html');
});

test('img-alt: missing, placeholder and decorative', () => {
  const body = '<h1>A</h1><img src="/a.png"><img src="/b.png" alt="b.png"><img src="/c.png" alt=""><img src="/d.png" alt="Retention chart: week 4 retention rose from 30% to 42%">';
  const f = findings('img-alt', { 'index.html': html({ body }) });
  assert.equal(f.length, 2);
  assert.equal(findings('img-alt', { 'components/Hero.tsx': 'export const Hero = () => <Image src="/hero.png" width={10} height={10} />' }).length, 1);
  assert.equal(findings('img-alt', { 'docs/a.md': '# A\n\n![](/shot.png)\n' }).length, 1);
});

test('facts-in-images: pricing and chart images', () => {
  const f = findings('facts-in-images', { 'index.html': html({ body: '<h1>A</h1><img src="/img/pricing-table.png" alt="Plans">' }) });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warn');
  assert.deepEqual(findings('facts-in-images', { 'index.html': html({ body: '<h1>A</h1><img src="/img/team-photo.jpg" alt="The Acme team">' }) }), []);
});
