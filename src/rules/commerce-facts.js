import { isIndexable, hasFullText, ctas, COMMERCE_ROUTE, BOOKING_ROUTE, COMMERCE_TYPES } from './_util.js';
import { jsonLdTypes } from '../site.js';

const PRICE = /([£$€¥₹]\s?\d|\b\d[\d,.]*\s?(gbp|usd|eur|aud|cad|chf|jpy|inr|pounds?|dollars?|euros?)\b|\b(gbp|usd|eur)\s?\d|\bfree\b|\bper (night|month|year|seat|person|user)\b)/i;
const POLICY = /\b(cancel(lation|lations)?|refunds?|returns?|delivery|shipping|dispatch|exchange|money-back|guarantee|terms of (sale|booking)|check-?in|check-?out times?)\b/i;

export function isCommercePage(page) {
  if (COMMERCE_ROUTE.test(page.route)) return true;
  if (jsonLdTypes(page).some((t) => COMMERCE_TYPES.test(t) && t !== 'Service' && t !== 'SoftwareApplication')) return true;
  return ctas(page).some((c) => c.name && /book|buy|basket|cart|checkout|reserve|order|purchase|tickets/i.test(c.name.name || ''));
}

export default {
  id: 'commerce-facts',
  severity: 'warn',
  scope: 'page',
  category: 'agents',
  title: 'Prices and key policies are plain text in the HTML',
  rationale: 'Agents asked to buy or book need the price and the terms. In Larne\'s hotel test (Getting CEOs to trust CMOs, Oct 2026) three assistants could not see a price and guessed, while every agent got the cancellation policy right because it was plain text.',
  sources: ['larne-agents', 'x-jingg', 'vercel-ai-crawlers'],
  fix: 'Put the price (with currency), availability and the cancellation, delivery or returns policy in server-rendered text on the page, near the call to action. Do not rely on an image, a widget that loads later, or a third-party booking frame.',
  check(page) {
    if (!isIndexable(page) || !hasFullText(page) || !isCommercePage(page)) return [];
    // content injected on the client is reported by client-only-content
    if (page.kind === 'html' && page.emptyRoots.length) return [];
    const sig = page.signals || {};
    if ((sig.effectFetch && sig.effectFetch.length) || (sig.clientDataHooks && sig.clientDataHooks.length)) return [];
    const text = page.text || '';
    const out = [];
    const ldPrice = (page.jsonLd || []).some((j) => (j.data && /"price"|"lowPrice"|"priceRange"/.test(JSON.stringify(j.data))) || (j.keys && j.keys.includes('offers')));
    if (!PRICE.test(text)) out.push({ line: 1, message: `This looks like a ${BOOKING_ROUTE.test(page.route) ? 'booking' : 'product or pricing'} page but has no price in its text${ldPrice ? ' (the price is only in JSON-LD)' : ''}.` });
    if (!POLICY.test(text) && (BOOKING_ROUTE.test(page.route) || /(^|\/)(shop|store|products?|checkout|cart|basket)(\/|$)/i.test(page.route) || /book|reserv|room|suite|ticket|shop|store|products?|checkout|cart|basket/i.test(ctas(page).map((c) => c.name && c.name.name).join(' ')))) {
      out.push({ line: 1, severity: 'info', message: 'No cancellation, refund, delivery or returns terms in the page text.' });
    }
    return out;
  },
};
