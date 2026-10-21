import { isIndexable } from './_util.js';

export default {
  id: 'open-graph',
  severity: 'info',
  scope: 'page',
  category: 'metadata',
  title: 'Open Graph tags present',
  rationale: 'Open Graph tags give link previews in chat apps and social feeds where AI answers are shared. ChatGPT\'s retrieval stream showed its og_data object empty while raw meta tags were kept, so OG supports sharing more than citation.',
  sources: ['x-jingg', 'ogp'],
  fix: 'Add og:title, og:description, og:image and og:url (Next.js: metadata.openGraph).',
  check(page) {
    if (!isIndexable(page) || page.headConfidence === 'partial' && !page.head.og) return [];
    const og = page.head.og || {};
    const missing = ['title', 'description', 'image', 'url'].filter((k) => !og[k]);
    if (!missing.length) return [];
    return [{ line: og.line || 1, message: `Missing Open Graph tags: ${missing.map((m) => 'og:' + m).join(', ')}.` }];
  },
};
