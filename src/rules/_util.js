// Helpers shared by rules.
import { words } from '../analyse.js';

export { words };

export const downgrade = (sev) => (sev === 'error' ? 'warn' : 'info');

/** Missing <head> data is certain for HTML; for framework files a layout or component may supply it. */
export function headSeverity(page, sev) {
  return page.headConfidence === 'partial' ? downgrade(sev) : sev;
}

/** Pages that are meant to be found: not utility pages and not redirect stubs. A noindex page still
 *  counts (the noindex rule reports it), so fixing it does not reveal a second wave of findings. */
export function isIndexable(page) {
  return !page.isUtility && !page.isRedirect;
}

/** Pages whose full text is visible to static analysis (so content rules are fair). */
export function hasFullText(page) {
  if (['html', 'url', 'md'].includes(page.kind)) return true;
  return !page.dataDriven && !rendersComponents(page);
}

export function rendersComponents(page) {
  return /<[A-Z][A-Za-z0-9]*[\s/>]/.test(stripImports(page.source || ''));
}

function stripImports(src) {
  return src.replace(/^import[^\n]*$/gm, '');
}

/** Split blocks into sections at headings. */
export function sections(page) {
  const out = [];
  let cur = { heading: null, blocks: [] };
  for (const b of page.blocks) {
    if (b.chrome) continue;
    if (b.kind === 'heading') {
      out.push(cur);
      cur = { heading: b, blocks: [] };
    } else cur.blocks.push(b);
  }
  out.push(cur);
  return out.filter((s) => s.heading || s.blocks.length);
}

export const paragraphs = (page) => page.blocks.filter((b) => !b.chrome && (b.kind === 'p' || b.kind === 'quote') && b.text);

export const QUESTION = /\?\s*$|^(how|what|why|when|which|who|whom|whose|where|can|could|does|do|did|is|are|was|were|should|will|would|may|might|has|have)\b/i;

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function excerpt(s, n = 80) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export function cap(findings, max, note) {
  if (findings.length <= max) return findings;
  const kept = findings.slice(0, max);
  kept[max - 1] = { ...kept[max - 1], message: `${kept[max - 1].message} (+${findings.length - max} more like this ${note || 'in this file'})` };
  return kept;
}

/** Template tokens a build step or client script was meant to replace: {{ name }}, ${name}, <%= name %>. */
export const TEMPLATE_TOKEN = /\{\{\s*[^{}\n]{1,60}?\s*\}\}|\$\{[^{}\n]{1,60}\}|<%=?\s*[^%\n]{1,60}%>|%7B%7B/i;
export const TEMPLATE_TOKENS = new RegExp(TEMPLATE_TOKEN.source, 'gi');

export const CTA_TEXT = /^(book( now| direct| a room| online| your (stay|room|table))?|reserve( now)?|buy( now| online)?|add to (basket|cart|bag|trolley)|checkout|check ?out|order( now| online)?|purchase|pay( now)?|get tickets|buy tickets|subscribe( now)?|start( (my|your|a))?( \d+[- ]days?)? (free( trial)?|trial)|start for free|try (it )?(for )?free|free trial|get started|sign up|create (an |your )?account|(get|request|schedule|book) a (free )?(demo|call|consultation)|talk to (sales|us|an expert)|contact sales|request a quote)\b(?!\s+(notes?|clubs?|reviews?|lists?|shelf|summar(y|ies)|of|history|recommendations?)\b)/i;
export const CTA_HINT = /(^|[\s_-])(cta|book(ing)?[-_]?(now|btn|button)?|buy[-_]?(now|btn|button)|add[-_]?to[-_]?(cart|basket|bag)|checkout|reserve)([\s_-]|$)/i;
export const COMMERCE_ROUTE = /(^|\/)(pricing|plans|products?|shop|store|book|booking|bookings|reserve|reservations?|rooms?|suites?|tickets?|checkout|cart|basket|order|buy)(\/|$)/i;
export const BOOKING_ROUTE = /(^|\/)(book|booking|bookings|reserve|reservations?|rooms?|suites?|tickets?)(\/|$)/i;
export const COMMERCE_TYPES = /^(Product|ProductGroup|Offer|AggregateOffer|Hotel|LodgingBusiness|HotelRoom|Suite|Room|Restaurant|Event|SoftwareApplication|Service|Trip|Reservation)$/;

/** Primary calls to action on a page or component. */
export function ctas(unit) {
  return (unit.controls || []).filter((c) => (c.name && c.name.name && CTA_TEXT.test(c.name.name.trim())) || CTA_HINT.test(c.hint || ''));
}
