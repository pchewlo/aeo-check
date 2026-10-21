export default {
  id: 'llms-txt-valid',
  severity: 'error',
  scope: 'site',
  category: 'crawl',
  title: 'llms.txt follows the spec',
  rationale: 'Tools that read llms.txt expect the llmstxt.org layout: an H1, an optional blockquote summary, and H2 sections whose items are markdown links. A malformed file is skipped or misread.',
  sources: ['llmstxt'],
  fix: 'Start with "# Site name", add "> summary", then "## Docs" (or similar) with "- [Name](url): notes" items. Put secondary links under "## Optional".',
  check(site) {
    const l = site.llms;
    if (!l || l.generated || !l.parsed) return [];
    const out = l.parsed.problems.map((p) => ({ file: l.path, line: p.line, severity: p.severity, message: p.message }));
    if (site.mode === 'url' && site.llmsContentType && !/text\/(plain|markdown)/.test(site.llmsContentType)) {
      out.push({ file: l.path, line: 1, severity: 'warn', message: `Served as ${site.llmsContentType}; serve it as text/plain or text/markdown.` });
    }
    return out;
  },
};
