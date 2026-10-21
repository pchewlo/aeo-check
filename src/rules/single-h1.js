import { isIndexable, rendersComponents } from './_util.js';

export default {
  id: 'single-h1',
  severity: 'error',
  scope: 'page',
  category: 'structure',
  title: 'One H1 per page',
  rationale: 'Retrieval turns the page into markdown-like text where "# heading" marks the subject. One H1 that names the topic tells the answer engine what every passage below is about.',
  sources: ['x-suraj', 'x-jingg'],
  fix: 'Use exactly one <h1> naming the page subject; demote other top-level headings to <h2>.',
  check(page) {
    if (!isIndexable(page)) return [];
    const h1s = page.headings.filter((h) => h.level === 1);
    if (h1s.length > 1) return [{ line: h1s[1].line, severity: 'warn', message: `${h1s.length} H1 headings (lines ${h1s.map((h) => h.line).join(', ')}).` }];
    if (h1s.length === 1) return [];
    if (page.kind === 'md') {
      if (page.head.title && page.head.title.via === 'frontmatter') return [];
      return [{ line: 1, severity: 'warn', message: 'No H1 and no frontmatter title.' }];
    }
    if (page.kind === 'html' || page.kind === 'url') return [{ line: 1, message: 'No <h1> in the HTML.' }];
    if (page.dataDriven || rendersComponents(page)) return [{ line: 1, severity: 'info', message: 'No <h1> in this file; if a component renders it, ignore this.' }];
    return [{ line: 1, severity: 'warn', message: 'No <h1>.' }];
  },
};
