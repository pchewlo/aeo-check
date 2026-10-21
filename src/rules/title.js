import { headSeverity, isIndexable } from './_util.js';

export default {
  id: 'title',
  severity: 'error',
  scope: 'page',
  category: 'metadata',
  title: 'Every page has a specific <title>',
  rationale: 'ChatGPT keeps each result\'s title and meta tags alongside the text it retrieves, and Google uses the title as the link text. A missing or generic title leaves the answer engine guessing what the page is about.',
  sources: ['x-jingg', 'x-suraj', 'google-title'],
  fix: 'Give each page a title of roughly 15-65 characters that names the subject, e.g. "Pricing for Acme analytics: plans and limits". In Next.js set metadata.title; elsewhere use <title>.',
  check(page) {
    if (!isIndexable(page)) return [];
    const t = page.head.title;
    if (!t) return [{ line: 1, severity: headSeverity(page, 'error'), message: page.headConfidence === 'partial' ? 'No title found in this page, its frontmatter or its layout props.' : 'No <title>.' }];
    if (t.dynamic) return [];
    const text = (t.text || '').trim();
    if (!text) return [{ line: t.line, message: 'The <title> is empty.' }];
    if (/^(home|untitled|document|index|page|welcome|react app|vite app|create next app|my app)$/i.test(text)) return [{ line: t.line, severity: 'warn', message: `Title "${text}" is a placeholder.` }];
    if (text.length < 10) return [{ line: t.line, severity: 'warn', message: `Title "${text}" is too short to describe the page.` }];
    if (text.length > 70) return [{ line: t.line, severity: 'info', message: `Title is ${text.length} characters; results usually show about 60.` }];
    return [];
  },
};
