import { paragraphs } from './_util.js';

export const SLOP = [
  "in today's fast-paced", 'in the ever-evolving', 'ever-changing landscape', 'in the realm of', 'delve into', 'delves into', 'dive deep into', "let's dive in",
  'unlock the power', 'unleash the', 'harness the power', 'game-changer', 'game changer', 'revolutionize', 'revolutionise', 'seamlessly integrate',
  'a testament to', 'navigate the complexities', 'it is important to note', "it's important to note", 'it is worth noting', 'in conclusion,',
  'whether you are a', "whether you're a", 'look no further', 'elevate your', 'supercharge your', 'cutting-edge', 'treasure trove', 'tapestry',
  'embark on a journey', 'the world of', 'plays a crucial role', 'plays a pivotal role', 'paving the way', 'at the end of the day',
];

export default {
  id: 'ai-slop-phrases',
  severity: 'info',
  scope: 'page',
  category: 'content',
  title: 'No stock AI-writing phrases',
  rationale: 'Pages written "from the model\'s imagination" were the ones that failed to rank; stock phrases are the visible sign. They add words without facts, which lowers the passage\'s score against a question.',
  sources: ['x-suraj', 'x-lotti', 'google-helpful'],
  fix: 'Replace each phrase with the specific fact, number or example it stands in for, or delete it.',
  check(page) {
    const found = new Map();
    for (const p of paragraphs(page)) {
      const t = p.text.toLowerCase();
      for (const s of SLOP) if (t.includes(s) && !found.has(s)) found.set(s, p.line);
    }
    for (const h of page.headings) {
      const t = h.text.toLowerCase();
      for (const s of SLOP) if (t.includes(s) && !found.has(s)) found.set(s, h.line);
    }
    if (!found.size) return [];
    const list = [...found.entries()];
    return [{ line: list[0][1], message: `Stock phrases: ${list.slice(0, 6).map(([s]) => `"${s}"`).join(', ')}${list.length > 6 ? ` and ${list.length - 6} more` : ''}.` }];
  },
};
