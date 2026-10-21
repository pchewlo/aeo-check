// Turn a parsed document (markup tree or markdown) into the page model the rules read.
import { attr, hasAttr, textOf, rawText, walk, ancestors, hasDynamicChildren, BLOCKISH } from './parse/markup.js';
import { parseMarkdown, stripInline } from './parse/markdown.js';

export const words = (s) => (s || '').split(/\s+/).filter((w) => /[A-Za-z0-9À-ɏЀ-ӿ一-鿿]/.test(w));
export const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

const IMAGE_COMPONENTS = new Set(['Image', 'Img', 'NextImage', 'GatsbyImage', 'StaticImage', 'Picture', 'NuxtImg', 'NuxtPicture', 'enhanced:img']);
const LINK_COMPONENTS = new Set(['Link', 'NextLink', 'NuxtLink', 'RouterLink', 'router-link', 'nuxt-link', 'NavLink', 'A']);
const CHROME = new Set(['nav', 'header', 'footer', 'aside']);
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'label']);
const ROOT_IDS = new Set(['root', 'app', '__next', '__nuxt', 'svelte', 'main', 'application', 'react-root', 'mount']);
const NAV_CODE = /location\.(hash|href|assign|replace)|\brouter\.(push|replace)\(|\bnavigate\s*\(|\bhistory\.pushState|\bwindow\.open\s*\(|\bgoto\s*\(|\bgoTo\s*\(|\$router\.push/;

const emptyModel = () => ({
  head: {}, blocks: [], headings: [], images: [], links: [], clickNav: [], tables: [], lists: 0,
  jsonLd: [], times: [], text: '', mainText: '', wordCount: 0, staticWordCount: 0, scripts: [], emptyRoots: [],
  nosnippetEls: [], seoProps: [], hasMain: false, exprCount: 0, metaRefresh: null, bylineHints: [],
});

function headFromElements(doc, model) {
  const head = model.head;
  for (const el of doc.elements) {
    const inSvg = ancestors(el).some((a) => a.tag === 'svg');
    if (inSvg) continue;
    if (el.tag === 'html' && hasAttr(el, 'lang')) head.lang = { value: attr(el, 'lang'), line: el.line, dynamic: el.attrs.lang.dynamic };
    else if (el.name === 'Html' && hasAttr(el, 'lang')) head.lang = { value: attr(el, 'lang'), line: el.line };
    if (el.tag === 'title' && !head.title) {
      const t = clean(el.component ? textOf(el) : rawText(el) || textOf(el));
      const dyn = hasDynamicChildren(el) && !t;
      head.title = dyn ? { dynamic: true, line: el.line } : { text: t, line: el.line };
    }
    if (el.tag === 'meta') {
      const name = (attr(el, 'name') || attr(el, 'property') || '').toLowerCase();
      const content = attr(el, 'content');
      const dyn = el.attrs.content && el.attrs.content.dynamic;
      const equiv = (attr(el, 'http-equiv') || '').toLowerCase();
      if (equiv === 'refresh') model.metaRefresh = { content: content || '', line: el.line };
      if (name === 'description') head.description = dyn ? { dynamic: true, line: el.line } : { text: clean(content || ''), line: el.line };
      if (name === 'robots' || name === 'googlebot') {
        const v = (content || '').toLowerCase();
        head.robots = head.robots || { noindex: false, nosnippet: false };
        head.robots = {
          noindex: head.robots.noindex || /noindex|\bnone\b/.test(v),
          nosnippet: head.robots.nosnippet || /nosnippet|max-snippet\s*:\s*0\b/.test(v),
          content: content, line: el.line, source: 'meta',
        };
      }
      if (name === 'author') head.author = { text: content, line: el.line };
      if (name.startsWith('og:')) {
        head.og = head.og || {};
        const k = name.slice(3);
        if (k === 'title') head.og.title = true;
        if (k === 'description') head.og.description = true;
        if (k === 'image' || k === 'image:url') head.og.image = true;
        if (k === 'url') head.og.url = true;
        if (k === 'type') head.og.type = content;
        head.og.line = head.og.line || el.line;
      }
      if (name === 'article:published_time') head.published = { value: content, line: el.line };
      if (name === 'article:modified_time') head.modified = { value: content, line: el.line };
    }
    if (el.tag === 'link') {
      const rel = (attr(el, 'rel') || '').toLowerCase().split(/\s+/);
      if (rel.includes('canonical')) head.canonical = el.attrs.href && el.attrs.href.dynamic ? { dynamic: true, line: el.line } : { href: attr(el, 'href') || '', line: el.line };
      if (rel.includes('author')) head.author = head.author || { text: attr(el, 'href'), line: el.line };
    }
    // next-seo and similar components
    if (el.component && /^(NextSeo|DefaultSeo|Seo|SEO|Head|Meta|BaseHead|PageHead|Metadata|Layout|BaseLayout|PageLayout|DocsLayout|BlogLayout|MainLayout|Page)$/.test(el.name)) {
      const t = el.attrs.title; const d = el.attrs.description;
      if (t || d) model.seoProps.push({ name: el.name, line: el.line });
      if (t && !head.title) head.title = t.dynamic ? { dynamic: true, line: t.line, via: el.name } : { text: clean(t.value), line: t.line, via: el.name };
      if (d && !head.description) head.description = d.dynamic ? { dynamic: true, line: d.line, via: el.name } : { text: clean(d.value), line: d.line, via: el.name };
      if (el.attrs.canonical && !head.canonical) head.canonical = el.attrs.canonical.dynamic ? { dynamic: true, line: el.line } : { href: el.attrs.canonical.value, line: el.line };
      if (hasAttr(el, 'noindex') && (el.attrs.noindex.bare || el.attrs.noindex.value === 'true')) head.robots = { noindex: true, nosnippet: false, content: `${el.name} noindex`, line: el.line, source: 'component' };
      if (el.attrs.opengraph) head.og = { title: true, description: true, image: /images?\s*:/.test(el.attrs.opengraph.value), url: /url\s*:/.test(el.attrs.opengraph.value), line: el.line };
    }
  }
}

function collectBlocks(node, model, ctx) {
  // inline run accumulation
  let run = null;
  const flush = () => {
    if (run && clean(run.text)) model.blocks.push({ kind: 'p', text: clean(run.text), line: run.line, hasLink: run.hasLink, chrome: ctx.chrome, implicit: true });
    run = null;
  };
  for (const ch of node.children || []) {
    if (ch.type === 'text') {
      if (!ch.text.trim()) { if (run) run.text += ' '; continue; }
      if (!run) run = { text: '', line: ch.line, hasLink: false };
      run.text += ch.text;
      continue;
    }
    if (ch.type === 'expr') { model.exprCount++; continue; }
    if (ch.type !== 'el') continue;
    const tag = ch.tag;
    if (['script', 'style', 'template', 'svg', 'head', 'noscript', 'title', 'meta', 'link'].includes(tag)) continue;
    if (INLINE.has(tag) || LINK_COMPONENTS.has(ch.name)) {
      const t = textOf(ch);
      if (t.trim()) {
        if (!run) run = { text: '', line: ch.line, hasLink: false };
        run.text += t;
        if (tag === 'a' || LINK_COMPONENTS.has(ch.name)) run.hasLink = true;
      }
      if (hasDynamicChildren(ch)) model.exprCount++;
      continue;
    }
    flush();
    const chrome = ctx.chrome || CHROME.has(tag);
    if (/^h[1-6]$/.test(tag)) {
      const text = clean(textOf(ch));
      model.blocks.push({ kind: 'heading', level: Number(tag[1]), text, line: ch.line, dynamic: !text && hasDynamicChildren(ch), chrome });
      continue;
    }
    if (tag === 'p' || tag === 'blockquote') {
      const text = clean(textOf(ch));
      const hasLink = [...walk(ch)].some((x) => x.type === 'el' && (x.tag === 'a' || LINK_COMPONENTS.has(x.name)));
      if (text) model.blocks.push({ kind: tag === 'p' ? 'p' : 'quote', text, line: ch.line, hasLink, chrome });
      else if (hasDynamicChildren(ch)) { model.blocks.push({ kind: 'p', text: '', dynamic: true, line: ch.line, chrome }); model.exprCount++; }
      continue;
    }
    if (tag === 'ul' || tag === 'ol' || tag === 'dl') {
      const items = [...walk(ch)].filter((x) => x.type === 'el' && (x.tag === 'li' || x.tag === 'dd' || x.tag === 'dt')).map((li) => clean(textOf(li)));
      model.lists++;
      model.blocks.push({ kind: 'list', text: clean(textOf(ch)), items, line: ch.line, chrome, ordered: tag === 'ol' });
      continue;
    }
    if (tag === 'table') {
      const cells = [...walk(ch)].filter((x) => x.type === 'el');
      const ths = cells.filter((x) => x.tag === 'th');
      const hasHeader = ths.length > 0 || cells.some((x) => x.tag === 'thead');
      const rows = cells.filter((x) => x.tag === 'tr').length;
      const t = { kind: 'table', text: clean(textOf(ch)), line: ch.line, hasHeader, rows, headerCells: ths.map((x) => clean(textOf(x))), chrome, caption: cells.some((x) => x.tag === 'caption') };
      model.blocks.push(t);
      continue;
    }
    if (tag === 'pre') { model.blocks.push({ kind: 'code', text: '', line: ch.line, chrome }); continue; }
    collectBlocks(ch, model, { chrome });
  }
  flush();
}

function analyseElements(doc, model) {
  for (const el of doc.elements) {
    const anc = ancestors(el);
    if (anc.some((a) => a.tag === 'svg')) continue;
    if (anc.some((a) => a.tag === 'head') && el.tag !== 'script') continue;
    const inChrome = anc.some((a) => CHROME.has(a.tag));
    if (el.tag === 'main' || el.tag === 'article' || hasAttr(el, 'role') && attr(el, 'role') === 'main') model.hasMain = true;
    if (el.tag === 'img' || IMAGE_COMPONENTS.has(el.name)) {
      const a = el.attrs.alt;
      model.images.push({
        src: attr(el, 'src') || attr(el, 'srcset') || '', alt: a ? (a.dynamic ? null : a.value) : undefined,
        altDynamic: !!(a && a.dynamic), hasAlt: !!a, spread: el.spread, line: el.line, tag: el.name,
        decorative: (attr(el, 'role') === 'presentation' || attr(el, 'aria-hidden') === 'true'),
      });
    }
    const isLinkEl = el.tag === 'a' || LINK_COMPONENTS.has(el.name);
    const click = el.attrs.onclick;
    if (isLinkEl) {
      const h = el.attrs.href || el.attrs.to;
      model.links.push({
        href: h ? (h.dynamic ? null : h.value) : undefined, hrefDynamic: !!(h && h.dynamic), hasHref: !!h,
        text: clean(textOf(el)), line: el.line, tag: el.name, onClick: click ? click.value : null, inChrome,
        routerLink: hasAttr(el, 'routerlink'), spread: el.spread,
      });
    } else if (click && !/^(button|input|form|select|option|summary)$/i.test(el.name) && !/Button$/.test(el.name) && NAV_CODE.test(click.value || '')) {
      model.clickNav.push({ tag: el.name, line: el.line, code: click.value });
    }
    if (el.tag === 'time') model.times.push({ datetime: attr(el, 'datetime'), text: clean(textOf(el)), line: el.line });
    if (hasAttr(el, 'data-nosnippet')) model.nosnippetEls.push({ tag: el.name, line: el.line, words: words(textOf(el)).length });
    if (el.tag === 'script') {
      const type = (attr(el, 'type') || '').toLowerCase();
      if (type === 'application/ld+json') {
        const raw = rawText(el).trim();
        const dyn = hasAttr(el, 'dangerouslysetinnerhtml') || el.children.some((c) => c.type === 'expr') || (raw.startsWith('{') && /^\{\s*JSON\.stringify/.test(raw)) || hasAttr(el, 'set:html') || hasAttr(el, 'v-html');
        if (dyn || !raw) model.jsonLd.push({ line: el.line, dynamic: true, raw: rawText(el) || (el.attrs.dangerouslysetinnerhtml || el.attrs['set:html'] || {}).value || '' });
        else {
          let data = null, error = null;
          try { data = JSON.parse(raw); } catch (e) { error = e.message; }
          model.jsonLd.push({ line: el.line, raw, data, error });
        }
      } else {
        model.scripts.push({ src: attr(el, 'src') || null, inline: el.attrs.src ? '' : rawText(el), line: el.line, type });
      }
    }
    const id = attr(el, 'id');
    if (id && ROOT_IDS.has(id) && !el.component) {
      const hasContent = el.children.some((c) => (c.type === 'text' && c.text.trim()) || c.type === 'el' || c.type === 'expr');
      if (!hasContent) model.emptyRoots.push({ id, tag: el.tag, line: el.line });
    }
    const cls = (attr(el, 'class') || '') + ' ' + (attr(el, 'rel') || '') + ' ' + (attr(el, 'itemprop') || '');
    if (/\b(author|byline)\b/i.test(cls)) model.bylineHints.push({ line: el.line, text: clean(textOf(el)) });
  }
}

function finish(model) {
  model.headings = model.blocks.filter((b) => b.kind === 'heading');
  model.tables = model.blocks.filter((b) => b.kind === 'table');
  return model;
}

/** Analyse a parsed markup document (HTML, JSX, template). */
export function analyseMarkup(doc) {
  const model = emptyModel();
  headFromElements(doc, model);
  analyseElements(doc, model);
  // choose content root: <main>/<article> if present, else <body>, else whole doc
  const all = doc.elements;
  const main = all.find((e) => e.tag === 'main') || all.find((e) => e.tag === 'article') || all.find((e) => attr(e, 'role') === 'main');
  const body = all.find((e) => e.tag === 'body');
  collectBlocks(body || doc.root, model, { chrome: false });
  const contentRoot = main || body || doc.root;
  const textRoot = body || doc.root;
  model.text = clean(textOf(textRoot));
  if (main) model.mainText = clean(textOf(main));
  else {
    model.mainText = clean(model.blocks.filter((b) => !b.chrome).map((b) => b.text).join(' '));
  }
  model.wordCount = words(model.mainText).length;
  model.staticWordCount = model.wordCount;
  model.contentRootTag = contentRoot.tag;
  return finish(model);
}

/** Analyse a markdown/MDX document body (frontmatter already stripped). */
export function analyseMarkdown(body, bodyLine, { mdx = false } = {}) {
  const model = emptyModel();
  const md = parseMarkdown(body, bodyLine, { mdx });
  model.blocks = md.blocks.map((b) => ({ ...b, chrome: false }));
  model.images = md.images.map((i) => ({ ...i, hasAlt: true, alt: i.alt }));
  model.links = md.links.map((l) => ({ ...l, hasHref: true }));
  for (const f of md.fragments) {
    const sub = analyseMarkup(f.doc);
    model.images.push(...sub.images);
    model.links.push(...sub.links);
    model.clickNav.push(...sub.clickNav);
    model.jsonLd.push(...sub.jsonLd);
    model.times.push(...sub.times);
    model.bylineHints.push(...sub.bylineHints);
    // place fragment blocks in order
    model.blocks.push(...sub.blocks);
    model.exprCount += sub.exprCount;
  }
  model.blocks.sort((a, b) => a.line - b.line);
  model.lists = model.blocks.filter((b) => b.kind === 'list').length;
  model.mainText = clean(model.blocks.filter((b) => b.kind !== 'code').map((b) => b.text).join(' '));
  model.text = model.mainText;
  model.wordCount = words(model.mainText).length;
  model.staticWordCount = model.wordCount;
  model.hasMain = true;
  return finish(model);
}

export { stripInline };
