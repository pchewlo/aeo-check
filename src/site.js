// Build the site model from a list of files: pages, components, scripts and site-level files.
import { parseMarkup } from './parse/markup.js';
import { parseFrontmatter } from './parse/markdown.js';
import { nextMetadata, headCalls, clientSignals } from './parse/js.js';
import { parseRobots, robotsFromNextRoute, parseSitemap, parseLlmsTxt } from './parse/sitefiles.js';
import { analyseMarkup, analyseMarkdown, words } from './analyse.js';

const UTILITY = /(^|\/)(404|500|_error|error|not-found|offline|login|log-in|signin|sign-in|signup|sign-up|register|logout|account|admin|dashboard|settings|profile|checkout|cart|basket|thank-?you|thanks|success|unsubscribe|reset|forgot|verify|confirm|preview|draft|drafts|api|auth|callback|search|private|internal|editor|styleguide|playground|test)(\/|$)/i;
const ARTICLE = /(^|\/)(blog|blogs|posts?|articles?|news|guides?|insights|stories|case-studies|resources|learn|journal|updates|explore|library|knowledge|kb|help|tutorials?)\/[^/]+/i;
const CONTENT_DIRS = /^(src\/content|content|docs|blog|posts|_posts|articles|guides|src\/pages|pages|src\/routes|app|src\/app|website\/docs|website\/blog|site)\//;
const SKIP_MD = /(^|\/)(README|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|LICENSE|HANDOFF|TODO|NOTES|AGENTS|CLAUDE|SKILL)(\.[a-z]+)?\.mdx?$/i;

export function detectFramework(files) {
  const pkg = files.find((f) => f.path === 'package.json');
  let deps = {};
  if (pkg) {
    try { const j = JSON.parse(pkg.content); deps = { ...j.dependencies, ...j.devDependencies }; } catch {}
  }
  const has = (re) => files.some((f) => re.test(f.path));
  const fw = [];
  if (deps.next || has(/^(src\/)?app\/(.*\/)?page\.(jsx?|tsx?|mdx?)$/) || has(/^(src\/)?pages\/_app\.(jsx?|tsx?)$/)) fw.push('next');
  if (deps.astro || has(/\.astro$/)) fw.push('astro');
  if (deps['@sveltejs/kit'] || has(/^src\/routes\/.*\+page\.svelte$/)) fw.push('sveltekit');
  if (deps.nuxt || has(/^nuxt\.config\./)) fw.push('nuxt');
  if (deps.gatsby) fw.push('gatsby');
  if (deps['@remix-run/react'] || deps['react-router'] && has(/^app\/routes\//)) fw.push('remix');
  if (!fw.length && (deps.vite || deps['react-scripts']) && (deps.react || deps.vue || deps.svelte || deps.preact || deps['solid-js'])) fw.push('spa');
  if (!fw.length) fw.push('static');
  return { name: fw[0], all: fw, deps };
}

function cleanRoute(segs) {
  const out = segs.filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  let r = '/' + out.join('/');
  r = r.replace(/\/index$/, '/').replace(/\/+/g, '/');
  if (r.length > 1 && r.endsWith('/')) r = r.slice(0, -1);
  return r || '/';
}

/** Decide whether a path is a routable page; return { route, kind, role } or null. */
export function classify(path, fw) {
  const p = path;
  const ext = (p.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  const fws = fw.all;
  let m;
  if (fws.includes('next')) {
    if ((m = /^(?:src\/)?app\/((?:.*\/)?)page\.(jsx?|tsx?|mdx?)$/.exec(p))) {
      const segs = m[1].split('/').filter(Boolean);
      if (segs.some((s) => s.startsWith('_'))) return null;
      return { route: cleanRoute(segs), kind: ext.startsWith('md') ? 'md' : 'jsx', role: 'page', router: 'app' };
    }
    if ((m = /^(?:src\/)?app\/((?:.*\/)?)layout\.(jsx?|tsx?)$/.exec(p))) return { route: cleanRoute(m[1].split('/')), kind: 'jsx', role: 'layout', router: 'app' };
    if ((m = /^(?:src\/)?pages\/(.*)\.(jsx?|tsx?|mdx?)$/.exec(p))) {
      if (/^_(app|document)$/.test(m[1])) return { route: '/', kind: 'jsx', role: 'layout', router: 'pages' };
      if (/^(api\/|_)/.test(m[1])) return null;
      return { route: cleanRoute(m[1].split('/')), kind: ext.startsWith('md') ? 'md' : 'jsx', role: 'page', router: 'pages' };
    }
  }
  if (fws.includes('astro')) {
    if ((m = /^src\/pages\/(.*)\.(astro|mdx?|html)$/.exec(p))) {
      if (m[1].split('/').some((s) => s.startsWith('_'))) return null;
      return { route: cleanRoute(m[1].split('/')), kind: ext === 'astro' ? 'astro' : ext === 'html' ? 'html' : 'md', role: 'page' };
    }
    if (/^src\/layouts\/.*\.astro$/.test(p)) return { route: '/', kind: 'astro', role: 'layout' };
    if ((m = /^src\/content\/(.*)\.(mdx?|markdown)$/.exec(p))) return { route: cleanRoute(m[1].split('/')), kind: 'md', role: 'page', collection: true };
  }
  if (fws.includes('sveltekit')) {
    if ((m = /^src\/routes\/((?:.*\/)?)\+page\.(svelte|md|svx)$/.exec(p))) return { route: cleanRoute(m[1].split('/')), kind: ext === 'svelte' ? 'svelte' : 'md', role: 'page' };
    if (/^src\/routes\/(.*\/)?\+layout\.svelte$/.test(p) || p === 'src/app.html') return { route: '/', kind: p.endsWith('.html') ? 'html' : 'svelte', role: 'layout' };
  }
  if (fws.includes('nuxt')) {
    if ((m = /^(?:app\/)?pages\/(.*)\.vue$/.exec(p))) return { route: cleanRoute(m[1].split('/')), kind: 'vue', role: 'page' };
    if (/^(app\/)?(app\.vue|layouts\/.*\.vue)$/.test(p) || /^nuxt\.config\./.test(p)) return { route: '/', kind: 'vue', role: 'layout' };
    if ((m = /^content\/(.*)\.mdx?$/.exec(p))) return { route: cleanRoute(m[1].replace(/(^|\/)\d+\./g, '$1').split('/')), kind: 'md', role: 'page' };
  }
  if (fws.includes('gatsby') && (m = /^src\/pages\/(.*)\.(jsx?|tsx?)$/.exec(p))) return { route: cleanRoute(m[1].split('/')), kind: 'jsx', role: 'page' };
  if (fws.includes('remix') && (m = /^app\/routes\/(.*)\.(jsx?|tsx?)$/.exec(p))) {
    if (m[1].startsWith('api') || m[1].startsWith('resources')) return null;
    return { route: cleanRoute(m[1].replace(/\._index$|^_index$/, '').split(/[./]/).filter((s) => !s.startsWith('_'))), kind: 'jsx', role: 'page' };
  }
  if (p === 'app/root.tsx' || p === 'app/root.jsx') return { route: '/', kind: 'jsx', role: 'layout' };
  if (ext === 'html' || ext === 'htm') {
    if (/^(src|app|components|lib|templates?|partials|_includes|_layouts|layouts)\//.test(p) && !fws.includes('static') && p !== 'src/app.html') return null;
    let r = p.replace(/^(public|static|dist|out|build|_site|site|www|docs)\//, '');
    r = r.replace(/\.html?$/, '');
    return { route: cleanRoute(r.split('/')), kind: 'html', role: 'page' };
  }
  if (ext === 'md' || ext === 'mdx' || ext === 'markdown' || ext === 'svx') {
    if (SKIP_MD.test(p)) return null;
    if (!CONTENT_DIRS.test(p) && !/^[^/]+\.mdx?$/.test(p)) return null;
    const r = p.replace(CONTENT_DIRS, (s) => (/(blog|posts|_posts|articles|guides)\/$/.test(s) ? s.replace(/^.*?(blog|posts|_posts|articles|guides)\/$/, '$1/').replace('_posts/', 'blog/') : ''))
      .replace(/\.(mdx?|markdown|svx)$/, '')
      .replace(/(^|\/)\d{4}-\d{2}-\d{2}-/, '$1');
    return { route: cleanRoute(r.split('/')), kind: 'md', role: 'page', contentFile: true };
  }
  return null;
}

const STRONG_CONTENT = /^(src\/content|content|_posts|blog|posts|articles|guides|src\/pages|pages|src\/routes|app|src\/app)\//;
const DOCS_GENERATOR = /^(mkdocs\.ya?ml|docusaurus\.config\.[jt]s|\.vitepress\/config\.[jt]s|_config\.ya?ml|hugo\.(toml|ya?ml)|config\.toml|\.eleventy\.js|eleventy\.config\.[cm]?js|book\.toml|astro\.config\.[cm]?[jt]s)$/;

/** Markdown is site content when it sits in a framework content folder, has frontmatter, or a docs generator builds it. */
function isSiteMarkdown(file, files) {
  if (STRONG_CONTENT.test(file.path)) return true;
  if (/^(---|\+\+\+)\r?\n[\s\S]*?\b(title|layout|permalink|slug|date)\s*[:=]/.test(file.content.slice(0, 2000))) return true;
  return files.some((f) => DOCS_GENERATOR.test(f.path));
}

const CODE_EXT = /\.(jsx|tsx|js|mjs|cjs|ts|mts|vue|svelte|astro)$/;

function parseFor(kind, path, content) {
  if (kind === 'html') return parseMarkup(content, { mode: 'html' });
  if (kind === 'vue') {
    const m = /^<template[^>]*>([\s\S]*)^<\/template>/m.exec(content);
    if (!m) return parseMarkup('', { mode: 'template' });
    const offset = content.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1;
    return parseMarkup(m[1], { mode: 'template', lineOffset: offset });
  }
  if (kind === 'svelte') return parseMarkup(content, { mode: 'template' });
  if (kind === 'astro') {
    const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(content);
    const offset = fm ? fm[0].split('\n').length - 1 : 0;
    return parseMarkup(fm ? content.slice(fm[0].length) : content, { mode: 'template', lineOffset: offset });
  }
  return parseMarkup(content, { mode: 'jsx' });
}

function kindForCode(path) {
  if (path.endsWith('.vue')) return 'vue';
  if (path.endsWith('.svelte')) return 'svelte';
  if (path.endsWith('.astro')) return 'astro';
  if (/\.(jsx|tsx)$/.test(path)) return 'jsx';
  return 'js';
}

const FM_DATE = ['date', 'pubDate', 'publishDate', 'published', 'datePublished', 'publishedAt', 'created'];
const FM_UPDATED = ['updated', 'lastmod', 'lastModified', 'modified', 'dateModified', 'updatedDate', 'updatedAt', 'lastUpdated', 'last_modified_at'];

function analyseFile(file, info) {
  const { path, content } = file;
  if (info.kind === 'md') {
    const fm = parseFrontmatter(content);
    const model = analyseMarkdown(fm.body, fm.bodyLine, { mdx: /\.mdx$/.test(path) });
    const d = fm.data;
    const head = model.head;
    if (d.title) head.title = { text: String(d.title), line: 1, via: 'frontmatter' };
    else {
      const h1 = model.headings.find((h) => h.level === 1);
      if (h1) head.title = { text: h1.text, line: h1.line, via: 'h1' };
    }
    const desc = d.description || d.summary || d.excerpt || d.subtitle;
    if (desc) head.description = { text: String(desc), line: 1, via: 'frontmatter' };
    if (d.canonical || d.canonicalURL || d.canonical_url) head.canonical = { href: String(d.canonical || d.canonicalURL || d.canonical_url), line: 1 };
    const pub = FM_DATE.find((k) => d[k]);
    const upd = FM_UPDATED.find((k) => d[k]);
    if (pub) head.published = { value: String(d[pub]), line: 1, via: 'frontmatter' };
    if (upd) head.modified = { value: String(d[upd]), line: 1, via: 'frontmatter' };
    if (d.author || d.authors) head.author = { text: JSON.stringify(d.author || d.authors), line: 1, via: 'frontmatter' };
    if (d.noindex === true || d.robots && /noindex/.test(String(d.robots))) head.robots = { noindex: true, nosnippet: false, content: 'frontmatter', line: 1 };
    if (d.draft === true) model.draft = true;
    if (d.lang) head.lang = { value: d.lang, line: 1 };
    model.frontmatter = d;
    model.signals = clientSignals('');
    return model;
  }
  const doc = parseFor(info.kind, path, content);
  const model = analyseMarkup(doc);
  model.frontmatter = {};
  const signals = clientSignals(content);
  model.signals = signals;

  if (info.kind !== 'html') {
    const meta = nextMetadata(content);
    if (meta) {
      model.nextMeta = meta;
      for (const k of ['title', 'description', 'canonical', 'robots', 'og', 'author']) if (meta[k] && !model.head[k]) model.head[k] = meta[k];
      if (meta.titleTemplate) model.head.titleTemplate = meta.titleTemplate;
      if (meta.titleDefault) model.head.titleDefault = meta.titleDefault;
      if (meta.metadataBase) model.head.metadataBase = meta.metadataBase;
    }
    const hc = headCalls(content);
    if (hc) for (const k of Object.keys(hc)) if (!model.head[k]) model.head[k] = hc[k];
    // JSON-LD built in JS: record @type values seen in source
    if (model.jsonLd.some((j) => j.dynamic) || /['"]@type['"]\s*:/.test(content)) {
      const types = [...content.matchAll(/['"]@type['"]\s*:\s*['"]([A-Za-z]+)['"]/g)].map((x) => x[1]);
      const keys = [...content.matchAll(/['"]?(datePublished|dateModified|author|headline|mainEntity|acceptedAnswer|itemListElement|offers|aggregateRating|review|step|name|url|logo|image)['"]?\s*:/g)].map((x) => x[1]);
      if (types.length && !model.jsonLd.some((j) => !j.dynamic)) {
        if (!model.jsonLd.length) model.jsonLd.push({ line: 1, dynamic: true, raw: '' });
      }
      for (const j of model.jsonLd) if (j.dynamic) { j.types = types; j.keys = keys; }
    }
    if (/<(ArticleJsonLd|FAQPageJsonLd|BreadcrumbJsonLd|OrganizationJsonLd|ProductJsonLd|LocalBusinessJsonLd|HowToJsonLd|SoftwareAppJsonLd)\b/.test(content)) {
      const types = [...content.matchAll(/<(Article|FAQPage|Breadcrumb|Organization|Product|LocalBusiness|HowTo|SoftwareApp)JsonLd\b/g)].map((x) => (x[1] === 'Breadcrumb' ? 'BreadcrumbList' : x[1] === 'SoftwareApp' ? 'SoftwareApplication' : x[1]));
      model.jsonLd.push({ line: 1, dynamic: true, raw: '', types, keys: [] });
    }
  }
  return model;
}

function mergeHead(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) if (v !== undefined && v !== null) out[k] = v;
  return out;
}

export function isInternalHref(href, baseUrl) {
  if (!href || typeof href !== 'string') return false;
  if (/^(mailto|tel|sms|javascript|data|blob):/i.test(href)) return false;
  if (href.startsWith('#')) return false;
  if (href.startsWith('//')) return baseUrl ? href.replace(/^\/\//, '').startsWith(new URL(baseUrl).host) : false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    if (!baseUrl) return false;
    try { return new URL(href).host === new URL(baseUrl).host; } catch { return false; }
  }
  return true;
}

export function normalisePath(href, fromRoute = '/', baseUrl) {
  try {
    const base = new URL(fromRoute.endsWith('/') ? fromRoute : fromRoute + '/', baseUrl || 'http://site.invalid');
    const u = new URL(href, href.startsWith('/') || /^[a-z]+:/i.test(href) ? base : new URL(fromRoute, base));
    let p = u.pathname.replace(/\/index(\.html?)?$/, '/').replace(/\.html?$/, '');
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return decodeURI(p) || '/';
  } catch {
    return null;
  }
}

function baseUrlFrom(site, config) {
  if (config.siteUrl) return config.siteUrl;
  for (const p of site.allPages) if (p.head.metadataBase) return p.head.metadataBase;
  if (site.sitemap && site.sitemap.urls && site.sitemap.urls[0]?.loc) { try { return new URL(site.sitemap.urls[0].loc).origin; } catch {} }
  if (site.robots && site.robots.parsed.sitemaps[0]) { try { return new URL(site.robots.parsed.sitemaps[0].url).origin; } catch {} }
  for (const p of site.allPages) {
    const c = p.head.canonical && p.head.canonical.href;
    if (c && /^https?:/.test(c)) { try { return new URL(c).origin; } catch {} }
  }
  const pkg = site.files.find((f) => f.path === 'package.json');
  if (pkg) { try { const h = JSON.parse(pkg.content).homepage; if (h && /^https?:/.test(h)) return new URL(h).origin; } catch {} }
  return null;
}

function headerNoindex(files) {
  const out = [];
  for (const f of files) {
    if (!/(^|\/)(vercel\.json|netlify\.toml|_headers|firebase\.json)$|(^|\/)next\.config\.(js|mjs|ts|cjs)$/.test(f.path)) continue;
    const lines = f.content.split(/\r?\n/);
    lines.forEach((l, i) => {
      if (/x-robots-tag/i.test(l)) {
        const win = lines.slice(i, i + 3).join(' ');
        if (/noindex|\bnone\b/i.test(win)) out.push({ path: f.path, line: i + 1, value: win.trim().slice(0, 120), nosnippet: /nosnippet/i.test(win) });
        else if (/nosnippet/i.test(win)) out.push({ path: f.path, line: i + 1, value: win.trim().slice(0, 120), nosnippet: true, onlySnippet: true });
      }
    });
  }
  return out;
}

/**
 * Build the site model.
 * files: [{ path, content }]
 */
export function buildSite(files, config = {}) {
  const fw = detectFramework(files);
  const site = { mode: 'repo', framework: fw, files, pages: [], allPages: [], components: [], layouts: [], scripts: [], robots: null, sitemap: null, llms: null, headers: [], generated: {} };

  for (const f of files) {
    const p = f.path;
    if (/(^|\/)robots\.txt$/i.test(p) && /^(public\/|static\/|dist\/|out\/|_site\/)?robots\.txt$/i.test(p)) {
      if (!site.robots) site.robots = { path: p, content: f.content, parsed: parseRobots(f.content) };
      continue;
    }
    if (/^(src\/)?app\/robots\.(ts|js|mjs)$/.test(p) || /^src\/pages\/robots\.txt\.(ts|js)$/.test(p) || /^src\/routes\/robots\.txt\/\+server\.(ts|js)$/.test(p)) {
      const text = /app\/robots/.test(p) ? robotsFromNextRoute(f.content) : (/(['"`])(User-agent[\s\S]*?)\1/i.exec(f.content) || [])[2] || '';
      site.robots = { path: p, content: text, parsed: parseRobots(text), generated: true };
      continue;
    }
    if (/^(public\/|static\/|dist\/|out\/|_site\/)?sitemap[^/]*\.xml$/i.test(p)) {
      if (!site.sitemap || /sitemap(-index|_index)?\.xml$/.test(p)) site.sitemap = { path: p, content: f.content, ...parseSitemap(f.content) };
      continue;
    }
    if (/^(src\/)?app\/sitemap\.(ts|js|mjs|xml)$/.test(p) || /^next-sitemap\.config\.(js|cjs|mjs)$/.test(p) || /^src\/pages\/sitemap[^/]*\.xml\.(ts|js)$/.test(p) || /^src\/routes\/sitemap\.xml\/\+server\.(ts|js)$/.test(p)) {
      site.sitemap = site.sitemap || { path: p, content: f.content, generated: true, urls: null, hasLastmod: /lastModified|lastmod|autoLastmod/.test(f.content) };
      continue;
    }
    if (/^(public\/|static\/|dist\/|out\/|_site\/)?llms\.txt$/i.test(p)) { site.llms = { path: p, content: f.content, parsed: parseLlmsTxt(f.content) }; continue; }
    if (/^(src\/)?app\/llms(\.txt|-full\.txt)?\/route\.(ts|js)$/.test(p) || /^src\/pages\/llms\.txt\.(ts|js)$/.test(p) || /^src\/routes\/llms\.txt\/\+server\.(ts|js)$/.test(p)) {
      site.llms = site.llms || { path: p, content: f.content, generated: true };
      continue;
    }
  }
  // sitemap generators declared as dependencies
  const deps = fw.deps || {};
  if (!site.sitemap) {
    const gen = ['@astrojs/sitemap', 'next-sitemap', '@nuxtjs/sitemap', 'gatsby-plugin-sitemap', 'svelte-sitemap', 'vite-plugin-sitemap', '@docusaurus/plugin-sitemap', '@docusaurus/preset-classic', 'vitepress'].find((d) => deps[d]);
    if (gen) site.sitemap = { path: 'package.json', generated: true, generator: gen, urls: null, hasLastmod: null };
  }
  site.headers = headerNoindex(files);

  const layoutsByDir = new Map();
  for (const f of files) {
    const info = classify(f.path, fw);
    if (info && info.contentFile && !isSiteMarkdown(f, files)) continue;
    if (info) {
      let model;
      try { model = analyseFile(f, info); } catch (e) { model = null; site.parseErrors = (site.parseErrors || []).concat({ path: f.path, error: e.message }); }
      if (!model) continue;
      const page = { file: f.path, source: f.content, ...info, ...model };
      if (info.role === 'layout') {
        site.layouts.push(page);
        const dir = f.path.replace(/\/[^/]+$/, '');
        layoutsByDir.set(dir, page);
      } else site.allPages.push(page);
      continue;
    }
    if (CODE_EXT.test(f.path)) {
      const kind = kindForCode(f.path);
      if (kind === 'js') {
        site.scripts.push({ file: f.path, source: f.content, signals: clientSignals(f.content) });
        // JS files may still hold JSX (React in .js)
        if (!/<[A-Z][A-Za-z]*[\s/>]|return\s*\(\s*</.test(f.content)) continue;
      }
      try {
        const model = analyseFile(f, { kind: kind === 'js' ? 'jsx' : kind });
        site.components.push({ file: f.path, source: f.content, kind, role: 'component', ...model });
      } catch (e) {
        site.parseErrors = (site.parseErrors || []).concat({ path: f.path, error: e.message });
      }
    }
  }

  // Next.js app router: merge layout metadata down into pages
  for (const page of site.allPages) {
    page.layoutChain = [];
    if (page.router === 'app') {
      const dir = page.file.replace(/\/[^/]+$/, '');
      const parts = dir.split('/');
      const chain = [];
      for (let i = 1; i <= parts.length; i++) {
        const d = parts.slice(0, i).join('/');
        if (layoutsByDir.has(d)) chain.push(layoutsByDir.get(d));
      }
      page.layoutChain = chain;
      let head = {};
      let template = null;
      for (const l of chain) {
        const lh = { ...l.head };
        if (lh.title) lh.title = { ...lh.title, inherited: true, from: l.file, line: 1 };
        if (lh.description) lh.description = { ...lh.description, inherited: true, from: l.file, line: 1 };
        if (lh.canonical) lh.canonical = { ...lh.canonical, inherited: true, from: l.file };
        if (lh.robots) lh.robots = { ...lh.robots, from: l.file };
        head = mergeHead(head, lh);
        if (l.head.titleTemplate) template = l.head.titleTemplate;
        page.jsonLd = [...page.jsonLd, ...l.jsonLd.map((j) => ({ ...j, from: l.file }))];
      }
      const own = page.head;
      if (own.title && own.title.text && template && !own.title.via) own.title = { ...own.title, text: template.replace('%s', own.title.text) };
      page.head = mergeHead(head, own);
    } else {
      // other frameworks: lang and site-wide JSON-LD come from layouts/shells
      const shells = site.layouts;
      if (!page.head.lang) {
        const withLang = shells.find((l) => l.head.lang);
        if (withLang) page.head.lang = { ...withLang.head.lang, from: withLang.file };
      }
      if (page.router === 'pages') {
        const app = shells.find((l) => /pages\/_app\./.test(l.file));
        if (app) {
          for (const k of ['title', 'description', 'og', 'canonical']) if (!page.head[k] && app.head[k]) page.head[k] = { ...app.head[k], inherited: true, from: app.file };
          page.jsonLd = [...page.jsonLd, ...app.jsonLd.map((j) => ({ ...j, from: app.file }))];
        }
      }
      if (page.kind !== 'html') {
        for (const l of shells) {
          if (l.kind === 'html' || l.role === 'layout') {
            page.jsonLd = [...page.jsonLd, ...l.jsonLd.filter((j) => !page.jsonLd.includes(j)).map((j) => ({ ...j, from: l.file }))];
            if (!page.head.og && l.head.og) page.head.og = { ...l.head.og, from: l.file };
          }
        }
      }
    }
    if (page.router === 'app') {
      const root = page.layoutChain[0];
      if (root && root.head.lang) page.head.lang = { ...root.head.lang, from: root.file };
    }
    finalisePage(page);
  }
  site.pages = site.allPages;
  site.baseUrl = baseUrlFrom(site, config);
  site.root = config.root || '.';
  return site;
}

/** Flags every rule relies on: indexability context, article/home detection, data-driven content. */
export function finalisePage(page) {
  page.headConfidence = page.kind === 'html' || page.kind === 'url' ? 'full' : page.router === 'app' ? 'resolved' : 'partial';
  page.isDynamicRoute = /\[|\]|\/:|\$/.test(page.file.replace(/\.[a-z]+$/, '')) || /\[/.test(page.route);
  page.isUtility = UTILITY.test(page.route) || page.draft === true;
  page.isHome = page.route === '/';
  page.isRedirect = !!(page.metaRefresh && /url\s*=/i.test(page.metaRefresh.content || '') && page.wordCount < 80);
  const ogType = page.head.og && typeof page.head.og.type === 'string' ? page.head.og.type : '';
  const ldTypes = jsonLdTypes(page);
  page.isArticle = !page.isHome && (ARTICLE.test(page.route) || ogType === 'article' || ldTypes.some((t) => /Article|BlogPosting|NewsArticle/.test(t)) || !!(page.head.published && page.kind === 'md'));
  page.dataDriven = page.isDynamicRoute || (page.signals && page.signals.serverData) || (page.exprCount > 3 && page.staticWordCount < 80);
  return page;
}

/** All schema.org @type values on a page (static and dynamic JSON-LD). */
export function jsonLdTypes(page) {
  const types = [];
  const visit = (d) => {
    if (!d || typeof d !== 'object') return;
    if (Array.isArray(d)) { d.forEach(visit); return; }
    const t = d['@type'];
    if (t) (Array.isArray(t) ? t : [t]).forEach((x) => types.push(String(x)));
    if (d['@graph']) visit(d['@graph']);
    for (const v of Object.values(d)) if (v && typeof v === 'object') visit(v);
  };
  for (const j of page.jsonLd || []) {
    if (j.data) visit(j.data);
    if (j.types) types.push(...j.types);
  }
  return types;
}

export { words };
