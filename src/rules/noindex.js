export default {
  id: 'noindex',
  severity: 'error',
  scope: 'site',
  category: 'crawl',
  title: 'Important pages are indexable',
  rationale: 'AI Overviews and AI Mode only cite pages that are indexed and eligible for a snippet, and Bing, whose index Copilot answers from, drops noindex pages too. A noindex in a meta tag, metadata export or X-Robots-Tag header takes the page out of all of them.',
  sources: ['x-suraj', 'google-ai-features', 'google-robots-meta', 'google-js-seo'],
  fix: 'Remove noindex from pages you want cited. Keep it only on login, account, admin, preview and thank-you pages.',
  check(site) {
    const out = [];
    for (const h of site.headers || []) {
      if (h.onlySnippet) continue;
      out.push({ file: h.path, line: h.line, message: `${h.path} sends an X-Robots-Tag noindex header, which keeps every matching route out of search indexes.` });
    }
    for (const p of site.pages) {
      const r = p.head.robots;
      if (!r || !r.noindex || p.isUtility) continue;
      const where = r.from ? ` (inherited from ${r.from})` : '';
      out.push({ file: r.from || p.file, line: r.line || 1, message: `${p.route} has a robots noindex directive${where} (${r.content || 'robots meta'}).` });
    }
    // de-duplicate inherited findings
    const seen = new Set();
    return out.filter((f) => { const k = f.file + ':' + f.line; if (seen.has(k) && /inherited/.test(f.message)) return false; seen.add(k); return true; });
  },
};
