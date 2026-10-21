// robots.txt, sitemap.xml and llms.txt readers.

/** Parse robots.txt into groups: [{ agents:[{name,line}], rules:[{type:'allow'|'disallow', path, line}] }], sitemaps */
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const line = rawLine.replace(/#.*$/, '').trim();
    const ln = idx + 1;
    if (!line) return;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) return;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [], line: ln }; groups.push(current); }
      current.agents.push({ name: value, line: ln });
      lastWasAgent = true;
      return;
    }
    lastWasAgent = false;
    if (key === 'sitemap') { sitemaps.push({ url: value, line: ln }); return; }
    if ((key === 'allow' || key === 'disallow') && current) current.rules.push({ type: key, path: value, line: ln });
  });
  return { groups, sitemaps };
}

/** Select the group that applies to a crawler token (RFC 9309: most specific match, else '*'). */
export function groupFor(robots, token) {
  const t = token.toLowerCase();
  const matching = robots.groups.filter((g) => g.agents.some((a) => a.name.toLowerCase() === t));
  if (matching.length) return { rules: matching.flatMap((g) => g.rules), agentLine: matching[0].agents.find((a) => a.name.toLowerCase() === t).line, specific: true };
  const star = robots.groups.filter((g) => g.agents.some((a) => a.name === '*'));
  if (star.length) return { rules: star.flatMap((g) => g.rules), agentLine: star[0].line, specific: false };
  return { rules: [], agentLine: null, specific: false };
}

function patternToRegex(p) {
  let s = '';
  for (const c of p) {
    if (c === '*') s += '.*';
    else if (c === '$') s += '$';
    else s += c.replace(/[.+?^{}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + s);
}

/** Is path allowed for these rules? Longest match wins; allow wins ties. Returns { allowed, rule } */
export function isAllowed(rules, path) {
  let best = null;
  for (const r of rules) {
    if (r.type === 'disallow' && r.path === '') continue;
    if (!patternToRegex(r.path).test(path)) continue;
    const len = r.path.replace(/[*$]/g, '').length;
    if (!best || len > best.len || (len === best.len && r.type === 'allow')) best = { len, rule: r };
  }
  if (!best) return { allowed: true, rule: null };
  return { allowed: best.rule.type === 'allow', rule: best.rule };
}

/**
 * Read a Next.js app/robots.(ts|js) metadata route. Returns robots text in standard form, best effort.
 */
export function robotsFromNextRoute(src) {
  const out = [];
  const objRe = /\{[^{}]*userAgent\s*:[^{}]*\}/g;
  let m;
  while ((m = objRe.exec(src))) {
    const obj = m[0];
    const agents = listValues(obj, 'userAgent');
    const allow = listValues(obj, 'allow');
    const disallow = listValues(obj, 'disallow');
    if (!agents.length) continue;
    for (const a of agents) out.push(`User-agent: ${a}`);
    for (const a of allow) out.push(`Allow: ${a}`);
    for (const d of disallow) out.push(`Disallow: ${d}`);
    out.push('');
  }
  const sm = /sitemap\s*:\s*(['"`])([^'"`]+)\1/.exec(src);
  if (sm) out.push(`Sitemap: ${sm[2]}`);
  return out.join('\n');
}

function listValues(obj, key) {
  const re = new RegExp(`${key}\\s*:\\s*(\\[[^\\]]*\\]|(['"\`])[^'"\`]*\\2)`);
  const m = re.exec(obj);
  if (!m) return [];
  const v = m[1];
  return [...v.matchAll(/(['"`])([^'"`]*)\1/g)].map((x) => x[2]);
}

/** Parse sitemap XML. Returns { urls:[{loc,lastmod,line}], isIndex, sitemaps:[] } */
export function parseSitemap(xml) {
  const lineAt = (idx) => xml.slice(0, idx).split('\n').length;
  const urls = [];
  const sitemaps = [];
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const re = /<(url|sitemap)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const loc = (/<loc>\s*([\s\S]*?)\s*<\/loc>/i.exec(m[2]) || [])[1];
    const lastmod = (/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i.exec(m[2]) || [])[1];
    const entry = { loc: loc && loc.replace(/<!\[CDATA\[|\]\]>/g, '').trim(), lastmod: lastmod || null, line: lineAt(m.index) };
    if (m[1].toLowerCase() === 'sitemap') sitemaps.push(entry); else urls.push(entry);
  }
  return { urls, isIndex, sitemaps };
}

/**
 * Validate llms.txt against llmstxt.org.
 * Returns { h1, summary, sections:[{title,line,links}], problems:[{message,line,severity}] }
 */
export function parseLlmsTxt(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const problems = [];
  let h1 = null;
  let summary = null;
  const sections = [];
  let current = null;
  let firstContent = null;
  lines.forEach((line, idx) => {
    const ln = idx + 1;
    const t = line.trim();
    if (!t) return;
    if (firstContent === null) firstContent = { t, ln };
    if (/^#\s+\S/.test(t)) {
      if (h1) problems.push({ message: 'More than one H1. The spec allows a single H1 with the site or project name.', line: ln, severity: 'warn' });
      else h1 = { text: t.slice(2).trim(), line: ln };
      return;
    }
    if (/^>\s?/.test(t) && !sections.length && !summary) { summary = { text: t.replace(/^>\s?/, ''), line: ln }; return; }
    if (/^##\s+\S/.test(t)) { current = { title: t.slice(3).trim(), line: ln, links: [], items: 0 }; sections.push(current); return; }
    if (/^#{3,}\s/.test(t) && !current) {
      problems.push({ message: 'Headings other than H1 and H2 are not part of the format before the first H2 section.', line: ln, severity: 'info' });
      return;
    }
    if (current && /^[-*+]\s+/.test(t)) {
      current.items++;
      const lm = /^[-*+]\s+\[([^\]]+)\]\(([^)\s]+)\)(?:\s*:\s*(.*))?\s*$/.exec(t);
      if (lm) current.links.push({ name: lm[1], url: lm[2], notes: lm[3] || '', line: ln });
      else problems.push({ message: `List item in "${current.title}" is not a markdown link. Each entry should be "- [name](url): optional notes".`, line: ln, severity: 'error' });
    }
  });
  if (!h1) problems.push({ message: 'No H1. The H1 with the site or project name is the only required part of llms.txt.', line: firstContent ? firstContent.ln : 1, severity: 'error' });
  else if (firstContent && firstContent.ln !== h1.line) problems.push({ message: 'The H1 should be the first line of the file.', line: firstContent.ln, severity: 'warn' });
  if (h1 && !summary) problems.push({ message: 'No blockquote summary after the H1. Add "> one or two sentences on what the site is and who it is for".', line: h1.line, severity: 'warn' });
  if (!sections.length) problems.push({ message: 'No H2 sections with links. Add sections such as "## Docs" listing your key pages as "- [name](url): notes".', line: h1 ? h1.line : 1, severity: 'warn' });
  for (const s of sections) if (!s.items) problems.push({ message: `Section "${s.title}" has no links.`, line: s.line, severity: 'warn' });
  return { h1, summary, sections, problems };
}
