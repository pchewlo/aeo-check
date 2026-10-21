export default {
  id: 'sitemap-present',
  severity: 'warn',
  scope: 'site',
  category: 'crawl',
  title: 'Sitemap exists',
  rationale: 'A sitemap lists every page you want found. Crawlers for Google, Bing and the AI search engines use it to discover and re-crawl pages, which is how new or refreshed pages reach answers quickly.',
  sources: ['x-suraj', 'google-sitemaps', 'vercel-ai-crawlers'],
  fix: 'Generate sitemap.xml at build time (Next.js app/sitemap.ts, @astrojs/sitemap, @nuxtjs/sitemap, or a static public/sitemap.xml) and reference it from robots.txt.',
  check(site) {
    if (site.sitemap) return [];
    if (site.robots && site.robots.parsed.sitemaps.length && site.mode === 'repo') return [];
    return [{ file: site.mode === 'url' ? site.origin + '/sitemap.xml' : 'sitemap.xml', line: 0, message: 'No sitemap found (looked for sitemap.xml, generated sitemap routes and sitemap plugins).' }];
  },
};
