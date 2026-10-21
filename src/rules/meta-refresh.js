export default {
  id: 'meta-refresh',
  severity: 'warn',
  scope: 'page',
  category: 'crawl',
  title: 'No meta refresh redirects',
  rationale: 'A <meta http-equiv="refresh"> redirect is a client-side hop. Crawlers that do not follow it index the stub, and those that do lose a step of the chain. Server redirects (301/308) pass the page on cleanly.',
  sources: ['x-suraj', 'google-redirects', 'vercel-ai-crawlers'],
  fix: 'Replace it with a 301/308 redirect in your host config (vercel.json redirects, _redirects, next.config redirects) or serve the real content at this URL.',
  check(page) {
    if (!page.metaRefresh) return [];
    const target = (/url\s*=\s*['"]?([^'";]+)/i.exec(page.metaRefresh.content) || [])[1];
    return [{ line: page.metaRefresh.line, message: `Meta refresh redirect${target ? ` to ${target.trim()}` : ''}.` }];
  },
};
