import { TEMPLATE_TOKEN, TEMPLATE_TOKENS, ctas, excerpt, cap } from './_util.js';

const KEY = /price|plan|cost|amount|total|fee|url|href|link|email|phone/i;

// Only live pages: in source files {{ }} is legitimate template syntax (Angular, Jinja, Liquid, Handlebars).
export default {
  id: 'template-placeholders',
  severity: 'error',
  scope: 'page',
  category: 'agents',
  title: 'No unrendered template placeholders in links or text (URL mode)',
  rationale: 'A page that fills its links and prices in with client-side JavaScript serves the raw template to every crawler and agent that does not run it. A "Book a demo" link whose href is {{ demoUrl }} goes nowhere, and a price shown as {{ planPrice }} is a price the assistant has to guess.',
  sources: ['vercel-ai-crawlers', 'google-js-seo', 'larne-agents'],
  fix: 'Render the real values on the server (or at build time): put the URL in the href and the price in the text, and let the script only enhance them.',
  check(page) {
    if (page.kind !== 'url') return [];
    const out = [];
    // calls to action with a templated href are reported by primary-cta
    const seen = new Set(ctas(page).map((c) => c.href).filter(Boolean));
    for (const l of page.links) {
      if (typeof l.href !== 'string' || !TEMPLATE_TOKEN.test(l.href) || seen.has(l.href)) continue;
      seen.add(l.href);
      const n = page.links.filter((x) => x.href === l.href).length;
      out.push({ line: l.line, message: `Link "${excerpt(l.text, 40) || '(no text)'}" has the unrendered href "${excerpt(l.href, 60)}"${n > 1 ? ` (${n} links)` : ''}; an agent that does not run JavaScript cannot follow it.` });
    }
    for (const img of page.images) {
      if (img.src && TEMPLATE_TOKEN.test(img.src)) out.push({ line: img.line, severity: 'warn', message: `Image src is the unrendered "${excerpt(img.src, 60)}".` });
    }
    const tokens = [...new Set((page.text || '').match(TEMPLATE_TOKENS) || [])].sort((a, b) => KEY.test(b) - KEY.test(a));
    if (tokens.length) {
      const first = page.blocks.find((b) => (b.text || '').includes(tokens[0])) || page.blocks.find((b) => TEMPLATE_TOKEN.test(b.text || ''));
      out.push({ line: first ? first.line : 1, severity: 'warn', message: `${tokens.length} unrendered placeholder${tokens.length === 1 ? '' : 's'} in the page text: ${tokens.slice(0, 6).join(', ')}${tokens.length > 6 ? ', ...' : ''}${first ? ` (first in "${excerpt(first.text, 60)}")` : ''}.` });
    }
    return cap(out, 6);
  },
};
