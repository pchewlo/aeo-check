export default {
  id: 'ai-section-answers',
  severity: 'warn',
  scope: 'page',
  category: 'content',
  ai: true,
  title: '(--ai) Each section answers its heading on its own',
  rationale: 'If a section were lifted out of the page, would its meaning, evidence and limitations still be clear? Only one to three passages per source reach the answering model, so each needs to stand alone.',
  sources: ['x-jingg'],
  fix: 'Rewrite the opening of the section so it answers the heading directly, naming the subject and the conditions that apply.',
  check() { return []; },
};
