// Follow a page's primary calls to action the way an agent acting for a user does: fetch the link
// (no JavaScript), look at what is there, and keep going until it reaches something it can use,
// something only the user can finish, or a dead end.
import { parseMarkup, attr, ancestors } from './parse/markup.js';
import { CTA_TEXT, TEMPLATE_TOKEN, TEMPLATE_TOKENS, words } from './rules/_util.js';

export const MAX_STEPS = 4;
const MAX_JOURNEYS = 3;

const PRICE = /[£$€¥₹]\s?\d[\d,.]*/g;
const OAUTH = /\b(continue|sign (in|up)|log ?in|register) with (google|apple|microsoft|github|facebook|linkedin|slack)\b|^(google|apple|microsoft)$/i;
const OAUTH_HREF = /accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|github\.com\/login\/oauth|\/(auth|oauth|sso)\/(google|apple|microsoft|github)/i;
const PROVIDERS = [
  [/(^|\.)calendly\.com$/, 'Calendly'], [/(^|\.)cal\.com$/, 'Cal.com'], [/^meetings(-[a-z0-9]+)?\.hubspot\.com$/, 'HubSpot Meetings'],
  [/(^|\.)savvycal\.com$/, 'SavvyCal'], [/(^|\.)chilipiper\.com$/, 'Chili Piper'], [/(^|\.)typeform\.com$/, 'Typeform'], [/(^|\.)tally\.so$/, 'Tally'],
  [/^(checkout|buy|pay)\.stripe\.com$/, 'Stripe Checkout'], [/(^|\.)paypal\.com$/, 'PayPal'], [/(^|\.)lemonsqueezy\.com$/, 'Lemon Squeezy'],
  [/(^|\.)paddle\.com$/, 'Paddle'], [/(^|\.)gumroad\.com$/, 'Gumroad'], [/(^|\.)opentable\.(com|co\.uk)$/, 'OpenTable'], [/(^|\.)resdiary\.com$/, 'ResDiary'],
];

// forms and schedulers that a script drops into an otherwise empty container; ids may sit in a
// Next.js flight payload with escaped quotes, hence the optional backslashes
const EMBEDS = [
  ['Typeform form', /typeformId\\?"\s*:\s*\\?"([A-Za-z0-9]{6,})|data-tf-(?:widget|popup|slider|live)=["']?([A-Za-z0-9]{6,})|typeform\.com\/to\/([A-Za-z0-9]{6,})|embed\.typeform\.com/],
  ['HubSpot form', /hbspt\.forms\.create|js(?:-[a-z0-9]+)?\.hsforms\.net|hs-form-frame/],
  ['HubSpot Meetings scheduler', /meetings-iframe-container|meetings(?:-[a-z0-9]+)?\.hubspot\.com\/[a-z0-9]/],
  ['Calendly scheduler', /calendly-inline-widget|assets\.calendly\.com|Calendly\.init/],
  ['Cal.com scheduler', /cal\.com\/embed|Cal\(\s*["']init/],
  ['Chili Piper scheduler', /js\.chilipiper\.com|ChiliPiper\.(?:submit|scheduling|deploy)/],
  ['Tally form', /tally\.so\/(?:embed|r)\/|data-tally-src/],
  ['Jotform form', /form\.jotform\.com|jotform\.com\/jsform/],
  ['Marketo form', /MktoForms2|forms2(?:\.min)?\.js/],
  ['Google Form', /docs\.google\.com\/forms\//],
];

/** A form or scheduler that only appears once a script runs. */
export function scriptedEmbed(html) {
  for (const [name, re] of EMBEDS) {
    const m = re.exec(html);
    if (m) return { name, id: m.slice(1).find((x) => x && x.length >= 6) || null };
  }
  return null;
}

/** What the user wants done, from the CTA's text. */
export function ctaGoal(name) {
  const n = name || '';
  if (/\b(demo|call|meeting|consultation|talk to|speak to|contact|quote)\b/i.test(n)) return 'demo';
  if (/\b(trial|free|sign ?up|get started|create .*account|join|subscribe|register)\b/i.test(n)) return 'signup';
  if (/\b(book|reserve|tickets?|table|room|stay)\b/i.test(n)) return 'booking';
  return 'buy';
}

const GOAL_LABEL = { demo: 'book a demo or call', signup: 'start a trial or sign up', booking: 'make a booking', buy: 'buy' };
export const goalLabel = (g) => GOAL_LABEL[g] || g;

function providerOf(url) {
  try {
    const host = new URL(url).hostname;
    const p = PROVIDERS.find(([re]) => re.test(host));
    return p ? p[1] : null;
  } catch { return null; }
}

/** The page's main calls to action, grouped by where they point, most repeated first. */
export function primaryCtas(page) {
  const groups = new Map();
  for (const c of page.controls || []) {
    const name = c.name && c.name.name && c.name.name.trim();
    if (!name || !CTA_TEXT.test(name) || c.kind !== 'link') continue;
    const key = c.href || `(${c.hasHref ? 'dynamic' : 'none'}) ${name.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { name, href: c.href, hasHref: c.hasHref, line: c.line, count: 0, order: groups.size });
    groups.get(key).count++;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.order - b.order).slice(0, MAX_JOURNEYS);
}

/** Forms, sign-in options and payment fields on a fetched page. */
export function readStep(html, page) {
  const doc = parseMarkup(html, { mode: 'html' });
  const fields = [];
  let card = /js\.stripe\.com|checkout\.stripe\.com|braintreegateway|adyen\.com\/checkoutshopper/i.test(html) && /card (number|details)|payment (details|method)|pay now/i.test(page.text || '');
  for (const el of doc.elements) {
    if (!/^(input|select|textarea)$/.test(el.tag)) continue;
    const type = (attr(el, 'type') || (el.tag === 'input' ? 'text' : el.tag)).toLowerCase();
    if (/^(hidden|submit|button|image|reset)$/.test(type)) continue;
    const name = `${attr(el, 'name') || ''} ${attr(el, 'id') || ''} ${attr(el, 'autocomplete') || ''} ${attr(el, 'placeholder') || ''}`.toLowerCase();
    if (/cc-|card|cvc|cvv|expir/.test(name)) card = true;
    fields.push({ type, name: (attr(el, 'name') || attr(el, 'id') || attr(el, 'placeholder') || type).toLowerCase(), inForm: ancestors(el).some((a) => a.tag === 'form') });
  }
  const oauth = [...new Set((page.controls || []).filter((c) => (c.name && OAUTH.test(c.name.name || '')) || (c.href && OAUTH_HREF.test(c.href))).map((c) => {
    const m = `${c.name && c.name.name} ${c.href || ''}`.match(/google|apple|microsoft|github|facebook|linkedin|slack/i);
    return m ? m[0][0].toUpperCase() + m[0].slice(1).toLowerCase() : 'single sign-on';
  }))];
  const prices = [...new Set(((page.text || '').match(PRICE) || []))];
  const placeholders = [...new Set(((page.text || '').match(TEMPLATE_TOKENS) || []))];
  return { fields, card, oauth, prices, placeholders, embed: scriptedEmbed(html), words: words(page.text || '').length, scripts: (html.match(/<script\b/gi) || []).length };
}

function describe(info) {
  const bits = [];
  if (info.prices.length) bits.push(`${info.prices.length} price${info.prices.length === 1 ? '' : 's'} shown (${info.prices.slice(0, 3).join(', ')}${info.prices.length > 3 ? ', ...' : ''})`);
  if (info.placeholders.length) bits.push(`${info.placeholders.length} unrendered placeholder${info.placeholders.length === 1 ? '' : 's'}`);
  return bits;
}

/** Classify where a step leaves the agent: stop with an outcome, or continue to the next link. */
function assess(info, url) {
  const provider = providerOf(url);
  const fillable = info.fields.filter((f) => f.type !== 'checkbox' && f.type !== 'radio');
  if (info.words < 30 && info.scripts && !fillable.length) {
    return { outcome: 'needs-browser', note: `${provider ? `${provider} page` : 'Page'} is empty without JavaScript (${info.words} words of text)`, stop: `An agent that only fetches pages stops here. Agents with a real browser (ChatGPT agent, Claude in Chrome) may get further.` };
  }
  if (info.embed && fillable.length < 2) {
    return { outcome: 'needs-browser', note: `${info.embed.name}${info.embed.id ? ` (${info.embed.id})` : ''} loaded by JavaScript; the page HTML has no form`, stop: 'An agent that only fetches pages stops here. Agents with a real browser (ChatGPT agent, Claude in Chrome) may get further.' };
  }
  if (info.card) return { outcome: 'handoff', note: 'payment form (card details)', stop: 'The user has to enter or confirm their card.' };
  if (fillable.some((f) => f.type === 'password')) return { outcome: 'handoff', note: `sign-in or sign-up form with a password${info.oauth.length ? `, or ${info.oauth.join('/')}` : ''}`, stop: 'The agent can fill it in only with the user\'s own details.' };
  const emails = fillable.filter((f) => f.type === 'email' || /e-?mail/.test(f.name));
  if ((emails.length && fillable.length <= 2 && !fillable.some((f) => f.type === 'textarea')) || (!fillable.length && info.oauth.length)) {
    const how = [emails.length ? 'emailed link' : null, info.oauth.length ? info.oauth.join('/') : null].filter(Boolean).join(' or ');
    return { outcome: 'handoff', note: `sign-in by ${how}`, stop: `The user has to finish: ${emails.length ? 'the link goes to their inbox' : ''}${emails.length && info.oauth.length ? ', or ' : ''}${info.oauth.length ? `it needs their ${info.oauth.join('/')} account` : ''}.` };
  }
  if (fillable.length >= 2) {
    const names = fillable.slice(0, 5).map((f) => f.name.replace(/[_-]+/g, ' ').trim());
    return { outcome: 'reached', note: `form with ${fillable.length} fields (${names.join(', ')}${fillable.length > 5 ? ', ...' : ''})`, stop: 'An agent can fill this in for the user.' };
  }
  return null;
}

function nextLink(page, goal, visited) {
  const cands = [];
  for (const c of page.controls || []) {
    const name = c.name && c.name.name && c.name.name.trim();
    if (!name || c.kind !== 'link' || !c.href || !/^(https?:|\/|\?)/.test(c.href)) continue;
    let abs;
    try { abs = new URL(c.href, page.file); } catch { continue; }
    abs.hash = '';
    if (visited.has(abs.href)) continue;
    const isCta = CTA_TEXT.test(name);
    if (!isCta && !OAUTH.test(name)) continue;
    cands.push({ name, href: abs.href, same: isCta && ctaGoal(name) === goal });
  }
  const pick = cands.find((c) => c.same) || cands.find((c) => !OAUTH.test(c.name));
  if (!pick) return null;
  const shared = cands.filter((c) => c.href === pick.href).length;
  return { ...pick, shared };
}

/**
 * Follow each primary CTA on the start page.
 * fetchPage(url) -> { status, url, html, page, challenge, error }
 */
export async function runJourneys(start, fetchPage, { log = () => {} } = {}) {
  const out = [];
  for (const cta of primaryCtas(start)) {
    const goal = ctaGoal(cta.name);
    const j = { name: cta.name, goal, count: cta.count, line: cta.line, href: cta.href, steps: [], outcome: null, stop: null };
    out.push(j);
    if (!cta.href) { j.outcome = 'broken'; j.stop = cta.hasHref ? 'The link\'s href is set by JavaScript.' : 'The link has no href.'; continue; }
    if (TEMPLATE_TOKEN.test(cta.href)) { j.outcome = 'broken'; j.stop = `The href is the unrendered template "${cta.href}", so there is nowhere to go.`; continue; }
    if (/^mailto:/i.test(cta.href)) { j.outcome = 'reached'; j.stop = `Opens an email to ${cta.href.slice(7).split('?')[0]}; an agent can draft it for the user.`; continue; }
    if (/^tel:/i.test(cta.href)) { j.outcome = 'handoff'; j.stop = `A phone number (${cta.href.slice(4)}); the user has to call.`; continue; }
    if (cta.href === '#' || /^javascript:/i.test(cta.href)) { j.outcome = 'broken'; j.stop = 'The link goes nowhere without JavaScript.'; continue; }
    let url;
    try { url = new URL(cta.href, start.file).href; } catch { j.outcome = 'broken'; j.stop = `"${cta.href}" is not a valid URL.`; continue; }
    const visited = new Set([start.file]);
    for (let i = 0; i < MAX_STEPS; i++) {
      visited.add(url);
      log(`journey ${cta.name}: ${url}`);
      const r = await fetchPage(url);
      const step = { url, finalUrl: r.url && r.url !== url ? r.url : undefined, status: r.status, notes: [] };
      j.steps.push(step);
      if (r.url) visited.add(r.url);
      if (r.status === 0) { j.outcome = 'broken'; j.stop = `Could not load ${url}${r.error ? ` (${r.error})` : ''}.`; break; }
      if (r.challenge) { j.outcome = 'broken'; j.stop = `${new URL(url).host} shows agents a bot challenge (HTTP ${r.status}).`; break; }
      if (r.status >= 400) { j.outcome = 'broken'; j.stop = `${url} returns HTTP ${r.status} to an agent.`; break; }
      if (!r.page) { j.outcome = 'dead-end'; j.stop = `${url} is not a web page.`; break; }
      const info = readStep(r.html, r.page);
      step.notes.push(...describe(info));
      const a = assess(info, r.url || url);
      if (a) { step.notes.unshift(a.note); j.outcome = a.outcome; j.stop = a.stop; break; }
      const next = nextLink(r.page, goal, visited);
      if (!next) { j.outcome = 'dead-end'; j.stop = 'No form and no next link (sign up, book, checkout) on this page.'; break; }
      step.notes.push(`next: "${next.name}"`);
      if (next.shared > 1) step.shared = { name: next.name, count: next.shared };
      url = next.href;
      if (i === MAX_STEPS - 1) { j.outcome = 'dead-end'; j.stop = `Still no form or sign-in after ${MAX_STEPS} pages.`; }
    }
  }
  return out;
}
