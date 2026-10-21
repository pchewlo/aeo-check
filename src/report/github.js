// GitHub Actions workflow commands: inline annotations on the PR diff.
const CMD = { error: 'error', warn: 'warning', info: 'notice' };
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function formatGithub(result) {
  const lines = [];
  for (const f of result.findings) {
    const props = [];
    if (f.file && !/^https?:/.test(f.file)) props.push(`file=${escProp(f.file)}`);
    if (f.line > 0) props.push(`line=${f.line}`);
    props.push(`title=${escProp(`aeo-check ${f.ruleId}`)}`);
    lines.push(`::${CMD[f.severity]} ${props.join(',')}::${esc(`${f.message}\nFix: ${f.fix}`)}`);
  }
  const { error, warn, info } = result.summary.counts;
  lines.push(`aeo-check: overall ${result.summary.overall}/100, ${error} errors, ${warn} warnings, ${info} info`);
  return lines.join('\n') + '\n';
}
