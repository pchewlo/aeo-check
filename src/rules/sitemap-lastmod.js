export default {
  id: 'sitemap-lastmod',
  severity: 'warn',
  scope: 'site',
  category: 'crawl',
  title: 'Sitemap entries carry a real lastmod',
  rationale: 'ChatGPT\'s retrieval records crawl and publication dates for each result, and refreshed pages win citations. An accurate <lastmod> tells crawlers which pages changed so they re-fetch them.',
  sources: ['x-jingg', 'x-cody-refresh', 'google-sitemaps'],
  fix: 'Emit <lastmod> for every URL using the date the content last changed (lastModified in Next.js app/sitemap.ts). Do not stamp every URL with the build time.',
  check(site) {
    const sm = site.sitemap;
    if (!sm) return [];
    if (sm.generated) {
      if (sm.hasLastmod === false) return [{ file: sm.path, line: 1, message: 'The sitemap generator does not set lastModified for its URLs.' }];
      return [];
    }
    const urls = sm.urls || [];
    if (!urls.length) return [];
    const missing = urls.filter((u) => !u.lastmod);
    if (missing.length) return [{ file: sm.path, line: missing[0].line, message: `${missing.length} of ${urls.length} sitemap URLs have no <lastmod>.` }];
    const distinct = new Set(urls.map((u) => u.lastmod));
    if (urls.length >= 5 && distinct.size === 1) return [{ file: sm.path, line: urls[0].line, severity: 'info', message: `All ${urls.length} URLs share the same lastmod (${urls[0].lastmod}), which looks like a build timestamp.` }];
    return [];
  },
};
