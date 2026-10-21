const COLORS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m', green: '\x1b[32m' };

export function formatText(result, { color = false, quiet = false } = {}) {
  const c = (k, s) => (color ? COLORS[k] + s + COLORS.reset : s);
  const out = [];
  const { summary, target, site } = result;
  out.push(c('bold', `aeo-check ${result.version}`) + `  ${target}`);
  out.push(c('dim', `${site.pages.length} page${site.pages.length === 1 ? '' : 's'}, ${site.components.length} components, ${site.scripts.length} scripts${site.framework ? `, framework: ${site.framework.all.join('+')}` : ''}`));
  out.push('');

  if (site.journeys) {
    const LABEL = { reached: ['green', 'reached'], handoff: ['info', 'user finishes'], 'needs-browser': ['warn', 'needs browser'], 'dead-end': ['warn', 'dead end'], broken: ['error', 'broken'] };
    out.push(c('bold', 'Calls to action, followed as an agent that does not run JavaScript'));
    if (!site.journeys.length) out.push(c('dim', '  No primary call to action (sign up, book, buy, checkout) found on the start page.'));
    for (const j of site.journeys) {
      const [col, label] = LABEL[j.outcome] || ['dim', j.outcome];
      out.push(`  ${c(col, label.padEnd(13))} ${c('bold', `"${j.name}"`)}${j.count > 1 ? c('dim', ` ${j.count} links`) : ''}`);
      j.steps.forEach((s, i) => out.push(`  ${''.padEnd(13)} ${i + 1}. ${s.finalUrl || s.url}  ${c('dim', String(s.status))}${s.notes.length ? `  ${s.notes.join('; ')}` : ''}`));
      if (j.stop) out.push(`  ${''.padEnd(13)} ${c('dim', j.stop)}`);
    }
    out.push('');
  }

  const line = (f) => {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    const sev = c(f.severity, f.severity.padEnd(5));
    const rows = [`  ${sev} ${c('bold', f.ruleId)}  ${c('dim', loc)}`, `        ${f.message}`];
    if (!quiet && f.severity !== 'info') {
      rows.push(c('dim', `        why: ${f.why}`));
      rows.push(`        fix: ${f.fix}`);
    } else if (!quiet) rows.push(c('dim', `        fix: ${f.fix}`));
    return rows.join('\n');
  };
  const sortF = (a, b) => ({ error: 0, warn: 1, info: 2 }[a.severity] - { error: 0, warn: 1, info: 2 }[b.severity]) || (a.line - b.line);

  const siteFindings = [...summary.site.findings, ...summary.files.flatMap((f) => f.findings)].sort(sortF);
  if (siteFindings.length) {
    out.push(c('bold', `Site and shared files  score ${summary.site.score}/100`));
    for (const f of siteFindings) out.push(line(f));
    out.push('');
  }
  const pages = [...summary.pages].sort((a, b) => a.score - b.score || a.file.localeCompare(b.file));
  for (const p of pages) {
    if (!p.findings.length) continue;
    out.push(c('bold', `${p.file}`) + c('dim', `  ${p.route}`) + `  score ${p.score}/100`);
    for (const f of p.findings.sort(sortF)) out.push(line(f));
    out.push('');
  }
  const clean = pages.filter((p) => !p.findings.length).length;
  if (clean) out.push(c('green', `${clean} page${clean === 1 ? '' : 's'} with no findings.`));
  const { error, warn, info } = summary.counts;
  out.push(c('bold', `Overall ${summary.overall}/100`) + `  ${c('error', `${error} error${error === 1 ? '' : 's'}`)}, ${c('warn', `${warn} warning${warn === 1 ? '' : 's'}`)}, ${c('info', `${info} info`)}`);
  if (result.notes && result.notes.length) for (const n of result.notes) out.push(c('dim', n));
  return out.join('\n') + '\n';
}
