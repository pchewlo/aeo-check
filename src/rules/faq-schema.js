import { sections, QUESTION, isIndexable } from './_util.js';
import { jsonLdTypes } from '../site.js';

export default {
  id: 'faq-schema',
  severity: 'info',
  scope: 'page',
  category: 'schema',
  title: 'Question-and-answer content has FAQPage markup',
  rationale: 'Pages that answer several questions under question headings can declare them as FAQPage JSON-LD, so crawlers get each question and its answer as a pair. "Add FAQ schema" is on the standard checklist.',
  sources: ['x-suraj', 'google-faq'],
  fix: 'Add FAQPage JSON-LD listing each visible question (name) with its answer (acceptedAnswer.text).',
  check(page) {
    if (!isIndexable(page)) return [];
    const qa = sections(page).filter((s) => s.heading && s.heading.level >= 2 && /\?\s*$/.test(s.heading.text) && s.blocks.some((b) => b.kind === 'p' || b.kind === 'list'));
    if (qa.length < 3) return [];
    const types = jsonLdTypes(page);
    if (types.some((t) => /FAQPage|QAPage/.test(t))) return [];
    return [{ line: qa[0].heading.line, message: `${qa.length} question headings with answers, but no FAQPage JSON-LD.` }];
  },
};
