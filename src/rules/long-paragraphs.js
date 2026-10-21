import { paragraphs, words, excerpt, cap } from './_util.js';

export default {
  id: 'long-paragraphs',
  severity: 'warn',
  scope: 'markup',
  category: 'content',
  title: 'Paragraphs fit in one retrieval chunk',
  rationale: 'ChatGPT cuts pages into blocks of roughly 170 words and scores each one. A paragraph longer than that gets split, so the claim and its context can land in different blocks.',
  sources: ['x-jingg'],
  fix: 'Split paragraphs over about 150 words. Lead with the point, and keep each claim in the same paragraph as its evidence.',
  check(page) {
    const out = [];
    for (const p of paragraphs(page)) {
      const n = words(p.text).length;
      if (n > 150) out.push({ line: p.line, message: `Paragraph of ${n} words: "${excerpt(p.text, 60)}".` });
    }
    return cap(out, 5);
  },
};
