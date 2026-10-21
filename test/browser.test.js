import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { valueFor, clickProblem, diffCtas, runBrowserJourneys } from '../src/browser.js';

test('browser: test values by field type and label, and card fields stop the walk', () => {
  assert.equal(valueFor({ type: 'email' }).value, 'agent.test@example.com');
  assert.equal(valueFor({ type: 'text', label: 'First name' }).value, 'Agent');
  assert.equal(valueFor({ type: 'text', placeholder: 'Smith', label: 'Last name' }).value, 'Test');
  assert.equal(valueFor({ type: 'tel' }).value, '07400 123456');
  assert.equal(valueFor({ type: 'text', label: 'Which clinic group are you with?' }).value, 'Example Ltd');
  assert.ok(valueFor({ type: 'text', autocomplete: 'cc-number' }).card);
  assert.ok(valueFor({ type: 'text', name: 'cvc' }).card);
});

test('browser: Playwright actionability errors in words', () => {
  assert.equal(clickProblem('element is outside of the viewport'), 'is outside the visible area');
  assert.equal(clickProblem('<div class="overlay"></div> intercepts pointer events'), 'is covered by a <div>');
  assert.equal(clickProblem('element is not enabled'), 'is disabled');
  assert.equal(clickProblem(null), null);
});

test('browser: CTAs that appear or change only after JavaScript', () => {
  const server = [{ name: 'Request Demo', href: 'https://acme.test/request-demo' }];
  const rendered = [
    { name: 'Request Demo', href: 'https://acme.test/request-demo' },
    { name: 'Request Demo', href: 'https://forms.acme.test/to/abc' },
    { name: 'Start free trial', href: 'https://acme.test/signup' },
  ];
  assert.deepEqual(diffCtas(server, rendered), [
    { kind: 'href-changed', name: 'Request Demo', server: 'https://acme.test/request-demo', rendered: 'https://forms.acme.test/to/abc' },
    { kind: 'js-only', name: 'Start free trial', rendered: 'https://acme.test/signup' },
  ]);
});

let playwright = null;
try { playwright = await import('playwright'); } catch {}

test('browser: walks a demo form to the submit button and sends nothing', { skip: !playwright && 'Playwright not installed' }, async () => {
  const posts = [];
  const pages = {
    '/': '<!doctype html><html lang="en"><head><title>Acme</title></head><body><main><h1>Acme</h1><a href="/demo">Request Demo</a></main></body></html>',
    '/demo': `<!doctype html><html lang="en"><head><title>Demo</title></head><body><main><h1>Book a demo</h1>
      <form method="post" action="/lead"><label>First name <input name="first"></label><label>Work email <input type="email" name="email" required></label>
      <label><input type="checkbox" name="terms" required> I agree to the terms</label><label><input type="checkbox" name="news"> Send me marketing updates</label>
      <button type="submit">Request a demo</button></form></main></body></html>`,
  };
  const srv = createServer((req, res) => {
    if (req.method !== 'GET') { posts.push(`${req.method} ${req.url}`); res.end('ok'); return; }
    res.setHeader('content-type', 'text/html');
    res.end(pages[req.url] || 'not found');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await runBrowserJourneys(`${base}/`, { serverCtas: [{ name: 'Request Demo', href: `${base}/demo` }], playwright });
    const [j] = r.journeys;
    assert.equal(j.outcome, 'reached');
    assert.equal(j.final, 'Request a demo');
    assert.equal(j.filled, 3, 'first name, email and the terms box; not the marketing box');
    assert.deepEqual(r.ctaDiff, []);
    assert.deepEqual(posts, [], 'nothing reaches the server');
  } finally {
    srv.close();
  }
});
