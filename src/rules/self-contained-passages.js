import { paragraphs, excerpt, cap } from './_util.js';

export const VAGUE = /\b(as (mentioned|discussed|noted|shown|described|stated|explained) (above|earlier|before|previously)|see (above|below)|the (above|preceding|previous) (section|table|chart|figure|example|results?|list|point)|(mentioned|shown|described|discussed|outlined) (above|earlier)|the results above|this approach|this method|this technique|the former|the latter|(in|from) the (previous|last) section|as we saw|as you can see (above|below))\b/i;

export default {
  id: 'self-contained-passages',
  severity: 'info',
  scope: 'page',
  category: 'content',
  title: 'Passages make sense on their own',
  rationale: 'Only selected passages reach the answering model, so "this approach" or "the results above" lose their meaning once lifted out. Naming the subject keeps the passage quotable.',
  sources: ['x-jingg'],
  fix: 'Replace the reference with the thing itself, e.g. "server-side rendering" instead of "this approach", "the 2026 benchmark" instead of "the results above".',
  check(page) {
    const out = [];
    for (const p of paragraphs(page)) {
      const m = VAGUE.exec(p.text);
      if (m) out.push({ line: p.line, message: `"${m[0]}" refers to something outside this passage: "${excerpt(p.text, 70)}".` });
    }
    return cap(out, 5);
  },
};
