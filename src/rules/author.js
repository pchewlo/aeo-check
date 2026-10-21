import { isIndexable } from './_util.js';
import { ldHas } from './dates.js';

export default {
  id: 'author',
  severity: 'warn',
  scope: 'page',
  category: 'trust',
  title: 'Articles name a real author',
  rationale: 'Google\'s helpful-content guidance asks "who created this?", and the vibe-coder SEO checklist calls for a real author bio. A named author with a profile link is an experience and trust signal answer engines can check.',
  sources: ['x-suraj', 'google-helpful', 'google-article'],
  fix: 'Show a byline ("By Jane Smith, Head of Data") linking to an author page, and add author { "@type": "Person", name, url } to the Article JSON-LD.',
  check(page) {
    if (!page.isArticle || !isIndexable(page)) return [];
    const byline = page.bylineHints.length > 0 || /\b(by|written by|author:?)\s+[A-Z][a-z]+(\s+[A-Z][a-z'-]+)+/.test(page.blocks.slice(0, 6).map((b) => b.text).join(' '));
    if (page.head.author || ldHas(page, 'author') || byline) return [];
    return [{ line: 1, message: 'No author found (byline, meta author, frontmatter author or JSON-LD author).' }];
  },
};
