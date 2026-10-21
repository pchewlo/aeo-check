import { isIndexable, hasFullText } from './_util.js';
import { isInternalHref } from '../site.js';

export default {
  id: 'internal-links',
  severity: 'warn',
  scope: 'page',
  category: 'links',
  title: 'Content links to related pages',
  rationale: 'Interlinking the core pages (alternatives, comparisons, guides) is how small sites beat incumbents, and internal links are how crawlers find and weigh pages. A content page with no links out is a dead end.',
  sources: ['x-rob-pages', 'x-cody-claude', 'x-suraj'],
  fix: 'Link each content page to two or three related pages in the body text, using descriptive anchor text.',
  check(page, ctx) {
    if (!isIndexable(page) || !hasFullText(page) || page.wordCount < 150) return [];
    const internal = page.links.filter((l) => !l.inChrome && typeof l.href === 'string' && isInternalHref(l.href, ctx.site.baseUrl));
    if (internal.length) return [];
    return [{ line: 1, message: `No internal links in the main content (${page.wordCount} words).` }];
  },
};
