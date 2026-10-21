export function formatJson(result) {
  const { summary } = result;
  return JSON.stringify({
    tool: 'aeo-check',
    version: result.version,
    target: result.target,
    overall: summary.overall,
    counts: summary.counts,
    site: { score: summary.site.score, findings: summary.site.findings },
    files: summary.files,
    pages: summary.pages.map((p) => ({ file: p.file, route: p.route, score: p.score, findings: p.findings })),
  }, null, 2) + '\n';
}
