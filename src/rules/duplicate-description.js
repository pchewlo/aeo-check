import { duplicates } from './duplicate-title.js';

export default {
  id: 'duplicate-description',
  severity: 'warn',
  scope: 'site',
  category: 'metadata',
  title: 'Meta descriptions are unique',
  rationale: 'A description copied across pages describes none of them. Answer engines read metadata with each passage, so it should match the page it sits on.',
  sources: ['x-jingg', 'google-snippet'],
  fix: 'Write a description per page, or leave it out on pages where you cannot say something specific.',
  check(site) {
    const out = [];
    for (const g of duplicates(site, 'description')) {
      for (const p of g) {
        const d = p.head.description;
        out.push({ file: p.file, line: d.inherited ? 1 : d.line, message: `Meta description is shared by ${g.length} pages (${g.filter((x) => x !== p).slice(0, 3).map((x) => x.route).join(', ')}${g.length > 4 ? ', ...' : ''}).` });
      }
    }
    return out;
  },
};
