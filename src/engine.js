// Run rules over a site, apply config, score pages.
import { RULES } from './rules/index.js';
import { sourceList } from './sources.js';

export const WEIGHTS = { error: 12, warn: 4, info: 1 };
const RANK = { info: 1, warn: 2, error: 3 };

export function severityAtLeast(sev, threshold) {
  if (!threshold || threshold === 'none') return false;
  return RANK[sev] >= RANK[threshold];
}

function resolveSeverity(rule, finding, config) {
  const override = config.rules && config.rules[rule.id];
  if (override && override !== 'off') {
    // an override sets the rule's top severity; findings the rule already marks lower stay relatively lower
    if (finding.severity && RANK[finding.severity] < RANK[rule.severity]) {
      const delta = RANK[rule.severity] - RANK[finding.severity];
      const r = Math.max(1, RANK[override] - delta);
      return Object.keys(RANK).find((k) => RANK[k] === r);
    }
    return override;
  }
  return finding.severity || rule.severity;
}

export function activeRules(config = {}, { ai = false } = {}) {
  return RULES.filter((r) => {
    const o = config.rules && config.rules[r.id];
    if (o === 'off') return false;
    if (r.ai && !ai) return false;
    if (config.only && config.only.length && !config.only.includes(r.id)) return false;
    return true;
  });
}

export function runRules(site, config = {}, { ai = false } = {}) {
  const findings = [];
  const ctx = { site, config };
  const markupUnits = [...site.pages, ...site.components];
  for (const rule of activeRules(config, { ai })) {
    if (rule.ai) continue;
    let raw = [];
    const push = (unit, list) => {
      for (const f of list || []) raw.push({ ...f, file: f.file || unit.file });
    };
    try {
      if (rule.scope === 'site') push({ file: '' }, rule.check(site, ctx));
      else if (rule.scope === 'page') for (const p of site.pages) push(p, rule.check(p, ctx));
      else if (rule.scope === 'markup') for (const u of markupUnits) push(u, rule.check(u, ctx));
    } catch (e) {
      raw = [{ file: '', line: 0, severity: 'info', message: `Rule crashed: ${e.message}` }];
    }
    for (const f of raw) findings.push(decorate(rule, f, config));
  }
  return findings;
}

export function decorate(rule, f, config = {}) {
  return {
    ruleId: rule.id,
    severity: resolveSeverity(rule, f, config),
    file: f.file,
    line: f.line || 0,
    message: f.message,
    why: rule.rationale,
    fix: f.fix || rule.fix,
    sources: sourceList(rule.sources),
    category: rule.category,
  };
}

/** Score 0-100 for a list of findings: each rule costs at most two of its findings. */
export function scoreFindings(list) {
  const perRule = new Map();
  for (const f of list) {
    const w = WEIGHTS[f.severity] || 0;
    const cur = perRule.get(f.ruleId) || { total: 0, max: 0 };
    cur.total += w;
    cur.max = Math.max(cur.max, w);
    perRule.set(f.ruleId, cur);
  }
  let penalty = 0;
  for (const v of perRule.values()) penalty += Math.min(v.total, v.max * 2);
  return Math.max(0, 100 - penalty);
}

/**
 * Group findings by page and compute scores.
 * Returns { pages: [{file, route, score, findings}], site: {score, findings}, overall, counts }
 */
export function summarise(site, findings) {
  const byFile = new Map();
  for (const p of site.pages) byFile.set(p.file, { file: p.file, route: p.route, kind: p.kind, findings: [] });
  const siteFindings = [];
  const other = new Map();
  for (const f of findings) {
    if (byFile.has(f.file)) byFile.get(f.file).findings.push(f);
    else if (site.components.some((c) => c.file === f.file) || site.layouts.some((c) => c.file === f.file) || site.scripts.some((c) => c.file === f.file)) {
      if (!other.has(f.file)) other.set(f.file, { file: f.file, findings: [] });
      other.get(f.file).findings.push(f);
    } else siteFindings.push(f);
  }
  const pages = [...byFile.values()].map((p) => ({ ...p, score: scoreFindings(p.findings) }));
  const files = [...other.values()];
  const siteScore = scoreFindings([...siteFindings, ...files.flatMap((f) => f.findings)]);
  const pageAvg = pages.length ? pages.reduce((a, p) => a + p.score, 0) / pages.length : siteScore;
  const overall = Math.round(pages.length ? pageAvg * 0.6 + siteScore * 0.4 : siteScore);
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return { pages, files, site: { score: siteScore, findings: siteFindings }, overall, counts };
}
