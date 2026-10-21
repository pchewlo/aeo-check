import { headSeverity, isIndexable } from './_util.js';
import { normalisePath } from '../site.js';

export default {
  id: 'canonical',
  severity: 'warn',
  scope: 'page',
  category: 'metadata',
  title: 'Each page declares a correct canonical URL',
  rationale: 'The canonical URL tells crawlers which address to index and cite when the same content is reachable at several URLs. A missing canonical splits signals; a wrong one (a #fragment, or a layout-wide value) points every page at the same URL.',
  sources: ['x-suraj', 'google-canonical'],
  fix: 'Add <link rel="canonical" href="https://your-domain/this-page"> (Next.js: alternates.canonical per page, with metadataBase in the root layout). Never put a #fragment in it.',
  check(page, ctx) {
    if (!isIndexable(page) && !page.isRedirect) return [];
    const c = page.head.canonical;
    if (!c) return page.isRedirect ? [] : [{ line: 1, severity: headSeverity(page, 'warn'), message: 'No canonical URL.' }];
    if (c.dynamic) return [];
    const href = c.href || '';
    if (!href) return [{ line: c.line, message: 'Canonical link has an empty href.' }];
    if (href.includes('#')) return [{ line: c.line, severity: 'error', message: `Canonical URL contains a fragment (${href}). Crawlers drop the fragment, so this points at ${href.split('#')[0] || '/'}.` }];
    if (c.inherited && page.route !== '/' && !/^\.\/?$/.test(href)) {
      return [{ line: 1, severity: 'error', message: `Canonical "${href}" is inherited from ${c.from}, so this page declares another page as its canonical.` }];
    }
    if (!/^https?:\/\//.test(href) && !page.head.metadataBase) return [{ line: c.line, severity: 'info', message: `Canonical URL is relative (${href}); use an absolute URL.` }];
    if (page.kind !== 'url' && !page.isDynamicRoute && ctx.site.baseUrl !== undefined) {
      const target = normalisePath(href, '/', ctx.site.baseUrl);
      if (target && target !== page.route && !page.route.includes('[') && !(page.route === '/' && target === '')) {
        return [{ line: c.line, severity: 'info', message: `Canonical points to ${target}, a different path from this page (${page.route}). Check it is intentional.` }];
      }
    }
    return [];
  },
};
