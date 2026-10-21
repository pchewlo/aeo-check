// Check a live site: fetch rendered HTML as a crawler would (no JavaScript), plus robots.txt,
// sitemap.xml and llms.txt, and probe whether AI user agents are let through.
import { parseMarkup } from './parse/markup.js';
import { clientSignals } from './parse/js.js';
import { parseRobots, parseSitemap, parseLlmsTxt } from './parse/sitefiles.js';
import { analyseMarkup } from './analyse.js';
import { finalisePage, isInternalHref } from './site.js';
import { CTA_TEXT, COMMERCE_ROUTE } from './rules/_util.js';

export const VERSION_UA = 'Mozilla/5.0 (compatible; aeo-check/0.1; +https://github.com/pchewlo/aeo-check)';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
export const PROBES = [
  { token: 'OAI-SearchBot', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot' },
  { token: 'ChatGPT-User', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot' },
  { token: 'Claude-SearchBot', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)' },
  { token: 'Claude-User', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)' },
  { token: 'PerplexityBot', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)' },
  { token: 'GPTBot', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)' },
  { token: 'ClaudeBot', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)' },
];

async function get(url, { ua = VERSION_UA, timeout = 15000, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml,text/plain,application/xml;q=0.9,*/*;q=0.8' }, redirect: 'follow', signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, text, headers: res.headers, url: res.url || url, redirected: res.redirected };
  } catch (e) {
    return { status: 0, text: '', headers: new Headers(), url, error: e.message };
  } finally {
    clearTimeout(t);
  }
}

const isChallenge = (r) => (r.status === 403 || r.status === 503 || r.status === 429) && /cf-chl|challenge-platform|just a moment|captcha|access denied|attention required/i.test(r.text.slice(0, 5000));

export function pageFromHtml(html, url, headers) {
  const doc = parseMarkup(html, { mode: 'html' });
  const model = analyseMarkup(doc);
  const u = new URL(url);
  const page = {
    file: url, source: html, kind: 'url', role: 'page', route: decodeURI(u.pathname.replace(/\/$/, '') || '/'),
    ...model, frontmatter: {},
    signals: clientSignals(html),
    layoutChain: [],
  };
  const xr = headers && headers.get && headers.get('x-robots-tag');
  if (xr && /noindex|\bnone\b|nosnippet/i.test(xr)) {
    page.head.robots = { noindex: /noindex|\bnone\b/i.test(xr) || (page.head.robots && page.head.robots.noindex), nosnippet: /nosnippet/i.test(xr), content: `X-Robots-Tag: ${xr}`, line: 0 };
  }
  return finalisePage(page);
}

/** Build a site model from a live URL. */
export async function buildUrlSite(start, { maxPages = 1, probe = true, fetchImpl = fetch, log = () => {} } = {}) {
  const origin = new URL(start).origin;
  const site = { mode: 'url', origin, baseUrl: origin, framework: { name: 'live', all: ['live'], deps: {} }, files: [], pages: [], allPages: [], components: [], layouts: [], scripts: [], robots: null, sitemap: null, llms: null, headers: [] };

  const [robots, llms] = await Promise.all([get(origin + '/robots.txt', { fetchImpl }), get(origin + '/llms.txt', { fetchImpl })]);
  site.robotsStatus = robots.status;
  if (robots.status === 200 && !/^\s*</.test(robots.text)) site.robots = { path: origin + '/robots.txt', content: robots.text, parsed: parseRobots(robots.text) };
  if (llms.status === 200 && llms.text.trim()) {
    site.llmsContentType = (llms.headers.get('content-type') || '').split(';')[0];
    if (!/^\s*<(!doctype|html)/i.test(llms.text)) site.llms = { path: origin + '/llms.txt', content: llms.text, parsed: parseLlmsTxt(llms.text) };
  }
  const smUrls = site.robots ? site.robots.parsed.sitemaps.map((s) => s.url) : [];
  if (!smUrls.length) smUrls.push(origin + '/sitemap.xml');
  for (const u of smUrls.slice(0, 2)) {
    const r = await get(u, { fetchImpl });
    if (r.status === 200 && /<(urlset|sitemapindex)[\s>]/i.test(r.text)) {
      const parsed = parseSitemap(r.text);
      if (parsed.isIndex && parsed.sitemaps[0]) {
        const child = await get(parsed.sitemaps[0].loc, { fetchImpl });
        const cp = child.status === 200 ? parseSitemap(child.text) : { urls: [] };
        site.sitemap = { path: parsed.sitemaps[0].loc, content: child.text, ...cp };
      } else site.sitemap = { path: u, content: r.text, ...parsed };
      break;
    }
  }

  const queue = [start];
  const seen = new Set();
  // https://a.test and https://a.test/ are one page; so is a URL and where it redirects to
  const norm = (u) => { try { const x = new URL(u); x.hash = ''; return x.href; } catch { return u.split('#')[0]; } };
  if (maxPages > 1 && site.sitemap && site.sitemap.urls) for (const s of site.sitemap.urls) if (s.loc) queue.push(s.loc);
  while (queue.length && site.pages.length < maxPages) {
    const url = norm(queue.shift());
    if (seen.has(url)) continue;
    seen.add(url);
    log(`fetch ${url}`);
    const r = await get(url, { fetchImpl });
    if (r.status !== 200 || !/<html|<body|<!doctype/i.test(r.text.slice(0, 2000))) {
      if (site.pages.length === 0) site.fetchError = { url, status: r.status, error: r.error };
      continue;
    }
    if (r.url && norm(r.url) !== url) {
      if (seen.has(norm(r.url))) continue;
      seen.add(norm(r.url));
    }
    const page = pageFromHtml(r.text, r.url || url, r.headers);
    site.pages.push(page);
    for (const l of page.links) {
      if (typeof l.href !== 'string' || !isInternalHref(l.href, origin)) continue;
      try {
        const abs = new URL(l.href, r.url || url);
        if (abs.origin === origin) queue.push(abs.href.split('#')[0]);
      } catch {}
    }
  }
  site.allPages = site.pages;

  if (probe && site.pages.length) {
    const target = site.pages[0].file;
    const results = await Promise.all([{ token: 'browser', ua: BROWSER_UA }, ...PROBES].map(async (p) => {
      const r = await get(target, { ua: p.ua, fetchImpl });
      return { token: p.token, status: r.status, challenge: isChallenge(r) };
    }));
    site.probes = results;

    // booking and checkout links (often a third-party engine): can agents acting for a user open them?
    const targets = [];
    for (const page of site.pages) {
      for (const c of page.controls || []) {
        if (!c.href || !/^(https?:|\/)/.test(c.href)) continue;
        const named = c.name && c.name.name && CTA_TEXT.test(c.name.name.trim());
        let abs;
        try { abs = new URL(c.href, page.file); } catch { continue; }
        if (!named && !COMMERCE_ROUTE.test(abs.pathname)) continue;
        if (!targets.includes(abs.href)) targets.push(abs.href);
      }
    }
    site.commerceProbes = [];
    for (const url of targets.slice(0, 3)) {
      const agents = PROBES.filter((p) => /-User$/.test(p.token)).concat([{ token: 'Perplexity-User', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)' }]);
      const [browser, ...rest] = await Promise.all([{ token: 'browser', ua: BROWSER_UA }, ...agents].map(async (p) => {
        const r = await get(url, { ua: p.ua, fetchImpl });
        return { token: p.token, status: r.status, challenge: isChallenge(r) };
      }));
      if (browser.status >= 400 || browser.status === 0) continue;
      site.commerceProbes.push({ url, browser: browser.status, blocked: rest.filter((r) => r.status >= 400 || r.challenge) });
    }
  }
  return site;
}
