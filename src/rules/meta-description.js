import { headSeverity, isIndexable } from './_util.js';

export default {
  id: 'meta-description',
  severity: 'warn',
  scope: 'page',
  category: 'metadata',
  title: 'Every page has a meta description',
  rationale: 'The meta description travels with each retrieved result in ChatGPT\'s pipeline and Google often uses it as the snippet. It should state what the page answers, in words that match the content.',
  sources: ['x-jingg', 'x-suraj', 'google-snippet'],
  fix: 'Write a 70-160 character description that answers "what will I learn or get here?" for this specific page.',
  check(page) {
    if (!isIndexable(page)) return [];
    const d = page.head.description;
    if (!d) return [{ line: 1, severity: headSeverity(page, 'warn'), message: 'No meta description.' }];
    if (d.dynamic) return [];
    if (d.inherited && !page.isHome) return [{ line: 1, severity: 'info', message: `No description of its own; it inherits the one from ${d.from}.` }];
    const len = (d.text || '').length;
    if (!len) return [{ line: d.line, message: 'Meta description is empty.' }];
    if (len < 50) return [{ line: d.line, severity: 'info', message: `Meta description is ${len} characters; it can say more about what the page answers.` }];
    if (len > 170) return [{ line: d.line, severity: 'info', message: `Meta description is ${len} characters and will be cut off.` }];
    return [];
  },
};
