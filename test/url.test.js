import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/index.js';

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
