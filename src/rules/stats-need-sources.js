import { paragraphs, excerpt, cap } from './_util.js';

const STAT = /\b\d+(\.\d+)?\s?%|\b\d+(\.\d+)?x\b|\b\d+(\.\d+)?\s?(times|million|billion|bn|trillion)\b|\b\d{1,3}(,\d{3}){2,}\b/i;

export default {
  id: 'stats-need-sources',
  severity: 'info',
  scope: 'page',
  category: 'content',
  title: 'Statistics link to their source',
  rationale: 'Passages are scored one at a time, so a claim and its evidence can get separated. Putting the number, the source link and the caveat in the same paragraph keeps the claim citable.',
  sources: ['x-jingg', 'x-lotti'],
  fix: 'Link the source in the same paragraph as the number ("41% of buyers, per the 2026 Gartner survey") and say how it was measured.',
  check(page) {
    const out = [];
    for (const p of paragraphs(page)) {
      if (p.hasLink) continue;
      const m = STAT.exec(p.text);
      if (!m) continue;
      if (/\b(source|according to|per the|study|survey|report|data from)\b/i.test(p.text) && /\b(19|20)\d\d\b/.test(p.text)) continue;
      out.push({ line: p.line, message: `"${m[0].trim()}" has no source link in its paragraph: "${excerpt(p.text, 60)}".` });
    }
    return cap(out, 5);
  },
};
