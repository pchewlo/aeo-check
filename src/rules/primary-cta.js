import { ctas, CTA_HINT, cap } from './_util.js';

export default {
  id: 'primary-cta',
  severity: 'error',
  scope: 'markup',
  category: 'agents',
  title: 'Book, Buy and Checkout are real links or buttons with text',
  rationale: 'An agent completing a purchase has to find and use the main call to action. In Larne\'s hotel test (Getting CEOs to trust CMOs, Oct 2026) blank "Book Now" links stopped most assistants; a div with a click handler or an icon-only button is just as invisible.',
  sources: ['larne-agents', 'w3c-names', 'google-links'],
  fix: 'Make each Book/Buy/Add to basket/Checkout control an <a href="/real/url"> (for navigation) or a <button> inside a form (for actions), with visible text that says what it does.',
  check(unit) {
    const out = [];
    for (const c of ctas(unit)) {
      if (c.spread) continue;
      const label = c.name && c.name.name ? `"${c.name.name.slice(0, 40)}"` : `(${c.hint.slice(0, 40)})`;
      if (c.kind === 'clickable') out.push({ line: c.line, message: `Call to action ${label} is a <${c.tag}> with a click handler; agents look for links and buttons.` });
      else if (c.kind === 'link' && (!c.hasHref || c.href === '#' || /^javascript:/i.test(c.href || ''))) out.push({ line: c.line, message: `Call to action ${label} is a link without a real href${c.href ? ` (${c.href})` : ''}.` });
      else if (!c.name && CTA_HINT.test(c.hint)) out.push({ line: c.line, message: `Call to action (${c.hint.slice(0, 40)}) has no text or aria-label.` });
      else if (c.name && c.name.via === 'title') out.push({ line: c.line, severity: 'warn', message: `Call to action ${label} is labelled only by a title attribute; give it visible text.` });
    }
    return cap(out, 5);
  },
};
