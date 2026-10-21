import { QUESTION, isIndexable } from './_util.js';

export default {
  id: 'question-headings',
  severity: 'info',
  scope: 'page',
  category: 'content',
  title: 'Some headings match the questions people ask',
  rationale: 'Each AI prompt fans out into several hidden searches (one ChatGPT prompt ran 18 queries). Headings phrased as those questions, each followed by its answer, give the engine passages that match the fan-out queries.',
  sources: ['x-kasra', 'x-jingg', 'x-mal'],
  fix: 'Rephrase headings that cover a question as the question, e.g. "How much does X cost?" instead of "Pricing", and answer it in the first sentence below.',
  check(page) {
    if (!isIndexable(page) || page.wordCount < 400) return [];
    const hs = page.headings.filter((h) => !h.chrome && (h.level === 2 || h.level === 3) && !h.dynamic);
    if (hs.length < 3) return [];
    if (hs.some((h) => QUESTION.test(h.text))) return [];
    return [{ line: hs[0].line, message: `None of the ${hs.length} section headings is phrased as a question.` }];
  },
};
