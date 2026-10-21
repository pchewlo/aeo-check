export default {
  id: 'hash-routing',
  severity: 'error',
  scope: 'site',
  category: 'crawl',
  title: 'Routes use real URL paths',
  rationale: 'Crawlers ignore everything after "#", so hash-routed views (#/pricing, #about) all collapse into one URL. Only the empty shell gets fetched and none of the views can be cited or linked from an answer.',
  sources: ['google-js-seo', 'google-links', 'vercel-ai-crawlers'],
  fix: 'Switch to path-based routing with the History API (BrowserRouter, createWebHistory, Next.js/Astro file routes) and serve each route as its own URL with server-rendered HTML.',
  check(site) {
    const out = [];
    const units = [
      ...site.scripts.map((s) => ({ file: s.file, signals: s.signals })),
      ...site.components.map((c) => ({ file: c.file, signals: c.signals })),
      ...site.pages.map((p) => ({ file: p.file, signals: p.signals })),
      ...site.layouts.map((p) => ({ file: p.file, signals: p.signals })),
    ];
    for (const u of units) {
      const lines = (u.signals && u.signals.hashRouting) || [];
      if (lines.length) out.push({ file: u.file, line: lines[0], message: `Hash-based routing found (${lines.length} place${lines.length > 1 ? 's' : ''}, first on line ${lines[0]}).` });
    }
    const anyRouting = out.length > 0;
    for (const p of [...site.pages, ...site.components]) {
      const hashLinks = p.links.filter((l) => typeof l.href === 'string' && /^#[!/]?[A-Za-z0-9]/.test(l.href) && l.href.length > 2);
      const candidates = anyRouting ? hashLinks : hashLinks.filter((l) => /^#[!/]/.test(l.href));
      if (candidates.length >= 3) {
        out.push({ file: p.file, line: candidates[0].line, severity: 'warn', message: `${candidates.length} links point to #fragment routes (e.g. ${candidates.slice(0, 3).map((l) => l.href).join(', ')}).` });
      }
    }
    return out;
  },
};
