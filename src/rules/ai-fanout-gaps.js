export default {
  id: 'ai-fanout-gaps',
  severity: 'info',
  scope: 'page',
  category: 'content',
  ai: true,
  title: '(--ai) Page covers the sub-questions behind its topic',
  rationale: 'One prompt triggers many related searches (use cases, costs, requirements, alternatives, hard cases). Pages that answer those sub-questions get cited for far more phrases.',
  sources: ['x-jingg', 'x-kasra', 'x-mal'],
  fix: 'Add a short section answering each missing sub-question, with a question-style heading.',
  check() { return []; },
};
