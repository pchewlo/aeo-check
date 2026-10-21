import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/index.js';
import { CTA_TEXT } from '../src/rules/_util.js';
import { readFileSync } from 'node:fs';
import { formatText } from '../src/report/text.js';
import { formatMarkdown } from '../src/report/markdown.js';

const SHELL = '<!doctype html><html lang="en"><head><title>Acme</title><meta name="description" content="Acme analytics for product teams and their retention reports."></head><body><div id="root"></div><script src="/assets/index.js"></script></body></html>';

function fakeFetch(routes) {
  return async (url, init) => {
    const ua = init.headers['user-agent'];
    const r = typeof routes[url] === 'function' ? routes[url](ua) : routes[url];
    if (!r) return new Response('not found', { status: 404 });
    return new Response(r.body, { status: r.status || 200, headers: r.headers || { 'content-type': 'text/html' } });
  };
}

test('url mode: SPA shell, missing llms.txt, robots and firewall probes', async () => {
  const fetchImpl = fakeFetch({
    'https://acme.test/': (ua) => (/GPTBot|ClaudeBot|OAI-SearchBot/.test(ua) ? { status: 403, body: '<title>Just a moment...</title>' } : { body: SHELL, headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' } }),
    'https://acme.test/robots.txt': { body: 'User-agent: *\nAllow: /\n', headers: { 'content-type': 'text/plain' } },
  });
  const r = await check({ url: 'https://acme.test/', fetchImpl });
  const ids = new Set(r.findings.map((f) => f.ruleId));
  for (const id of ['client-only-content', 'llms-txt-present', 'sitemap-present', 'crawler-access', 'noindex', 'robots-txt']) assert.ok(ids.has(id), `expected ${id}`);
  const probe = r.findings.find((f) => f.ruleId === 'crawler-access');
  assert.match(probe.message, /OAI-SearchBot \(challenge page\)/);
});

test('url mode: crawls internal links up to --max-pages', async () => {
  const page = (title, links) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${links.map((l) => `<a href="${l}">${l}</a>`).join('')}</main></body></html>`;
  const fetchImpl = fakeFetch({
    'https://acme.test/': { body: page('Home of Acme analytics', ['/a', '/b', 'https://other.test/x']) },
    'https://acme.test/a': { body: page('Acme page A', ['/']) },
    'https://acme.test/b': { body: page('Acme page A', ['/']) },
    'https://acme.test/llms.txt': { body: '<!doctype html><html></html>', headers: { 'content-type': 'text/html' } },
  });
  const r = await check({ url: 'https://acme.test/', maxPages: 3, probe: false, fetchImpl });
  assert.deepEqual(r.site.pages.map((p) => p.route), ['/', '/a', '/b']);
  assert.ok(r.findings.some((f) => f.ruleId === 'duplicate-title'));
  assert.ok(r.findings.some((f) => f.ruleId === 'llms-txt-present'), 'an HTML fallback is not an llms.txt');
});

test('url mode: unreachable page is an error', async () => {
  await assert.rejects(check({ url: 'https://acme.test/', probe: false, fetchImpl: fakeFetch({}) }), /Could not fetch/);
});

test('url mode: booking links that block agents acting for a user (agent-paths)', async () => {
  const home = '<!doctype html><html lang="en"><head><title>Harbour Hotel, Whitby</title></head><body><main><h1>Harbour Hotel</h1><p>Rooms from £120 a night.</p><a href="https://engine.test/hotel/42">Book now</a></main></body></html>';
  const fetchImpl = fakeFetch({
    'https://hotel.test/': { body: home },
    'https://engine.test/hotel/42': (ua) => (/-User\//.test(ua) ? { status: 403, body: 'Access denied' } : { body: '<html><body>Choose dates</body></html>' }),
  });
  const r = await check({ url: 'https://hotel.test/', fetchImpl });
  const f = r.findings.find((x) => x.ruleId === 'agent-paths');
  assert.ok(f, 'expected agent-paths finding');
  assert.match(f.message, /engine\.test\/hotel\/42 returns 200 to a browser but blocks ChatGPT-User \(403\), Claude-User \(403\), Perplexity-User \(403\)/);
});

test('url mode: a start URL without a trailing slash is not crawled twice', async () => {
  const page = (title, links) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${links.map((l) => `<a href="${l}">${l}</a>`).join('')}</main></body></html>`;
  const fetchImpl = fakeFetch({
    'https://acme.test/': { body: page('Home of Acme analytics', ['/', '/a']) },
    'https://acme.test/a': { body: page('Acme page A', ['/']) },
  });
  const r = await check({ url: 'https://acme.test', maxPages: 5, probe: false, fetchImpl });
  assert.deepEqual(r.site.pages.map((p) => p.route), ['/', '/a']);
  assert.ok(!r.findings.some((f) => f.ruleId === 'duplicate-title'));
});

test('url mode: a link that redirects to a page already crawled is not crawled twice', async () => {
  const page = (title, links) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${links.map((l) => `<a href="${l}">${l}</a>`).join('')}</main></body></html>`;
  const routes = {
    'https://acme.test/uk': page('Acme in the UK', ['/uk/', '/uk/about']),
    'https://acme.test/uk/about': page('About Acme UK', ['/uk/']),
  };
  const fetchImpl = async (url) => {
    const final = url.replace(/(.)\/$/, '$1');
    if (!routes[final]) return new Response('not found', { status: 404 });
    const res = new Response(routes[final], { headers: { 'content-type': 'text/html' } });
    Object.defineProperty(res, 'url', { value: final });
    return res;
  };
  const r = await check({ url: 'https://acme.test/uk', maxPages: 5, probe: false, fetchImpl });
  assert.deepEqual(r.site.pages.map((p) => p.route), ['/uk', '/uk/about']);
  assert.ok(!r.findings.some((f) => f.ruleId === 'duplicate-title'));
});

test('url mode: unrendered template placeholders in CTAs, links and text', async () => {
  const home = '<!doctype html><html lang="en"><head><title>Acme growth plans for makers</title></head><body><main><h1>Acme</h1><p>From {{ planPrice }} a month.</p><a href="{{ demoUrl }}">Book a demo</a><a href="{{ demoUrl }}">Book a demo</a><a href="{{ docsUrl }}">Read the docs</a><a href="/signup">Sign up</a></main></body></html>';
  const r = await check({ url: 'https://acme.test/', probe: false, fetchImpl: fakeFetch({ 'https://acme.test/': { body: home } }) });
  const cta = r.findings.filter((f) => f.ruleId === 'primary-cta');
  assert.equal(cta.length, 1);
  assert.match(cta[0].message, /"Book a demo" links to the unrendered template "\{\{ demoUrl \}\}" \(2 links\)/);
  const tp = r.findings.filter((f) => f.ruleId === 'template-placeholders');
  assert.equal(tp.length, 2, 'docs link and the price text, not the CTA again');
  assert.match(tp.map((f) => f.message).join('\n'), /Read the docs.*\{\{ docsUrl \}\}[\s\S]*\{\{ planPrice \}\}/);
});

test('url mode: follows the primary calls to action as an agent (cta-journey)', async () => {
  const doc = (body) => `<!doctype html><html lang="en"><head><title>Acme</title></head><body><main>${body}</main></body></html>`;
  const home = doc('<h1>Acme growth for makers</h1><a href="/signup">Start 14 days free</a><a href="/signup">Start 14 days free</a><a href="https://calendly.com/acme/demo">Book a demo</a><a href="/buy">Buy now</a>');
  const plans = doc('<h1>Plans</h1><p>Starter £29 a month.</p><a href="/signin?next=/signup">Start free trial</a><p>Growth £49 a month.</p><a href="/signin?next=/signup">Start free trial</a>');
  const signin = doc('<h1>Sign in</h1><form><input type="hidden" name="csrf"><input type="email" name="email"><button type="submit">Email me a link</button></form><button>Continue with Google</button>');
  const fetchImpl = fakeFetch({
    'https://acme.test/': { body: home },
    'https://acme.test/signup': { body: plans },
    'https://acme.test/signin?next=/signup': { body: signin },
    'https://calendly.com/acme/demo': { body: '<!doctype html><html><head><title>Calendly</title><script src="/app.js"></script></head><body><div id="root"></div></body></html>' },
  });
  const r = await check({ url: 'https://acme.test/', fetchImpl });
  const [trial, demo, buy] = r.site.journeys;
  assert.equal(trial.name, 'Start 14 days free');
  assert.equal(trial.outcome, 'handoff');
  assert.deepEqual(trial.steps.map((s) => s.url), ['https://acme.test/signup', 'https://acme.test/signin?next=/signup']);
  assert.match(trial.steps[1].notes[0], /sign-in by emailed link or Google/);
  assert.equal(demo.outcome, 'needs-browser');
  assert.match(demo.steps[0].notes[0], /Calendly page is empty without JavaScript/);
  assert.equal(buy.outcome, 'broken');
  const f = r.findings.filter((x) => x.ruleId === 'cta-journey');
  assert.deepEqual(f.map((x) => x.severity), ['info', 'warn', 'error']);
  assert.match(f[0].message, /2 "Start free trial" buttons share one URL/);
  assert.match(f[2].message, /acme\.test\/buy returns HTTP 404 to an agent/);
});

test('url mode: a contact form the agent can fill is reached, with no finding', async () => {
  const home = '<!doctype html><html lang="en"><head><title>Acme</title></head><body><main><h1>Acme</h1><a href="/contact-sales">Talk to sales</a></main></body></html>';
  const form = '<!doctype html><html lang="en"><head><title>Contact sales</title></head><body><main><h1>Contact sales</h1><form method="post" action="/contact"><input name="name"><input type="email" name="email"><textarea name="message"></textarea><button>Send</button></form></main></body></html>';
  const r = await check({ url: 'https://acme.test/', fetchImpl: fakeFetch({ 'https://acme.test/': { body: home }, 'https://acme.test/contact-sales': { body: form } }) });
  assert.equal(r.site.journeys[0].outcome, 'reached');
  assert.match(r.site.journeys[0].steps[0].notes[0], /form with 3 fields \(name, email, message\)/);
  assert.equal(r.findings.filter((x) => x.ruleId === 'cta-journey').length, 0);
});

test('CTA_TEXT: demo and call links with or without "a"', () => {
  for (const t of ['Request Demo', 'Request a demo', 'Book demo', 'Book a free call', 'Get your demo', 'See a live demo', 'Schedule a consultation']) assert.ok(CTA_TEXT.test(t), t);
  for (const t of ['Demo', 'Request', 'Book Notes', 'See all', 'Get in touch']) assert.ok(!CTA_TEXT.test(t), t);
});

test('url mode: robots.txt Sitemap lines without a scheme are flagged, and /sitemap.xml is still found', async () => {
  const fetchImpl = fakeFetch({
    'https://acme.test/': { body: '<!doctype html><html lang="en"><head><title>Acme analytics</title></head><body><main><h1>Acme</h1></main></body></html>' },
    'https://acme.test/robots.txt': { body: 'User-agent: *\nDisallow: /admin/\nSitemap: acme.test/sitemap.xml\n', headers: { 'content-type': 'text/plain' } },
    'https://acme.test/sitemap.xml': { body: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://acme.test/</loc><lastmod>2026-10-01</lastmod></url></urlset>', headers: { 'content-type': 'application/xml' } },
  });
  const r = await check({ url: 'https://acme.test/', probe: false, fetchImpl });
  assert.ok(!r.findings.some((f) => f.ruleId === 'sitemap-present'));
  const f = r.findings.filter((x) => x.ruleId === 'robots-txt');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warn');
  assert.equal(f[0].line, 3);
  assert.match(f[0].message, /"acme\.test\/sitemap\.xml" is not an absolute URL/);
});

test('url mode: a demo page whose form is a JavaScript Typeform embed needs a browser', async () => {
  const doc = (body, tail = '') => `<!doctype html><html lang="en"><head><title>Acme</title></head><body><main>${body}</main>${tail}</body></html>`;
  const nav = '<nav><a href="/">Home</a><a href="/request-demo">Request Demo</a></nav>';
  const words = 'Acme helps clinic groups launch specialist care with clinical support, software and training for every site. '.repeat(3);
  const flight = '<script>self.__next_f.push([1,"8f:[\\"$\\",\\"$L91\\",null,{\\"blockType\\":\\"typeformEmbed\\",\\"typeformId\\":\\"Xy7Kq2Lm\\"}]"])</script>';
  const routes = {
    'https://acme.test/': { body: doc(`${nav}<h1>Acme</h1><p>${words}</p><a href="/request-demo">Request Demo</a>`) },
    'https://acme.test/request-demo': { body: doc(`${nav}<h1>Request a demo</h1><p>${words}</p><div id="tf"></div>`, flight) },
  };
  const fetchImpl = fakeFetch(routes);
  const r = await check({ url: 'https://acme.test/', fetchImpl });
  const [demo] = r.site.journeys;
  assert.equal(demo.name, 'Request Demo');
  assert.equal(demo.goal, 'demo');
  assert.equal(demo.outcome, 'needs-browser');
  assert.match(demo.steps[0].notes[0], /Typeform form \(Xy7Kq2Lm\) loaded by JavaScript/);
  assert.equal(r.findings.find((x) => x.ruleId === 'cta-journey').severity, 'warn');
  assert.equal(r.site.journeys[0].form, undefined, 'no share page, no summary');
  assert.deepEqual([r.summary.agent.score, r.summary.agent.fetchOnly, r.summary.agent.browser], [50, 50, null]);
  assert.match(formatText(r), /Agent score 50\/100  can an assistant complete the main calls to action \(fetch-only 50, run with --browser/);
  assert.match(formatMarkdown(r), /Agent score 50\/100 \(fetch-only 50\)/);

  // with the share page reachable, the journey reports what the form asks and where it sends people
  const share = readFileSync(new URL('./fixtures/typeform-share-page.html', import.meta.url), 'utf8');
  const r2 = await check({ url: 'https://acme.test/', fetchImpl: fakeFetch({ ...routes, 'https://form.typeform.com/to/Xy7Kq2Lm': { body: share } }) });
  const form = r2.site.journeys[0].form;
  assert.equal(form.required, 1);
  assert.deepEqual(form.exits, [{ answers: ["I'm a clinician"], to: 'https://partners.acme.test/join' }]);
  assert.equal(form.scheduler, false);
  assert.match(r2.findings.find((x) => x.ruleId === 'cta-journey').message, /"I'm a clinician" redirects to partners\.acme\.test\/join; no booking step/);
});

test('llms-txt-cta: llms.txt names a different demo link from the page button', async () => {
  const home = '<!doctype html><html lang="en"><head><title>Acme</title></head><body><main><h1>Acme</h1><a href="https://calendly.com/acme/growth-demo">Book a demo</a></main></body></html>';
  const llms = (url) => `# Acme\n\n> Analytics for product teams.\n\n## Get started\n\n- [Book a demo](${url}): 30-minute call with the team\n- [Docs](https://acme.test/docs): how it works\n`;
  const calendly = '<!doctype html><html><head><title>Calendly</title><script src="/app.js"></script></head><body><div id="root"></div></body></html>';
  const routes = (url) => ({
    'https://acme.test/': { body: home },
    'https://acme.test/llms.txt': { body: llms(url), headers: { 'content-type': 'text/plain' } },
    'https://calendly.com/acme/growth-demo': { body: calendly },
  });
  const r = await check({ url: 'https://acme.test/', fetchImpl: fakeFetch(routes('https://calendly.com/acme/old-demo')) });
  const f = r.findings.filter((x) => x.ruleId === 'llms-txt-cta');
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 7);
  assert.match(f[0].message, /llms\.txt links "Book a demo" \(calendly\.com\/acme\/old-demo\) to book a demo or call, but the page's "Book a demo" goes to calendly\.com\/acme\/growth-demo/);
  const same = await check({ url: 'https://acme.test/', fetchImpl: fakeFetch(routes('https://calendly.com/acme/growth-demo/')) });
  assert.equal(same.findings.filter((x) => x.ruleId === 'llms-txt-cta').length, 0);
});
