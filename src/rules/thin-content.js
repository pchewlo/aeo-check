import { isIndexable, hasFullText, plural } from './_util.js';

export default {
  id: 'thin-content',
  severity: 'warn',
  scope: 'page',
  category: 'content',
  title: 'Pages have enough substance to cite',
  rationale: 'Thin pages rarely get indexed or cited, and they dilute the site. One team deleted 200 thin AI-written posts and tripled Google traffic; Google\'s helpful-content guidance makes the same point.',
  sources: ['x-lotti', 'x-daniel', 'google-helpful'],
  fix: 'Expand the page with specific answers, data and examples, merge it into a stronger page, or delete it and redirect.',
  check(page) {
    if (!isIndexable(page) || !hasFullText(page) || page.metaRefresh) return [];
    const min = page.isArticle ? 300 : 150;
    if (page.wordCount >= min) return [];
    // content injected on the client is reported by client-only-content instead
    if (page.kind === 'html' && page.emptyRoots.length) return [];
    const s = page.signals || {};
    if ((s.effectFetch && s.effectFetch.length) || (s.clientDataHooks && s.clientDataHooks.length)) return [];
    return [{ line: 1, message: `${plural(page.wordCount, 'word')} of main content (${page.isArticle ? 'articles' : 'pages'} under ${min} words are rarely cited).` }];
  },
};
