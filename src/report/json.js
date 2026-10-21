export function formatJson(result) {
  const { summary } = result;
  return JSON.stringify({
    tool: 'aeo-check',
    version: result.version,
    target: result.target,
    overall: summary.overall,
    counts: summary.counts,
    site: { score: summary.site.score, findings: summary.site.findings },
    ...(summary.agent !== undefined ? { agent: summary.agent } : {}),
    ...(result.site && result.site.journeys ? { journeys: result.site.journeys } : {}),
    ...(result.site && result.site.browser ? { browser: result.site.browser } : {}),
    files: summary.files,
    pages: summary.pages.map((p) => ({ file: p.file, route: p.route, score: p.score, findings: p.findings })),
  }, null, 2) + '\n';
}
