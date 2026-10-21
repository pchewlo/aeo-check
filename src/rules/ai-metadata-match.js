export default {
  id: 'ai-metadata-match',
  severity: 'warn',
  scope: 'page',
  category: 'metadata',
  ai: true,
  title: '(--ai) Title and description match the content',
  rationale: 'Titles and descriptions should accurately describe the page\'s subject and match its content; they travel with every retrieved passage.',
  sources: ['x-jingg'],
  fix: 'Rewrite the title and meta description to name what the page actually answers.',
  check() { return []; },
};
