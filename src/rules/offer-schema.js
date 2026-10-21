import { isIndexable, BOOKING_ROUTE } from './_util.js';
import { isCommercePage } from './commerce-facts.js';
import { jsonLdTypes } from '../site.js';

function offersOf(data) {
  const out = [];
  const visit = (d) => {
    if (!d || typeof d !== 'object') return;
    if (Array.isArray(d)) return d.forEach(visit);
    const t = [].concat(d['@type'] || []);
    if (t.includes('Offer') || t.includes('AggregateOffer')) out.push(d);
    Object.values(d).forEach(visit);
  };
  visit(data);
  return out;
}

export default {
  id: 'offer-schema',
  severity: 'warn',
  scope: 'page',
  category: 'agents',
  title: 'Commerce pages declare Offer data an agent can read',
  rationale: 'Shopping and booking agents read structured offers: price, currency and availability. Product or LodgingBusiness markup with a complete Offer gives them facts to act on instead of guesses, which is where most assistants failed in Larne\'s hotel booking test (Getting CEOs to trust CMOs, Oct 2026).',
  sources: ['larne-agents', 'google-merchant', 'schema-offer'],
  fix: 'Add Product (or Hotel/LodgingBusiness, Event, SoftwareApplication) JSON-LD with an "offers" Offer that has price, priceCurrency and availability (e.g. https://schema.org/InStock), matching the visible price.',
  check(page) {
    if (!isIndexable(page) || !isCommercePage(page) || page.isHome) return [];
    const out = [];
    const types = jsonLdTypes(page);
    const offers = (page.jsonLd || []).flatMap((j) => (j.data ? offersOf(j.data) : []));
    const dynamicOffers = (page.jsonLd || []).some((j) => j.dynamic && (j.keys || []).includes('offers'));
    if (!offers.length && !dynamicOffers) {
      const lodging = BOOKING_ROUTE.test(page.route);
      out.push({ line: 1, message: `No Offer in the structured data${types.length ? ` (found ${[...new Set(types)].join(', ')})` : ''}. Add ${lodging ? 'Hotel/LodgingBusiness or Product' : 'Product'} JSON-LD with offers.` });
      return out;
    }
    for (const o of offers) {
      const missing = ['price', 'priceCurrency', 'availability'].filter((k) => o[k] === undefined && !(k === 'price' && (o.lowPrice !== undefined || o.priceSpecification)));
      if (missing.length) out.push({ line: (page.jsonLd.find((j) => j.data && JSON.stringify(j.data).includes(JSON.stringify(o).slice(0, 30))) || {}).line || 1, severity: missing.includes('price') || missing.includes('priceCurrency') ? 'warn' : 'info', message: `Offer is missing ${missing.join(', ')}.` });
    }
    return out;
  },
};
