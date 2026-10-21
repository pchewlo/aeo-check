import { isIndexable } from './_util.js';

export function duplicates(site, key) {
  const groups = new Map();
  for (const p of site.pages) {
    if (!isIndexable(p) || p.isDynamicRoute) continue;
    const v = p.head[key];
    if (!v || v.dynamic || !v.text) continue;
    const k = v.text.trim().toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export default {
  id: 'duplicate-title',
  severity: 'warn',
  scope: 'site',
  category: 'metadata',
  title: 'Titles are unique',
  rationale: 'When pages share a title, crawlers and answer engines cannot tell which one answers a query, and often pick one and ignore the rest. Each page should name its own subject.',
  sources: ['x-jingg', 'google-title'],
  fix: 'Give each page a title naming its own subject. In Next.js, set metadata.title per page instead of relying on the layout default.',
  check(site) {
    const out = [];
    for (const g of duplicates(site, 'title')) {
      for (const p of g) {
        const t = p.head.title;
        out.push({ file: p.file, line: t.inherited ? 1 : t.line, message: `Title "${t.text}" is shared by ${g.length} pages (${g.filter((x) => x !== p).slice(0, 3).map((x) => x.route).join(', ')}${g.length > 4 ? ', ...' : ''}).${t.inherited ? ` It is inherited from ${t.from}.` : ''}` });
      }
    }
    return out;
  },
};
