// Agent score: can an assistant acting for a user complete the site's main calls to action?
// Reported next to the AEO score rather than averaged into it, so one blocked CTA is not
// diluted by fifty content rules.
const FETCH = { reached: 100, handoff: 90, 'needs-browser': 50, 'dead-end': 25, broken: 0 };
const BROWSER = { reached: 100, handoff: 90, stuck: 30, broken: 0 };
const FRICTION_COST = 10;
const MIN_REACHED = 60;

const browserPoints = (b) => (b.outcome === 'reached' ? Math.max(MIN_REACHED, 100 - FRICTION_COST * (b.friction || []).length) : BROWSER[b.outcome] ?? 0);
const avg = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;

/**
 * { score, fetchOnly, browser, ctas: [{ name, fetchOnly, browser, score }] }, or null when the
 * start page has no call to action to follow. The CTA with the most links weighs 60%.
 */
export function agentScore(site) {
  const journeys = site.journeys || [];
  const walks = (site.browser && site.browser.journeys) || [];
  const names = [...new Set([...journeys.map((j) => j.name), ...walks.map((w) => w.name)].map((n) => n.toLowerCase()))];
  if (!names.length) return null;
  const ctas = names.map((key) => {
    const j = journeys.find((x) => x.name.toLowerCase() === key);
    const ws = walks.filter((x) => x.name.toLowerCase() === key);
    const f = j ? FETCH[j.outcome] ?? 0 : null;
    const b = ws.length ? avg(ws.map(browserPoints)) : null;
    const score = f === null ? b : b === null ? f : 0.4 * f + 0.6 * b;
    return { name: (j || ws[0]).name, count: j ? j.count : 1, fetchOnly: f, browser: b === null ? null : Math.round(b), score };
  }).sort((a, b) => b.count - a.count);
  const weighted = (pick) => {
    const xs = ctas.filter((c) => pick(c) !== null);
    if (!xs.length) return null;
    if (xs.length === 1) return Math.round(pick(xs[0]));
    return Math.round(0.6 * pick(xs[0]) + 0.4 * avg(xs.slice(1).map(pick)));
  };
  return {
    score: weighted((c) => c.score),
    fetchOnly: weighted((c) => c.fetchOnly),
    browser: walks.length ? weighted((c) => c.browser) : null,
    ctas: ctas.map((c) => ({ ...c, score: Math.round(c.score) })),
  };
}
