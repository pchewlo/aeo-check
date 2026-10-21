import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { valueFor, clickProblem, diffCtas, runBrowserJourneys, noteBlockedChecks } from '../src/browser.js';
import { agentScore } from '../src/agent-score.js';
import { RULES_BY_ID } from '../src/rules/index.js';

test('browser: test values by field type and label, and card fields stop the walk', () => {
  assert.equal(valueFor({ type: 'email' }).value, 'agent.test@example.com');
  assert.equal(valueFor({ type: 'text', label: 'First name' }).value, 'Agent');
  assert.equal(valueFor({ type: 'text', placeholder: 'Smith', label: 'Last name' }).value, 'Test');
  assert.equal(valueFor({ type: 'tel' }).value, '+44 7400 123456');
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

const SITE = {
  pages: [{ file: 'https://acme.test/' }],
  journeys: [
    { name: 'Request Demo', count: 3, outcome: 'needs-browser', steps: [] },
    { name: 'Start free trial', count: 1, outcome: 'handoff', steps: [] },
  ],
  browser: {
    journeys: [
      { name: 'Request Demo', href: 'https://forms.acme.test/to/abc', outcome: 'reached', stop: 'Stopped at "Submit" without pressing it.', steps: [{ url: 'https://forms.acme.test/to/abc', notes: [] }], friction: [] },
      { name: 'Request Demo', href: 'https://acme.test/request-demo', outcome: 'stuck', stop: 'Stuck after filling "Company".', steps: [{ url: 'https://acme.test/request-demo', notes: ['form inside an iframe from forms.acme.test'] }], friction: ['clicking "OK" did nothing; the agent pressed Enter'] },
      { name: 'Start free trial', href: 'https://acme.test/signup', outcome: 'handoff', stop: 'Payment fields: the user has to enter or confirm their card.', steps: [{ url: 'https://acme.test/signup', notes: [] }], friction: [] },
    ],
    ctaDiff: [{ kind: 'href-changed', name: 'Request Demo', server: 'https://acme.test/request-demo', rendered: 'https://forms.acme.test/to/abc' }],
  },
};

test('cta-browser: stuck walks are errors, card hand-offs info, and changed CTA links warnings', () => {
  const f = RULES_BY_ID['cta-browser'].check(SITE);
  assert.deepEqual(f.map((x) => x.severity), ['error', 'info', 'warn']);
  assert.match(f[0].message, /In a browser, "Request Demo" \(to acme\.test\/request-demo\) got stuck: .*Stuck after filling "Company"\. Friction: clicking "OK" did nothing/);
  assert.match(f[2].message, /goes to acme\.test\/request-demo in the HTML but to forms\.acme\.test\/to\/abc once JavaScript runs/);
  assert.deepEqual(RULES_BY_ID['cta-browser'].check({ ...SITE, browser: undefined }), []);
});

test('agent score: fetch-only and browser results, primary CTA weighted 60%', () => {
  const a = agentScore(SITE);
  // Request Demo: fetch 50, browser avg(100, 30) = 65 -> 0.4*50 + 0.6*65 = 59; Start free trial: 90 both -> 90
  assert.deepEqual(a.ctas.map((c) => [c.name, c.fetchOnly, c.browser, c.score]), [['Request Demo', 50, 65, 59], ['Start free trial', 90, 90, 90]]);
  assert.equal(a.score, Math.round(0.6 * 59 + 0.4 * 90));
  assert.equal(a.fetchOnly, Math.round(0.6 * 50 + 0.4 * 90));
  assert.equal(agentScore({ ...SITE, browser: undefined }).browser, null);
  assert.equal(agentScore({ pages: [], journeys: [] }), null);
});

test('browser: validation messages that may come from a blocked server check are marked', () => {
  const res = { steps: [{ url: 'https://app.acme.test/join', notes: [] }], friction: ['validation messages showing: "An account already exists with this email"', 'a captcha is on the page'] };
  noteBlockedChecks(res, ['https://api.acme.test/v1/check-email', 'https://www.google-analytics.com/g/collect']);
  assert.equal(res.friction[0], 'validation messages showing: "An account already exists with this email" (possibly because the walker blocked the site\'s own request to api.acme.test)');
  assert.equal(res.friction[1], 'a captcha is on the page');

  const held = { steps: [{ url: 'https://app.acme.test/join', notes: [] }], outcome: 'stuck', stop: 'The "Create account" button is disabled.', friction: ['validation messages showing: "Email already registered"'] };
  noteBlockedChecks(held, ['https://api.acme.test/v1/check-email']);
  assert.equal(held.outcome, 'unconfirmed');
  assert.match(held.stop, /checks the form with its own request to api\.acme\.test, which the walker blocks/);
});

test('agent score: a walk down a form branch counts towards its CTA', () => {
  const site = { pages: [], journeys: [{ name: 'Request Demo', count: 2, outcome: 'needs-browser', steps: [] }], browser: { journeys: [
    { name: 'Request Demo', outcome: 'reached', friction: [], steps: [] },
    { name: 'Request Demo → "I\'m a clinician"', cta: 'Request Demo', branch: true, outcome: 'stuck', friction: [], steps: [] },
  ] } };
  const a = agentScore(site);
  assert.equal(a.ctas.length, 1);
  assert.equal(a.ctas[0].browser, 65);
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

test('browser: walks a form branch that redirects out of the form, without submitting', { skip: !playwright && 'Playwright not installed' }, async () => {
  const posts = [];
  const pages = {
    '/': '<!doctype html><html lang="en"><head><title>Acme</title></head><body><main><h1>Acme</h1><a href="/demo">Request Demo</a></main></body></html>',
    '/demo': '<!doctype html><html lang="en"><head><title>Demo</title></head><body><main><h1>Demo</h1><p>Loading form</p></main></body></html>',
    '/join': `<!doctype html><html lang="en"><head><title>Join</title></head><body><main><h1>Create your account</h1><form method="post" action="/accounts">
      <input placeholder="First Name"><input type="email" placeholder="Email Address"><input type="password" placeholder="Password">
      <label><input type="checkbox" required> I agree to the Terms</label><button type="submit">Create Free Account</button></form></main></body></html>`,
  };
  const srv = createServer((req, res) => {
    if (req.method !== 'GET') { posts.push(req.url); res.end('ok'); return; }
    res.setHeader('content-type', 'text/html');
    res.end(pages[req.url] || 'not found');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const journeys = [{ name: 'Request Demo', outcome: 'needs-browser', steps: [], form: { provider: 'Typeform', url: 'https://form.typeform.com/to/x', exits: [{ answers: ["I'm a clinician"], to: `${base}/join` }] } }];
    const r = await runBrowserJourneys(`${base}/`, { serverCtas: [{ name: 'Request Demo', href: `${base}/demo` }], journeys, playwright });
    const branch = r.journeys.find((j) => j.branch);
    assert.equal(branch.name, 'Request Demo → "I\'m a clinician"');
    assert.equal(branch.outcome, 'reached');
    assert.equal(branch.final, 'Create Free Account');
    assert.match(branch.steps[0].notes[0], /the Typeform sends "I'm a clinician" here/);
    assert.deepEqual(posts, []);
  } finally {
    srv.close();
  }
});
