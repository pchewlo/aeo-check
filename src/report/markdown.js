// Markdown report for PR comments and job summaries.
export function formatMarkdown(result, { maxRows = 60 } = {}) {
  const { summary } = result;
  const { error, warn, info } = summary.counts;
  const out = [];
  out.push('<!-- aeo-check -->');
  out.push(`### aeo-check: ${summary.overall}/100`);
  out.push('');
  out.push(`${error} errors, ${warn} warnings, ${info} info across ${summary.pages.length} pages.`);
  out.push('');
  const pages = [...summary.pages].sort((a, b) => a.score - b.score).slice(0, 15);
  if (pages.length) {
    out.push('| Page | Score | Errors | Warnings |');
    out.push('| --- | ---: | ---: | ---: |');
    for (const p of pages) out.push(`| \`${p.route}\` (${p.file}) | ${p.score} | ${p.findings.filter((f) => f.severity === 'error').length} | ${p.findings.filter((f) => f.severity === 'warn').length} |`);
    out.push('');
  }
  const rows = result.findings.filter((f) => f.severity !== 'info').sort((a, b) => (a.severity === 'error' ? -1 : 1) - (b.severity === 'error' ? -1 : 1)).slice(0, maxRows);
  if (rows.length) {
    out.push('| Severity | Rule | Location | Finding | Fix |');
    out.push('| --- | --- | --- | --- | --- |');
    const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    for (const f of rows) out.push(`| ${f.severity} | \`${f.ruleId}\` | \`${cell(f.file)}${f.line ? ':' + f.line : ''}\` | ${cell(f.message)} | ${cell(f.fix)} |`);
    const hidden = result.findings.filter((f) => f.severity !== 'info').length - rows.length;
    if (hidden > 0) out.push(`\n${hidden} more not shown.`);
  }
  return out.join('\n') + '\n';
}
