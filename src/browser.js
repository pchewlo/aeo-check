// Optional --browser mode: drive the primary calls to action in headless Chromium the way a browser
// agent (ChatGPT agent, Claude in Chrome) would, up to the final submit button and never past it.
// Every request other than GET, HEAD and OPTIONS is aborted, so nothing is sent, booked or paid for.
import { CTA_TEXT } from './rules/_util.js';

export const TEST_DATA = {
  first: 'Agent', last: 'Test', full: 'Agent Test', email: 'agent.test@example.com', phone: '+44 7400 123456',
  company: 'Example Ltd', url: 'https://example.com', text: 'Agent test', password: 'Agent-test-only-1',
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const NEXT = /^(ok|next( step| question)?|continue|begin|start|proceed|let'?s go|go)\s*[→›>»]?$/i;
const FINAL = /^(submit|send|email me|confirm|request|book|schedule|reserve|create\b.*\baccount|sign ?up|register|join|complete|finish|place order|pay|subscribe|start (my |your |a )?(free )?trial|get started|apply)\b/i;
const COOKIE_BUTTONS = ['Reject all', 'Deny', 'Decline', 'Only necessary', 'Necessary only', 'Reject', 'Accept all', 'Accept', 'Allow all', 'I agree', 'Got it'];
const CAPTCHA_FRAME = /recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha/;
// card fields, not the invisible fraud-detection frames payment providers load on every page
const PAY_FRAME = /js\.stripe\.com\/v3\/elements-inner|checkout\.stripe\.com|braintreegateway\.com|checkoutshopper[^/]*\.adyen\.com|paypal\.com\/sdk|squareup|checkout\.com/;
const MAX_STEPS = 12;

export async function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try { return await import(name); } catch {}
  }
  throw new Error('--browser needs Playwright: npm install -D playwright && npx playwright install chromium');
}

/** The test value an agent would type into a field, or a stop reason for card fields. */
export function valueFor(m) {
  const k = `${m.name || ''} ${m.id || ''} ${m.placeholder || ''} ${m.autocomplete || ''} ${m.label || ''}`.toLowerCase();
  if (/cc-|card ?number|\bcard\b|cvc|cvv|expir/.test(k)) return { card: true };
  if (m.type === 'email' || /e-?mail/.test(k)) return { value: TEST_DATA.email };
  if (m.type === 'tel' || /phone|mobile|\btel\b/.test(k)) return { value: TEST_DATA.phone };
  if (m.type === 'password') return { value: TEST_DATA.password };
  if (m.type === 'url' || /website|\burl\b|domain/.test(k)) return { value: TEST_DATA.url };
  if (m.type === 'number') return { value: '10' };
  if (m.type === 'date') return { value: '2026-12-01' };
  if (/first|given|fname/.test(k)) return { value: TEST_DATA.first };
  if (/last|family|surname|lname/.test(k)) return { value: TEST_DATA.last };
  if (/\bname\b/.test(k)) return { value: TEST_DATA.full };
  if (/company|organi[sz]ation|business|practice|clinic|group|employer|team/.test(k)) return { value: TEST_DATA.company };
  if (/zip|postcode|postal/.test(k)) return { value: 'SW1A 1AA' };
  if (/city|town/.test(k)) return { value: 'London' };
  return { value: TEST_DATA.text };
}

/** Why a click would fail, in words, from Playwright's actionability log; null when it would work. */
export function clickProblem(message) {
  if (!message) return null;
  if (/outside of the viewport/i.test(message)) return 'is outside the visible area';
  const cover = message.match(/<([a-z][a-z0-9-]*)\b[^>]*>(?:.*?<\/\1>)?(?: from <iframe[^>]*> subtree)? intercepts pointer events/i);
  if (cover) return `is covered by a <${cover[1]}>`;
  if (/not enabled|disabled/i.test(message)) return 'is disabled';
  if (/not visible/i.test(message)) return 'is not visible';
  return 'cannot be clicked';
}

/** CTAs that appear only after JavaScript, or whose link JavaScript changes. */
export function diffCtas(server, rendered) {
  const out = [];
  const byName = new Map();
  for (const c of server) {
    const k = c.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, new Set());
    byName.get(k).add(c.href || '');
  }
  const seen = new Set();
  for (const c of rendered) {
    const k = c.name.toLowerCase();
    const key = `${k} ${c.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byName.has(k)) out.push({ kind: 'js-only', name: c.name, rendered: c.href });
    else if (c.href && !byName.get(k).has(c.href)) out.push({ kind: 'href-changed', name: c.name, server: [...byName.get(k)].filter(Boolean)[0] || null, rendered: c.href });
  }
  return out;
}

// example.co.uk -> example.co.uk, api.example.com -> example.com
export const siteOf = (u) => {
  try {
    const parts = new URL(u).hostname.split('.');
    return parts.slice(/^(co|com|org|net|ac|gov)$/.test(parts[parts.length - 2]) && parts.length > 2 ? -3 : -2).join('.');
  } catch { return null; }
};

/** Validation messages that may come from a server check the walker blocked rather than from the input. */
export function noteBlockedChecks(res, blockedUrls) {
  const sites = new Set(res.steps.map((s) => siteOf(s.url)));
  const hit = [...new Set(blockedUrls.filter((u) => sites.has(siteOf(u))).map((u) => { try { return new URL(u).host; } catch { return u; } }))];
  if (!hit.length) return;
  let flagged = false;
  res.friction = res.friction.map((f) => (/^validation messages/.test(f) ? (flagged = true, `${f} (possibly because the walker blocked the site's own request to ${hit.slice(0, 2).join(', ')})`) : f));
  // the form may only be held back by the walker's own safety block, so it cannot say "stuck"
  if (flagged && res.outcome === 'stuck' && /is disabled/.test(res.stop || '')) {
    res.outcome = 'unconfirmed';
    res.stop = `${res.stop} The site checks the form with its own request to ${hit[0]}, which the walker blocks so that nothing is sent, so whether an agent could submit is unconfirmed.`;
  }
}

const host = (u) => { try { const x = new URL(u); return x.host + (x.pathname === '/' ? '' : x.pathname); } catch { return u; } };

async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function dismissCookies(page) {
  for (const name of COOKIE_BUTTONS) {
    const b = page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
    if (await b.count().catch(() => 0)) { await b.click({ timeout: 2000 }).catch(() => {}); return name; }
  }
  return null;
}

// In the page: can a person see and use this element? Forms like Typeform keep inactive questions
// in the DOM at opacity 0 with pointer events off, so getClientRects alone is not enough.
const USABLE = `(e) => {
  if (!e.getClientRects().length) return false;
  let op = 1;
  for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
    const cs = getComputedStyle(n);
    op *= Number(cs.opacity);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || n.inert || n.getAttribute('aria-hidden') === 'true') return false;
  }
  return op > 0.1;
}`;

const visibleFrames = (page) => page.frames().filter((f) => !f.isDetached());

/** CTA links and buttons in the rendered page. */
async function renderedCtas(page) {
  return page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll('a, button')].filter((e) => e.getClientRects().length).map((e) => ({
      name: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '),
      href: e.tagName === 'A' && e.getAttribute('href') ? new URL(e.getAttribute('href'), location.href).href : null,
    })).filter((c) => c.name && re.test(c.name));
  }, CTA_TEXT.source);
}

/** Visible error or validation text in a frame. */
async function errorsIn(frame) {
  return frame.evaluate(() => [...document.querySelectorAll('[role=alert], [aria-live="assertive"], [class*="error" i], [class*="invalid" i]')]
    .filter((e) => e.getClientRects().length && !e.querySelector('input, select, textarea, button') && e.innerText && e.innerText.trim().length > 3 && e.innerText.trim().length < 140)
    .map((e) => e.innerText.trim().replace(/\s+/g, ' '))).catch(() => []);
}

/** Fill the visible, empty fields in a frame. Returns { filled, card }. */
async function fillFrame(frame, res) {
  let filled = 0;
  const fields = frame.locator('input, textarea, select');
  const n = await fields.count().catch(() => 0);
  const radiosDone = new Set();
  for (let i = 0; i < n; i++) {
    const el = fields.nth(i);
    const m = await el.evaluate((e, usable) => {
      // the label element, an aria-label, or for custom checkboxes the text wrapped around them
      const near = e.closest('label') || (e.type === 'checkbox' || e.type === 'radio' ? e.parentElement && e.parentElement.parentElement : null);
      const lab = (e.labels && e.labels[0] && e.labels[0].innerText) || e.getAttribute('aria-label') || (near && near.innerText.length < 200 ? near.innerText : '') || '';
      return {
        tag: e.tagName.toLowerCase(), type: (e.getAttribute('type') || '').toLowerCase(), name: e.name, id: e.id, placeholder: e.placeholder || '',
        autocomplete: e.getAttribute('autocomplete') || '', label: lab.trim(), value: e.value, checked: e.checked, required: e.required || e.getAttribute('aria-required') === 'true',
        visible: (0, eval)(usable)(e),
        // custom checkboxes hide the input behind a styled box; the label is what a person clicks
        proxy: !(0, eval)(usable)(e) && (
          ((e.type === 'checkbox' || e.type === 'radio') && (0, eval)(usable)(e.closest('label') || e.parentElement))
          || ((e.getAttribute('role') === 'combobox' || e.type === 'search') && !!e.parentElement && !!e.parentElement.parentElement && (0, eval)(usable)(e.parentElement.parentElement))),
        // a custom select shows its placeholder while nothing is chosen
        emptySelect: (() => { let n = e; for (let k = 0; k < 4 && n; k++, n = n.parentElement) { const ph = n.querySelector('[class*="placeholder" i]'); if (ph && ph.getClientRects().length) return true; } return false; })(),
        disabled: e.disabled || (e.readOnly && e.getAttribute('role') !== 'combobox'), role: e.getAttribute('role') || '', group: e.name,
        selectedIndex: e.selectedIndex,
      };
    }, USABLE).catch(() => null);
    if (!m || (!m.visible && !m.proxy) || m.disabled || /^(hidden|submit|button|image|reset|file)$/.test(m.type)) continue;
    const tick = () => (m.proxy ? el.locator('xpath=ancestor::label[1] | ..').last().click({ timeout: 2000 }) : el.check({ force: true, timeout: 2000 }));
    try {
      if (m.tag === 'select') {
        if (m.selectedIndex > 0) continue;
        await el.selectOption({ index: 1 }, { timeout: 2000 }); filled++; continue;
      }
      if (m.type === 'checkbox') {
        if (m.checked) continue;
        if (m.required || (/agree|terms|conditions|privacy/i.test(m.label) && !/marketing|newsletter|offers|updates/i.test(m.label))) { await tick(); filled++; }
        continue;
      }
      if (m.type === 'radio') {
        if (radiosDone.has(m.group)) continue;
        radiosDone.add(m.group);
        const checked = await frame.locator(`input[type=radio][name="${m.group}"]:checked`).count().catch(() => 0);
        if (!checked) { await tick(); filled++; }
        continue;
      }
      if (m.value) continue;
      if (m.role === 'combobox' || m.type === 'search') {
        if (!m.emptySelect) continue;
        // the typing input of a custom select is tiny; click it, or the control around it
        if (m.proxy || await problemClicking(el)) await el.locator('xpath=../..').click({ timeout: 2000 });
        else await el.click({ timeout: 2000 });
        await frame.page().waitForTimeout(300);
        let opt = frame.getByRole('option').filter({ visible: true }).first();
        if (!(await opt.count())) opt = frame.locator('[class*="option" i]:not([class*="options" i])').filter({ visible: true }).first();
        if (await opt.count()) { await opt.click({ timeout: 2000 }); filled++; }
        else await frame.page().keyboard.press('Escape');
        continue;
      }
      const v = valueFor(m);
      if (v.card) return { filled, card: true };
      await el.fill(v.value, { timeout: 2000 });
      res.lastField = m.label || m.placeholder || m.name || m.type;
      filled++;
    } catch (e) {
      res.friction.push(`could not fill "${m.label || m.placeholder || m.name || m.type}" (${clickProblem(e.message)})`);
    }
  }
  // ARIA radio groups that are not inputs (Typeform, custom pickers)
  const radios = frame.getByRole('radio');
  const rn = await radios.count().catch(() => 0);
  for (let i = 0; i < rn && !radiosDone.size; i++) {
    const r = radios.nth(i);
    const st = await r.evaluate((e, usable) => ({ ok: (0, eval)(usable)(e), input: e.tagName === 'INPUT', group: e.closest('[role=radiogroup]') && [...e.closest('[role=radiogroup]').querySelectorAll('[role=radio]')].some((x) => x.getAttribute('aria-checked') === 'true') }), USABLE).catch(() => null);
    if (!st || !st.ok || st.input) continue;
    if (!st.group) {
      const label = ((await r.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ').replace(/^[A-Z]\s/, '');
      const problem = await problemClicking(r);
      if (!problem) await r.click({ timeout: 2000 }).then(() => filled++, () => {});
      else {
        res.friction.push(`the answer "${label}" ${problem}; the agent picked it with the keyboard`);
        await r.focus().catch(() => {});
        await r.press('Space').then(() => filled++, () => {});
      }
    }
    break;
  }
  return { filled, card: false };
}

/** First visible button in any frame whose name matches re. */
async function findButton(frames, re, { exclude, linksToo = false } = {}) {
  let fallback = null;
  for (const f of frames) {
    const cands = f.locator(linksToo ? 'button, input[type=submit], [role=button], a[href]' : 'button, input[type=submit], [role=button]');
    const n = await cands.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const b = cands.nth(i);
      const info = await b.evaluate((e, usable) => ({ name: (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '), aria: (e.getAttribute('aria-label') || '').trim(), visible: (0, eval)(usable)(e), link: e.tagName === 'A' }), USABLE).catch(() => null);
      // calendars often show "22" and keep "Wednesday 22 October - Times available" in the label
      const matches = (x) => x && re.test(x) && !(exclude && exclude.test(x));
      if (!info || !info.visible || !info.name || !(matches(info.name) || matches(info.aria))) continue;
      const hit = { loc: b, name: info.name, link: info.link, frame: f };
      // prefer a control that can be clicked; remember the first match in case none can
      if (!(await problemClicking(b))) return hit;
      if (!fallback) fallback = hit;
    }
  }
  return fallback;
}

async function problemClicking(loc) {
  try { await loc.click({ trial: true, timeout: 2500 }); return null; } catch (e) { return clickProblem(e.message); }
}

// Enter in a native form submits it; a POST is aborted by the route, a GET would really be sent
async function pressEnter(page) {
  for (const f of page.frames()) {
    const getForm = await f.evaluate(() => {
      const a = document.hasFocus() && document.activeElement;
      const form = a && a !== document.body && a.closest && a.closest('form');
      return !!form && (form.getAttribute('method') || 'get').toLowerCase() === 'get';
    }).catch(() => false);
    if (getForm) return false;
  }
  await page.keyboard.press('Enter').catch(() => {});
  return true;
}

async function signature(page) {
  const parts = await Promise.all(visibleFrames(page).map((f) => f.evaluate(() => `${document.body ? document.body.innerText.length : 0}:${[...document.querySelectorAll('input,textarea')].map((e) => e.value).join('|')}`).catch(() => '')));
  return `${page.url()}#${parts.join(';')}`;
}

/** Walk from the current page to the final submit button. */
export async function walk(page, res, { shot } = {}) {
  let last = '', still = 0, action = null, idle = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    await settle(page);
    await dismissCookies(page);
    const frames = visibleFrames(page);
    const sig = await signature(page);
    if (action && sig === last) {
      ++still;
      // what an agent tries next when an action changes nothing: the keyboard, then scrolling
      if (still === 1) { res.friction.push(`${action} did nothing; the agent pressed Enter`); await pressEnter(page); action = 'pressing Enter'; continue; }
      if (still === 2) {
        res.friction.push('Enter did nothing either; the agent scrolled');
        const box = frames.length > 1 ? await frames[frames.length - 1].frameElement().then((e) => e.boundingBox()).catch(() => null) : null;
        if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 500);
        action = 'scrolling';
        continue;
      }
      const errors = (await Promise.all(frames.map(errorsIn))).flat();
      res.outcome = 'stuck';
      res.stop = errors.length
        ? `It could not get past: ${[...new Set(errors)].slice(0, 2).map((e) => `"${e}"`).join(', ')}.`
        : `Stuck${res.lastField ? ` after filling "${res.lastField}"` : ''}: clicking, pressing Enter and scrolling all left the form where it was.`;
      return res;
    }
    if (sig !== last) still = 0;
    last = sig;
    action = null;
    const url = page.url();
    if (!res.steps.length || res.steps[res.steps.length - 1].url !== url) res.steps.push({ url, notes: [] });
    const step = res.steps[res.steps.length - 1];
    for (const f of frames.slice(1)) {
      const shown = (PAY_FRAME.test(f.url()) || CAPTCHA_FRAME.test(f.url())) && await f.frameElement().then(async (e) => {
        const box = await e.boundingBox();
        return !!box && box.width >= 60 && box.height >= 30 && await e.evaluate((x, usable) => (0, eval)(usable)(x), USABLE);
      }).catch(() => false);
      if (PAY_FRAME.test(f.url()) && shown) { res.outcome = 'handoff'; res.stop = 'Payment fields: the user has to enter or confirm their card.'; return res; }
      if (CAPTCHA_FRAME.test(f.url()) && !res.captcha) {
        res.captcha = true;
        if (shown) res.friction.push('a captcha is shown');
        else step.notes.push('invisible score-based captcha on the page');
      }
      if (/(^|\.)(typeform\.com|calendly\.com|hubspot\.com|tally\.so|jotform\.com|cal\.com|chilipiper\.com)$|^docs\.google\.com$/.test((() => { try { return new URL(f.url()).hostname; } catch { return ''; } })())) {
        const label = `form inside an iframe from ${new URL(f.url()).host}`;
        if (!step.notes.includes(label)) step.notes.push(label);
      }
    }
    if (shot) await shot(page, i);
    let filled = 0;
    for (const f of frames) {
      const r = await fillFrame(f, res);
      filled += r.filled;
      if (r.card) { res.outcome = 'handoff'; res.stop = 'Payment fields: the user has to enter or confirm their card.'; return res; }
    }
    res.filled += filled;

    // a booking slot (Calendly and similar): pick a day, then a time
    // pick one slot only; after that the scheduler's own Next button takes over
    const time = !res.slot && await findButton(frames, /^\d{1,2}[:.]\d{2}\s?(am|pm)?$/i);
    const day = !res.slot && !time && await findButton(frames, /times? available/i);
    if (time || day) {
      const pick = time || day;
      if (!(await problemClicking(pick.loc))) { await pick.loc.click(); if (time) res.slot = time.name; step.notes.push(`picked ${time ? `time ${time.name}` : 'a day with times'}`); action = `picking ${time ? time.name : 'a day'}`; continue; }
    }

    const final = await findButton(frames, FINAL, { exclude: NEXT });
    if (final && !final.link && res.filled > 0) {
      const problem = await problemClicking(final.loc);
      const errors = (await Promise.all(frames.map(errorsIn))).flat();
      res.final = final.name;
      if (errors.length) res.friction.push(`validation messages showing: ${[...new Set(errors)].slice(0, 3).map((e) => `"${e}"`).join(', ')}`);
      if (problem) { res.outcome = 'stuck'; res.stop = `The "${final.name}" button ${problem}.`; }
      else if (/\b(link|code)\b/i.test(final.name)) { res.outcome = 'handoff'; res.stop = `Stopped at "${final.name}": the user has to open the emailed link or code.`; }
      else { res.outcome = 'reached'; res.stop = `Stopped at "${final.name}" without pressing it.`; }
      return res;
    }

    // with no next button, follow a call-to-action link (a plan's "Start free trial", "Continue to checkout")
    const visited = res.visited || (res.visited = new Set());
    visited.add(page.url().split('#')[0]);
    let next = await findButton(frames, NEXT);
    if (!next && !filled) {
      const link = await findButton(frames, CTA_TEXT, { linksToo: true });
      const href = link && link.link && await link.loc.evaluate((e) => e.href).catch(() => null);
      if (href && !visited.has(href.split('#')[0])) { next = link; step.notes.push(`next: "${link.name}"`); }
    }
    if (next) {
      const problem = await problemClicking(next.loc);
      if (!problem) { await next.loc.click().catch(() => {}); action = `clicking "${next.name}"`; }
      else { res.friction.push(`"${next.name}" ${problem}; the agent pressed Enter instead`); await pressEnter(page); action = 'pressing Enter'; }
      if (res.trace) res.trace.push(`step ${i}: filled ${filled}, next "${next.name}"${problem ? ` (${problem})` : ''}`);
    } else if (filled) {
      if (await pressEnter(page)) action = 'pressing Enter';
      else { res.outcome = 'reached'; res.stop = 'Filled the form, which submits on Enter; stopped before submitting.'; return res; }
    }

    if (res.trace && !next) res.trace.push(`step ${i}: filled ${filled}, no next button${final ? ` (saw "${final.name}")` : ''}`);
    // a page can still be loading the form; give up after two idle steps
    if (action) idle = 0;
    else if (++idle >= 3) { res.outcome = 'stuck'; res.stop = 'Nothing on the page moved it forward (no next button, form or link).'; return res; }
  }
  res.outcome = 'stuck';
  res.stop = `No final submit button after ${MAX_STEPS} steps.`;
  return res;
}

/**
 * Follow the start page's calls to action in a real browser.
 * serverCtas: [{ name, href }] from the server HTML; journeys: the fetch-only journeys (names to follow).
 */
export async function runBrowserJourneys(startUrl, { serverCtas = [], journeys = [], log = () => {}, playwright } = {}) {
  const pw = playwright || await loadPlaywright();
  const browser = await pw.chromium.launch();
  const blocked = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route('**/*', (route) => {
      const r = route.request();
      if (!SAFE_METHODS.has(r.method())) { blocked.push(r.url()); return route.abort(); }
      return route.continue();
    });
    const page = await ctx.newPage();
    log(`browser: ${startUrl}`);
    await page.goto(startUrl, { timeout: 30000 }).catch(() => {});
    await settle(page);
    await dismissCookies(page);
    const rendered = await renderedCtas(page).catch(() => []);
    const diff = diffCtas(serverCtas, rendered);
    await page.close();

    // one walk per distinct destination: the same label can lead to different flows
    const targets = [];
    const add = (name, href) => { if (!targets.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.href === href)) targets.push({ name, href }); };
    for (const j of journeys) for (const c of rendered) if (c.name.toLowerCase() === j.name.toLowerCase()) add(c.name, c.href);
    for (const c of rendered) add(c.name, c.href);
    for (const j of journeys) if (!targets.some((t) => t.name.toLowerCase() === j.name.toLowerCase())) add(j.name, null);
    const out = [];
    for (const { name, href } of targets.slice(0, 3)) {
      const res = { name, href, outcome: null, stop: null, steps: [], friction: [], filled: 0, final: null, slot: null, captcha: false, trace: [] };
      out.push(res);
      const p = await ctx.newPage();
      try {
        log(`browser journey ${name}`);
        await p.goto(startUrl, { timeout: 30000 });
        await settle(p);
        await dismissCookies(p);
        await p.evaluate(([n, h]) => {
          const el = [...document.querySelectorAll('a, button')].find((e) => e.getClientRects().length && (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').toLowerCase() === n.toLowerCase()
            && (!h || (e.tagName === 'A' && new URL(e.getAttribute('href') || '', location.href).href === h)));
          if (el) el.setAttribute('data-aeo-target', '');
        }, [name, href]);
        const cta = p.locator('[data-aeo-target]').first();
        if (!(await cta.count())) { res.outcome = 'broken'; res.stop = `No visible "${name}" link or button on the rendered page.`; continue; }
        const problem = await problemClicking(cta);
        if (problem) { res.outcome = 'broken'; res.stop = `The "${name}" call to action ${problem}.`; continue; }
        const before = p.url();
        const popup = ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null);
        await cta.click();
        const opened = await popup;
        if (!opened) await p.waitForURL((u) => u.href !== before, { timeout: 8000, waitUntil: 'commit' }).catch(() => {});
        const mark = blocked.length;
        await walk(opened || p, res);
        noteBlockedChecks(res, blocked.slice(mark));
        if (opened) await opened.close().catch(() => {});
      } catch (e) {
        res.outcome = 'broken';
        res.stop = `The browser failed: ${e.message.split('\n')[0]}`;
      } finally {
        await p.close().catch(() => {});
      }
    }

    // answers that send people out of the form (e.g. a Typeform redirect ending): picking one would
    // submit the form, so walk the destination directly
    const exits = journeys.flatMap((j) => ((j.form && j.form.exits) || []).map((e) => ({ cta: j.name, provider: j.form.provider, ...e }))).slice(0, 2);
    for (const e of exits) {
      const answer = e.answers.join('" or "');
      const res = { name: `${e.cta} → "${answer}"`, cta: e.cta, href: e.to, branch: true, outcome: null, stop: null, steps: [], friction: [], filled: 0, final: null, slot: null, captcha: false, trace: [] };
      out.push(res);
      const p = await ctx.newPage();
      try {
        log(`browser branch ${res.name}`);
        await p.goto(e.to, { timeout: 30000 });
        const mark = blocked.length;
        await walk(p, res);
        noteBlockedChecks(res, blocked.slice(mark));
        if (res.steps[0]) res.steps[0].notes.unshift(`the ${e.provider} sends "${answer}" here; walked from this page`);
      } catch (err) {
        res.outcome = 'broken';
        res.stop = `The browser failed: ${err.message.split('\n')[0]}`;
      } finally {
        await p.close().catch(() => {});
      }
    }
    return { journeys: out, ctaDiff: diff, blocked: blocked.length };
  } finally {
    await browser.close();
  }
}

export const describeSteps = (res) => res.steps.map((s) => host(s.url) + (s.notes.length ? ` (${s.notes.join('; ')})` : '')).join(' → ');
