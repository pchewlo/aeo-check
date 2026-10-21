import { isIndexable } from './_util.js';

const COMPARE = /\b(vs\.?|versus|alternatives?|compar(e|ed|ison)|best\s.+\sfor|pricing|plans|top\s\d+|review)\b/i;

export default {
  id: 'comparison-format',
  severity: 'info',
  scope: 'page',
  category: 'content',
  title: 'Comparison and pricing pages use tables',
  rationale: '"X vs Y", "alternatives", "best X for Y" and pricing pages drive most conversions, and answer engines lift structured comparisons directly. A table with labelled columns is the easiest form to quote.',
  sources: ['x-rob-pages', 'x-boringlocal', 'x-jingg', 'x-cody-refresh'],
  fix: 'Add a comparison table (rows = options, columns = price, limits, key features) with header cells, plus a sentence summarising who each option suits.',
  check(page) {
    if (!isIndexable(page)) return [];
    const h1 = page.headings.find((h) => h.level === 1);
    const subject = [page.head.title && page.head.title.text, h1 && h1.text, page.route.replace(/[-/]/g, ' ')].filter(Boolean).join(' | ');
    const m = COMPARE.exec(subject);
    if (!m || page.tables.length) return [];
    if (page.wordCount < 100 && page.kind !== 'html') return [];
    return [{ line: h1 ? h1.line : 1, message: `Looks like a comparison or pricing page ("${m[0]}") but has no table.` }];
  },
};
