import { isInternalHref, normalisePath } from '../site.js';

export default {
  id: 'orphan-pages',
  severity: 'warn',
  scope: 'site',
  category: 'links',
  title: 'Every page is linked from another page',
  rationale: 'A page nothing links to is only found through the sitemap, if at all, and carries no internal signal of importance. "Link the orphan pages" is on the standard checklist.',
  sources: ['x-suraj', 'x-rob-pages', 'google-links'],
  fix: 'Link the page from a relevant hub, navigation, or related-content block, or delete it if it no longer matters.',
  check(site) {
    const candidates = site.pages.filter((p) => !p.isUtility && !p.isRedirect && !p.isHome && !p.isDynamicRoute && !(p.head.robots && p.head.robots.noindex));
    if (site.pages.length < 3 || site.mode === 'url') return [];
    const listingIsDynamic = site.pages.some((p) => p.dataDriven) || site.components.some((c) => c.signals && c.signals.serverData);
    const linked = new Set();
    for (const unit of [...site.pages, ...site.components, ...site.layouts]) {
      for (const l of unit.links) {
        if (typeof l.href !== 'string' || !isInternalHref(l.href, site.baseUrl)) continue;
        const p = normalisePath(l.href, unit.route || '/', site.baseUrl);
        if (p && p !== unit.route) linked.add(p);
      }
    }
    const out = [];
    for (const p of candidates) {
      if (p.kind === 'md' && listingIsDynamic) continue;
      if (!linked.has(p.route)) out.push({ file: p.file, line: 1, message: `No other page links to ${p.route}.` });
    }
    return out;
  },
};
