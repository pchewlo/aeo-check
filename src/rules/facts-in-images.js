import { cap } from './_util.js';

const FACTY = /(pricing|price|plans?|comparison|compare|[-_]vs[-_]|table|chart|graph|benchmark|features?[-_]?(list|table|grid)|specs?|specification|infographic|stats|statistics|results|metrics)/i;

export default {
  id: 'facts-in-images',
  severity: 'warn',
  scope: 'markup',
  category: 'media',
  title: 'Pricing, comparisons and charts also exist as text',
  rationale: 'Pages become plain text during retrieval. Prices, feature grids and benchmark charts that only exist as images are invisible to the answer engine; charts need a written takeaway.',
  sources: ['x-jingg', 'google-ai-features'],
  fix: 'Put the numbers in HTML text or a table next to the image, and state the chart\'s takeaway in a sentence.',
  check(page) {
    const out = [];
    for (const img of page.images) {
      const file = (img.src || '').split('/').pop();
      const subject = `${file} ${img.alt || ''}`;
      const m = FACTY.exec(subject);
      if (!m) continue;
      const sev = page.tables.length || page.wordCount >= 300 ? 'info' : 'warn';
      out.push({ line: img.line, severity: sev, message: `Image "${(file || img.alt || '').slice(0, 50)}" looks like it carries facts (${m[0]}); make sure they are also in the page text.` });
    }
    return cap(out, 3);
  },
};
