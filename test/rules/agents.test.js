import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findings, html, para } from '../helpers.js';

const hotel = (body, opts = {}) => ({ 'rooms/deluxe.html': html({ canonical: 'https://hotel.test/rooms/deluxe', title: 'Deluxe double room at the Harbour Hotel', body, ...opts }) });
const goodOffer = { '@context': 'https://schema.org', '@type': 'HotelRoom', name: 'Deluxe double', offers: { '@type': 'Offer', price: '180', priceCurrency: 'GBP', availability: 'https://schema.org/InStock' } };

test('accessible-names: blank links and icon-only buttons', () => {
  const body = '<h1>Rooms</h1><a href="/book" class="btn-book"></a><button><svg viewBox="0 0 1 1"></svg></button><a href="/x"><img src="/i.png" alt="Gallery"></a><button aria-label="Close"></button><a href="/y">Prices</a>';
  const f = findings('accessible-names', hotel(body));
  assert.equal(f.length, 2);
  assert.match(f[0].message, /btn-book/);
  const jsx = 'export const B = () => <nav><Link href="/book" className="cta" /><button>{label}</button></nav>';
  assert.equal(findings('accessible-names', { 'components/B.tsx': jsx }).length, 1);
});

test('primary-cta: blank, div and href-less booking controls', () => {
  const body = '<h1>Deluxe double</h1><a class="book-now"></a><div onclick="openBooking()">Book now</div><a href="#" onclick="go()">Buy now</a><a href="/book/deluxe">Book now</a><button type="submit">Add to basket</button>';
  const f = findings('primary-cta', hotel(body));
  assert.equal(f.length, 3);
  const msgs = f.map((x) => x.message).join('\n');
  assert.match(msgs, /\(book-now\).*without a real href|without a real href/);
  assert.match(msgs, /<div> with a click handler/);
  assert.deepEqual(findings('primary-cta', hotel('<h1>Room</h1><a href="/book/deluxe">Book now</a>')), []);
});

test('commerce-facts: booking page without a price or terms', () => {
  const f = findings('commerce-facts', hotel(`<h1>Deluxe double</h1><p>${para(160, 'A quiet room overlooking the harbour')}</p><a href="/book">Book now</a>`));
  assert.equal(f.length, 2);
  assert.match(f[0].message, /no price/);
  assert.equal(f[1].severity, 'info');
  const ok = hotel(`<h1>Deluxe double</h1><p>From £180 per night. Free cancellation until 48 hours before arrival.</p><p>${para(160)}</p><a href="/book">Book now</a>`);
  assert.deepEqual(findings('commerce-facts', ok), []);
  assert.deepEqual(findings('commerce-facts', { 'about.html': html({ body: `<h1>About</h1><p>${para(200)}</p>` }) }), []);
});

test('offer-schema: missing and incomplete offers', () => {
  const none = findings('offer-schema', hotel('<h1>Deluxe</h1><p>£180 per night</p>', { jsonLd: false }));
  assert.match(none[0].message, /No Offer/);
  const partial = findings('offer-schema', hotel('<h1>Deluxe</h1>', { jsonLd: { ...goodOffer, offers: { '@type': 'Offer', price: '180' } } }));
  assert.match(partial[0].message, /priceCurrency, availability/);
  assert.deepEqual(findings('offer-schema', hotel('<h1>Deluxe</h1>', { jsonLd: goodOffer })), []);
});

test('agent-paths: user agents blocked from booking and checkout', () => {
  const robots = 'User-agent: *\nDisallow: /checkout\nDisallow: /book\n';
  const f = findings('agent-paths', { ...hotel('<h1>R</h1>'), 'robots.txt': robots });
  assert.equal(f.length, 3);
  assert.match(f[0].message, /ChatGPT-User \(acting for a user\) is blocked from \/book/);
  const fixed = robots + '\nUser-agent: ChatGPT-User\nUser-agent: Claude-User\nUser-agent: Perplexity-User\nAllow: /\n';
  assert.deepEqual(findings('agent-paths', { ...hotel('<h1>R</h1>'), 'robots.txt': fixed }), []);
});

test('load-interstitials: visible modals before the heading', () => {
  const f = findings('load-interstitials', hotel('<div class="modal newsletter" role="dialog"><p>Join our list</p></div><h1>Deluxe</h1>'));
  assert.equal(f.length, 1);
  assert.deepEqual(findings('load-interstitials', hotel('<div class="modal" hidden><p>x</p></div><h1>Deluxe</h1>')), []);
  assert.deepEqual(findings('load-interstitials', hotel('<h1>Deluxe</h1><div role="dialog"><p>later</p></div>')), []);
  const script = findings('load-interstitials', hotel('<h1>Deluxe</h1>', { head: '<script src="https://a.omappapi.com/app/js/api.min.js"></script>' }));
  assert.equal(script[0].severity, 'info');
});

test('commerce-facts and offer-schema: a "Book Notes" nav link is not a Book button', () => {
  const nav = '<nav><a href="/">Home</a><a href="/book-notes">Book Notes</a></nav>';
  const files = {
    'index.html': html({ body: `${nav}<h1>Tom's notes</h1><p>${para(200)}</p>` }),
    'book-notes/gates-of-fire.html': html({ canonical: 'https://acme.test/book-notes/gates-of-fire', body: `${nav}<h1>Gates of Fire</h1><p>${para(200)}</p>` }),
  };
  assert.deepEqual(findings('commerce-facts', files), []);
  assert.deepEqual(findings('offer-schema', files), []);
  const buy = findings('commerce-facts', { 'index.html': html({ body: `<h1>Acme</h1><p>${para(200)}</p><a href="/checkout">Buy now</a>` }) });
  assert.equal(buy.length, 1);
});

test('template-placeholders and primary-cta: {{ }} in source files is template syntax, not a finding', () => {
  const body = '<h1>Rooms</h1><p>From {{ price }} a night.</p><a href="{{ bookUrl }}">Book now</a>';
  assert.deepEqual(findings('template-placeholders', { 'index.html': html({ body }) }), []);
  assert.deepEqual(findings('primary-cta', { 'index.html': html({ body }) }), []);
});
