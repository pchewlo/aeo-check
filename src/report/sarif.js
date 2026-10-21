import { RULES } from '../rules/index.js';

const LEVEL = { error: 'error', warn: 'warning', info: 'note' };
const REPO = 'https://github.com/pchewlo/aeo-check';

export function formatSarif(result) {
  const all = result.findings;
  const used = new Set(all.map((f) => f.ruleId));
  const rules = RULES.filter((r) => used.has(r.id));
  const index = Object.fromEntries(rules.map((r, i) => [r.id, i]));
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'aeo-check',
          version: result.version,
          informationUri: REPO,
          rules: rules.map((r) => ({
            id: r.id,
            name: r.id.replace(/(^|-)([a-z])/g, (_, __, ch) => ch.toUpperCase()),
            shortDescription: { text: r.title },
            fullDescription: { text: r.rationale },
            help: { text: `${r.rationale}\n\nFix: ${r.fix}`, markdown: `${r.rationale}\n\n**Fix:** ${r.fix}\n\nSources:\n${r.sources.map((s) => `- ${s}`).join('\n')}` },
            helpUri: `${REPO}#${r.id}`,
            defaultConfiguration: { level: LEVEL[r.severity] },
            properties: { category: r.category, tags: ['aeo', r.category] },
          })),
        },
      },
      results: all.map((f) => {
        const isUrl = /^https?:\/\//.test(f.file);
        const loc = { physicalLocation: { artifactLocation: { uri: f.file || 'robots.txt' } } };
        if (!isUrl && f.line > 0) loc.physicalLocation.region = { startLine: f.line };
        return {
          ruleId: f.ruleId,
          ruleIndex: index[f.ruleId],
          level: LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.fix}` },
          locations: [loc],
          partialFingerprints: { aeoCheck: `${f.ruleId}:${f.file}:${f.message}`.slice(0, 200) },
        };
      }),
    }],
  };
  return JSON.stringify(sarif, null, 2) + '\n';
}
