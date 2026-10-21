export default {
  id: 'ai-claims-evidence',
  severity: 'info',
  scope: 'page',
  category: 'trust',
  ai: true,
  title: '(--ai) Claims sit beside their evidence',
  rationale: 'Passages are scored individually, so a claim separated from its metric, source, method or caveat loses its support. Unverifiable figures and self-proclaimed wins are also what negative-SEO campaigns exploit.',
  sources: ['x-jingg', 'x-lotti'],
  fix: 'Put the number, the source link, how it was measured and any caveat in the same paragraph as the claim.',
  check() { return []; },
};
