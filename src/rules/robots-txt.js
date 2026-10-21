export default {
  id: 'robots-txt',
  severity: 'info',
  scope: 'site',
  category: 'crawl',
  title: 'robots.txt exists and points to the sitemap',
  rationale: 'Without robots.txt every crawler is allowed, which is fine, but crawlers also use its Sitemap line to find every page quickly. Fast discovery matters for answer engines that favour recent pages.',
  sources: ['x-suraj', 'rfc9309', 'google-sitemaps'],
  fix: 'Add robots.txt at the site root (public/robots.txt, or app/robots.ts in Next.js) with "User-agent: *", "Allow: /" and "Sitemap: https://your-domain/sitemap.xml".',
  check(site) {
    if (!site.robots) {
      if (site.mode === 'url' && site.robotsStatus && site.robotsStatus !== 404) return [];
      return [{ file: site.mode === 'url' ? site.origin + '/robots.txt' : 'robots.txt', line: 0, message: 'No robots.txt found.' }];
    }
    if (!site.robots.parsed.sitemaps.length) return [{ file: site.robots.path, line: 1, message: 'robots.txt has no "Sitemap:" line.' }];
    // RFC 9309 and Google need a full URL; crawlers ignore "Sitemap: example.com/sitemap.xml"
    return site.robots.parsed.sitemaps.filter((s) => !/^https?:\/\//i.test(s.url)).map((s) => ({
      file: site.robots.path, line: s.line, severity: 'warn',
      message: `Sitemap line "${s.url}" is not an absolute URL, so crawlers ignore it. Write it as https://${s.url.replace(/^\/+/, '')}.`,
    }));
  },
};
