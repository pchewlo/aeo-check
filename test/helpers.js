import { buildSite } from '../src/site.js';
import { runRules } from '../src/engine.js';

/** Build a site from { path: content } and return findings for one rule. */
export function findings(ruleId, files, config = {}) {
  const list = Object.entries(files).map(([path, content]) => ({ path, content }));
  const site = buildSite(list, config);
  return runRules(site, { ...config, only: [ruleId] });
}

export function siteOf(files, config = {}) {
  return buildSite(Object.entries(files).map(([path, content]) => ({ path, content })), config);
}

/** A complete, well-formed HTML page; override parts with opts. */
export function html({
  lang = 'en-GB', title = 'Acme analytics pricing: plans, limits and costs', description = 'What each Acme analytics plan costs, what it includes and which teams it suits, updated for 2026.',
  canonical = 'https://acme.test/pricing', head = '', body = null, jsonLd = null, og = true,
} = {}) {
  const ld = jsonLd === null ? { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme', url: 'https://acme.test' } : jsonLd;
  return `<!doctype html>
<html${lang === null ? '' : ` lang="${lang}"`}>
<head>
<meta charset="utf-8">
${title === null ? '' : `<title>${title}</title>`}
${description === null ? '' : `<meta name="description" content="${description}">`}
${canonical === null ? '' : `<link rel="canonical" href="${canonical}">`}
${og ? '<meta property="og:title" content="Acme"><meta property="og:description" content="Acme analytics"><meta property="og:image" content="https://acme.test/og.png"><meta property="og:url" content="https://acme.test/">' : ''}
${ld ? `<script type="application/ld+json">${typeof ld === 'string' ? ld : JSON.stringify(ld)}</script>` : ''}
${head}
</head>
<body>
<main>
${body === null ? defaultBody() : body}
</main>
</body>
</html>`;
}

export function para(n, start = 'Acme analytics') {
  const words = [];
  for (let i = 0; words.length < n; i++) words.push(['tracks', 'retention', 'for', 'product', 'teams', 'with', 'cohort', 'charts', 'and', 'clear', 'reports'][i % 11]);
  return `${start} ${words.slice(0, Math.max(0, n - start.split(' ').length)).join(' ')}.`;
}

function defaultBody() {
  return `<h1>Acme analytics pricing</h1>
<p>${para(60, 'Acme analytics costs £20 per seat per month')}</p>
<h2>What does the Team plan include?</h2>
<p>${para(60, 'The Team plan includes ten seats')} See <a href="/features">all features</a>.</p>
<h2>Which plan suits a startup?</h2>
<p>${para(60, 'Startups under twenty people usually pick the Team plan')}</p>`;
}
