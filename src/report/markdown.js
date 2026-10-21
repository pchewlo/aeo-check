// Markdown report for PR comments and job summaries.
export function formatMarkdown(result, { maxRows = 60 } = {}) {
  const { summary } = result;
  const { error, warn, info } = summary.counts;
  const out = [];
  out.push('<!-- aeo-check -->');
  out.push(`### aeo-check: ${summary.overall}/100`);
  out.push('');
  out.push(`${error} errors, ${warn} warnings, ${info} info across ${summary.pages.length} pages.${summary.agent ? ` Agent score ${summary.agent.score}/100 (fetch-only ${summary.agent.fetchOnly}${summary.agent.browser !== null ? `, browser ${summary.agent.browser}` : ''}).` : ''}`);
  out.push('');
  if (result.site && result.site.journeys && result.site.journeys.length) {
    out.push('| Call to action | Outcome | Path (as an agent without JavaScript) |');
    out.push('| --- | --- | --- |');
    const cell = (x) => String(x).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    for (const j of result.site.journeys) out.push(`| ${cell(j.name)} | ${j.outcome} | ${cell([...j.steps.map((s) => `${s.finalUrl || s.url} (${s.status}${s.notes.length ? `: ${s.notes.join('; ')}` : ''})`), j.stop].filter(Boolean).join(' → '))} |`);
    out.push('');
  }
  if (result.site && result.site.browser && result.site.browser.journeys.length) {
    out.push('| Call to action | In a browser | Path (stopped before the final submit) |');
    out.push('| --- | --- | --- |');
    const cell = (x) => String(x).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    for (const w of result.site.browser.journeys) out.push(`| ${cell(w.name)} | ${w.outcome} | ${cell([...w.steps.map((s) => s.url + (s.notes.length ? ` (${s.notes.join('; ')})` : '')), ...w.friction.map((f) => `friction: ${f}`), w.stop].filter(Boolean).join(' → '))} |`);
    out.push('');
  }
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
