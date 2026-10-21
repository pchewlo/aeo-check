import { sections, excerpt, cap } from './_util.js';

export const LEAD_IN = /^(in this (section|article|post|guide|chapter|piece|tutorial)|this (section|article|post|guide|chapter) (will|covers|explains|looks|walks|is about|discusses)|let'?s |let us |before we |as (we )?(mentioned|discussed|noted|saw|have seen)|below,? (we|you)|here,? we|here'?s (what|how|where|why)|we('ll| will) (now )?(look|explore|discuss|cover|dive|go|walk|take)|welcome to|have you ever|in today'?s|imagine |now that|so,? you|ever wondered|you might be wondering|it'?s no secret|when it comes to)/i;

export default {
  id: 'answer-first',
  severity: 'warn',
  scope: 'page',
  category: 'content',
  title: 'Sections open with a direct answer',
  rationale: 'Answer engines score passages of about 170 words and pass only one to three per source to the model. A section that opens with a lead-in ("In this section...") spends its best passage on nothing; one that opens with the answer gets quoted.',
  sources: ['x-jingg', 'x-mal', 'google-helpful'],
  fix: 'Start each section with one or two sentences that answer its heading on their own, naming the subject. Move scene-setting after the answer or cut it.',
  check(page) {
    const out = [];
    for (const s of sections(page)) {
      const h = s.heading;
      if (!h || h.level < 2 || h.level > 3 || h.dynamic) continue;
      const first = s.blocks.find((b) => b.kind !== 'code');
      if (!first) continue;
      if (first.kind !== 'p' && first.kind !== 'quote') continue;
      const m = LEAD_IN.exec(first.text);
      if (m) out.push({ line: first.line, message: `Section "${excerpt(h.text, 50)}" opens with a lead-in ("${excerpt(first.text, 60)}").` });
    }
    return cap(out, 5);
  },
};
