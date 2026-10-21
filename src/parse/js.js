// Light-weight reading of JS/TS source: object literals, framework metadata, client-side signals.
import { lineIndex } from './markup.js';

/** Index of the brace/bracket/paren matching the one at `start`. */
export function matchBracket(src, start) {
  const open = src[start];
  const close = { '{': '}', '[': ']', '(': ')' }[open];
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipStr(src, i) - 1; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function skipStr(src, i) {
  const q = src[i];
  i++;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (q === '`' && src[i] === '$' && src[i + 1] === '{') { const e = matchBracket(src, i + 1); i = e < 0 ? src.length : e + 1; continue; }
    if (src[i] === q) return i + 1;
    i++;
  }
  return src.length;
}

/** Split the body of an object literal "{ a: 1, b: {..} }" into [{key, value}] at depth 0. */
export function objectEntries(objText) {
  const t = objText.trim();
  if (!t.startsWith('{')) return [];
  const end = matchBracket(t, 0);
  const body = t.slice(1, end < 0 ? t.length : end);
  const parts = [];
  let depth = 0, s = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"' || c === "'" || c === '`') { i = skipStr(body, i) - 1; continue; }
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(body.slice(s, i)); s = i + 1; }
  }
  parts.push(body.slice(s));
  const out = [];
  for (const p of parts) {
    const m = /^\s*(?:\/\/[^\n]*\n\s*)*(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$-]*))\s*:\s*([\s\S]*)$/.exec(p);
    if (m) out.push({ key: m[2] || m[3], value: m[4].trim() });
    else if (/^\s*[A-Za-z_$][\w$]*\s*$/.test(p)) out.push({ key: p.trim(), value: p.trim(), shorthand: true });
  }
  return out;
}

/** Convert a JS value expression to a literal where possible; returns { value, dynamic } */
export function literal(valueText) {
  const v = (valueText || '').trim().replace(/\s+as\s+const$/, '');
  const m = /^(['"`])([\s\S]*)\1$/.exec(v);
  if (m && !(m[1] === '`' && m[2].includes('${')) && !m[2].includes(m[1])) return { value: m[2], dynamic: false };
  if (v === 'true' || v === 'false') return { value: v === 'true', dynamic: false };
  if (/^-?\d+(\.\d+)?$/.test(v)) return { value: Number(v), dynamic: false };
  if (v.startsWith('{')) {
    const obj = {};
    for (const e of objectEntries(v)) obj[e.key] = literal(e.value);
    return { value: obj, dynamic: false, object: true };
  }
  if (v.startsWith('[')) return { value: v, dynamic: false, array: true };
  return { value: v, dynamic: true };
}

const get = (o, k) => (o && o.object ? o.value[k] : undefined);
const str = (l) => (l && !l.dynamic && typeof l.value === 'string' ? l.value : l && l.dynamic ? { dynamic: true, code: l.value } : undefined);

/**
 * Read Next.js metadata exports. Returns head info or null.
 */
export function nextMetadata(src) {
  const L = lineIndex(src);
  let m = /export\s+const\s+metadata\s*(?::\s*[\w.<>]+\s*)?=\s*\{/.exec(src);
  if (m) {
    const start = m.index + m[0].length - 1;
    const end = matchBracket(src, start);
    const text = src.slice(start, end + 1);
    return metadataFromObject(literal(text), L(m.index), false);
  }
  m = /export\s+(?:async\s+)?function\s+generateMetadata\s*\(/.exec(src) || /export\s+const\s+generateMetadata\s*=/.exec(src);
  if (m) {
    const body = src.slice(m.index, m.index + 4000);
    const line = L(m.index);
    const has = (k) => new RegExp(`\\b${k}\\s*:`).test(body);
    const head = { dynamic: true, line };
    if (has('title')) head.title = { dynamic: true, line };
    if (has('description')) head.description = { dynamic: true, line };
    if (has('canonical')) head.canonical = { dynamic: true, line };
    if (has('openGraph')) head.og = { title: true, description: true, image: /images\s*:/.test(body), url: /url\s*:/.test(body) };
    const rb = /robots\s*:\s*(\{[^}]*\}|(['"`])[^'"`]*\2)/.exec(body);
    if (rb) head.robots = robotsFromValue(literal(rb[1]), line);
    return head;
  }
  return null;
}

function robotsFromValue(r, line) {
  if (!r) return undefined;
  if (typeof r.value === 'string' && !r.dynamic) {
    const v = r.value.toLowerCase();
    return { noindex: /noindex|\bnone\b/.test(v), nosnippet: /nosnippet|max-snippet\s*:\s*0\b/.test(v), content: r.value, line };
  }
  if (r.object) {
    const idx = get(r, 'index');
    const ns = get(r, 'nosnippet');
    const ms = get(r, 'max-snippet') || get(r, 'maxSnippet');
    const gb = get(r, 'googleBot');
    let noindex = idx && idx.value === false;
    let nosnippet = (ns && ns.value === true) || (ms && ms.value === 0);
    if (gb && gb.object) {
      const gi = get(gb, 'index'); if (gi && gi.value === false) noindex = true;
      const gs = get(gb, 'nosnippet'); if (gs && gs.value === true) nosnippet = true;
      const gm = get(gb, 'max-snippet') || get(gb, 'maxSnippet'); if (gm && gm.value === 0) nosnippet = true;
    }
    return { noindex: !!noindex, nosnippet: !!nosnippet, content: 'metadata.robots', line };
  }
  return undefined;
}

export function metadataFromObject(obj, line) {
  const head = { line };
  const title = get(obj, 'title');
  if (title) {
    if (title.object) {
      const abs = get(title, 'absolute');
      const def = get(title, 'default');
      const tpl = get(title, 'template');
      const v = str(abs) ?? str(def);
      if (v !== undefined) head.title = typeof v === 'string' ? { text: v, line } : { dynamic: true, line };
      if (tpl && typeof tpl.value === 'string') head.titleTemplate = tpl.value;
      if (def && typeof def.value === 'string') head.titleDefault = def.value;
    } else {
      const v = str(title);
      head.title = typeof v === 'string' ? { text: v, line } : { dynamic: true, line };
    }
  }
  const d = str(get(obj, 'description'));
  if (d !== undefined) head.description = typeof d === 'string' ? { text: d, line } : { dynamic: true, line };
  const alt = get(obj, 'alternates');
  const can = str(get(alt, 'canonical'));
  if (can !== undefined) head.canonical = typeof can === 'string' ? { href: can, line } : { dynamic: true, line };
  const mb = str(get(obj, 'metadataBase'));
  if (mb) head.metadataBase = typeof mb === 'string' ? mb : (/new URL\((['"`])([^'"`]+)\1/.exec(mb.code || '') || [])[2];
  const og = get(obj, 'openGraph');
  if (og && og.object) head.og = { title: !!get(og, 'title'), description: !!get(og, 'description'), image: !!get(og, 'images'), url: !!get(og, 'url'), type: str(get(og, 'type')) };
  const rb = get(obj, 'robots');
  if (rb) head.robots = robotsFromValue(rb, line);
  const authors = get(obj, 'authors');
  if (authors) head.author = { line };
  const other = get(obj, 'other');
  if (other && other.object) head.other = Object.keys(other.value);
  return head;
}

/** Nuxt useHead/useSeoMeta, SvelteKit/Remix meta exports. */
export function headCalls(src) {
  const L = lineIndex(src);
  const head = {};
  for (const fn of ['useSeoMeta', 'useHead', 'useServerSeoMeta']) {
    const re = new RegExp(`\\b${fn}\\s*\\(\\s*\\{`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const start = m.index + m[0].length - 1;
      const end = matchBracket(src, start);
      const obj = literal(src.slice(start, end + 1));
      const line = L(m.index);
      const t = str(get(obj, 'title'));
      if (t !== undefined) head.title = typeof t === 'string' ? { text: t, line } : { dynamic: true, line };
      const d = str(get(obj, 'description'));
      if (d !== undefined) head.description = typeof d === 'string' ? { text: d, line } : { dynamic: true, line };
      if (get(obj, 'ogTitle') || get(obj, 'ogImage') || get(obj, 'ogDescription')) head.og = { title: !!get(obj, 'ogTitle'), description: !!get(obj, 'ogDescription'), image: !!get(obj, 'ogImage'), url: !!get(obj, 'ogUrl') };
      const ha = get(obj, 'htmlAttrs');
      const lang = str(get(ha, 'lang'));
      if (lang) head.lang = { value: typeof lang === 'string' ? lang : '(dynamic)', line };
      const rb = get(obj, 'robots');
      if (rb) head.robots = robotsFromValue(rb, line);
      const metaArr = get(obj, 'meta');
      if (metaArr && metaArr.array) {
        const dm = /name\s*:\s*(['"])description\1\s*,\s*content\s*:\s*(['"`])([^'"`]*)\2/.exec(metaArr.value);
        if (dm) head.description = { text: dm[3], line };
      }
    }
  }
  return Object.keys(head).length ? head : null;
}

function bodiesOf(src, callRe) {
  const out = [];
  let m;
  const re = new RegExp(callRe.source, 'g');
  while ((m = re.exec(src))) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    if (open < 0) continue;
    const end = matchBracket(src, open);
    out.push({ index: m.index, body: src.slice(open, end < 0 ? src.length : end + 1) });
  }
  return out;
}

const FETCHISH = /\bfetch\s*\(|\baxios\b|\bsupabase\b|\.from\(\s*['"]|\bgetDocs?\(|\bfirestore\b|\bgql\b|\bgraphql\b|\$fetch\(|\buseFetch\b|\bky\(|\bXMLHttpRequest\b/;

/** Signals that content is produced on the client only. */
export function clientSignals(src) {
  const L = lineIndex(src);
  const s = { useClient: false, effectFetch: [], clientDataHooks: [], ssrFalse: [], innerHTML: [], spaMount: [], hashRouting: [], clickNav: [], serverData: false };
  s.useClient = /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*\s*(['"])use client\1/.test(src);
  for (const { index, body } of bodiesOf(src, /\buse(?:Layout)?Effect\s*\(|\bonMounted\s*\(|\bonMount\s*\(|\$effect\s*\(/)) {
    if (FETCHISH.test(body)) s.effectFetch.push(L(index));
  }
  for (const m of src.matchAll(/\b(useSWR|useQuery|useInfiniteQuery|useSuspenseQuery|createResource)\s*\(/g)) s.clientDataHooks.push(L(m.index));
  for (const m of src.matchAll(/ssr\s*:\s*false/g)) s.ssrFalse.push(L(m.index));
  for (const m of src.matchAll(/\.innerHTML\s*=(?!=)|\binsertAdjacentHTML\s*\(|\bdocument\.write\s*\(/g)) s.innerHTML.push(L(m.index));
  for (const m of src.matchAll(/\bcreateRoot\s*\(|\bReactDOM\.render\s*\(|\bcreateApp\s*\(|\bnew Vue\s*\(|\.mount\s*\(\s*['"]#/g)) s.spaMount.push(L(m.index));
  for (const m of src.matchAll(/addEventListener\s*\(\s*['"]hashchange['"]|\bonhashchange\b|\bcreateWebHashHistory\b|\bHashRouter\b|\bcreateHashRouter\b|\bhashHistory\b|location\.hash\s*=(?!=)|mode\s*:\s*['"]hash['"]/g)) s.hashRouting.push(L(m.index));
  for (const m of src.matchAll(/\.onclick\s*=|addEventListener\s*\(\s*['"]click['"]/g)) {
    const win = src.slice(m.index, m.index + 240);
    if (/location\.(hash|href|assign|replace)|\brouter\.(push|replace)\(|\bnavigate\(|history\.pushState/.test(win)) s.clickNav.push(L(m.index));
  }
  s.serverData = /\bgetStaticProps\b|\bgetServerSideProps\b|\bgenerateStaticParams\b|export\s+(async\s+)?function\s+load\b|export\s+const\s+load\b|\bAstro\.props\b|\bgetCollection\s*\(|\bgetEntry\s*\(|export\s+default\s+async\s+function|export\s+(async\s+)?function\s+loader\b/.test(src);
  return s;
}
