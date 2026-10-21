// A small, tolerant markup parser for HTML, JSX/TSX and Vue/Svelte/Astro templates.
// It builds a tree with line numbers. It does not aim to be spec-complete; it aims to
// find the elements, attributes and text that matter to crawlers, without crashing.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param', 'keygen']);
const RAW_ALWAYS = new Set(['script', 'style']);
const RAW_HTML = new Set(['textarea', 'title']);
const BLOCKISH = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);
const AUTO_CLOSE = {
  p: BLOCKISH,
  li: new Set(['li']),
  dt: new Set(['dt', 'dd']),
  dd: new Set(['dt', 'dd']),
  tr: new Set(['tr', 'tbody', 'tfoot']),
  td: new Set(['td', 'th', 'tr', 'tbody', 'tfoot']),
  th: new Set(['td', 'th', 'tr', 'tbody', 'tfoot']),
  option: new Set(['option', 'optgroup']),
  thead: new Set(['tbody', 'tfoot']),
  tbody: new Set(['tbody', 'tfoot']),
};

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', copy: '©',
  reg: '®', trade: '™', pound: '£', euro: '€', middot: '·', bull: '•', times: '×',
};

export function decodeEntities(s) {
  if (!s || s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

export function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (off) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

const isIdent = (c) => /[A-Za-z0-9_$]/.test(c || '');
const isTagStart = (c) => /[A-Za-z]/.test(c || '');

function normaliseAttr(name) {
  let n = name;
  let dynamic = false;
  if (n.startsWith('v-bind:')) { n = n.slice(7); dynamic = true; }
  else if (n.startsWith(':')) { n = n.slice(1); dynamic = true; }
  if (n.startsWith('v-on:')) n = 'on' + n.slice(5);
  else if (n.startsWith('@')) n = 'on' + n.slice(1);
  else if (n.startsWith('on:')) n = 'on' + n.slice(3);
  n = n.toLowerCase();
  if (n === 'classname') n = 'class';
  if (n === 'htmlfor') n = 'for';
  const dot = n.indexOf('.');
  if (n.startsWith('on') && dot > 0) n = n.slice(0, dot); // @click.prevent
  return { name: n, dynamic };
}

/**
 * Parse markup.
 * mode: 'html' | 'template' (Vue/Svelte/Astro: braces are expressions) | 'jsx' (JS/TS source with embedded JSX)
 * Returns { root, elements, lineOf }.
 */
export function parseMarkup(src, { mode = 'html', lineOffset = 0 } = {}) {
  const lineOfRaw = lineIndex(src);
  const lineOf = (off) => lineOfRaw(off) + lineOffset;
  const jsx = mode === 'jsx';
  const braces = mode !== 'html';
  const nestedMarkupInBraces = mode === 'jsx' || mode === 'template';
  const elements = [];
  const root = { type: 'el', tag: '#root', name: '#root', attrs: {}, children: [], parent: null, line: 1 + lineOffset };
  const n = src.length;

  // ---- helpers -------------------------------------------------------------
  function skipString(i) {
    const q = src[i];
    i++;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (q === '`' && c === '$' && src[i + 1] === '{') { i = skipBraces(i + 1, null) ; continue; }
      if (c === q) return i + 1;
      if (q !== '`' && c === '\n') return i + 1; // unterminated
      i++;
    }
    return n;
  }

  function skipComment(i) {
    if (src[i + 1] === '/') { const e = src.indexOf('\n', i); return e < 0 ? n : e + 1; }
    const e = src.indexOf('*/', i + 2);
    return e < 0 ? n : e + 2;
  }

  function prevSignificant(i) {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (j < 0) return { ch: '', word: '' };
    let word = '';
    if (isIdent(src[j])) {
      let k = j;
      while (k >= 0 && isIdent(src[k])) k--;
      word = src.slice(k + 1, j + 1);
    }
    return { ch: src[j], word };
  }

  function canStartJsx(i) {
    const c = src[i + 1];
    if (!(isTagStart(c) || c === '>')) return false;
    const { ch, word } = prevSignificant(i);
    if (word) return ['return', 'yield', 'default', 'case', 'await', 'in', 'of', 'else', 'do'].includes(word);
    return ch === '' || '(,=?:[{}&|;>!'.includes(ch);
  }

  // Skip a balanced {...}; when parent is given, JSX found inside is parsed into parent.
  // Returns index after the closing brace.
  function skipBraces(i, parent) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '{') { depth++; i++; continue; }
      if (c === '}') { depth--; i++; if (depth === 0) return i; continue; }
      if (c === '"' || c === "'" || c === '`') { i = skipString(i); continue; }
      if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipComment(i); continue; }
      if (parent && nestedMarkupInBraces && c === '<' && canStartJsx(i)) {
        const r = parseElement(i, parent);
        if (r > i) { i = r; continue; }
      }
      i++;
    }
    return n;
  }

  function stringLiteralValue(code) {
    const t = code.trim();
    const m = /^(["'`])([\s\S]*)\1$/.exec(t);
    if (!m) return null;
    if (m[1] === '`' && m[2].includes('${')) return null;
    if (m[2].includes(m[1])) return null;
    return m[2];
  }

  // Parse an open tag at i. Returns { el, end, selfClosing } or null if it is not a tag.
  function parseOpenTag(i, parent) {
    let j = i + 1;
    let name = '';
    if (src[j] === '>') { // fragment <>
      name = '';
    } else {
      while (j < n && /[A-Za-z0-9_.:\-]/.test(src[j])) j++;
      name = src.slice(i + 1, j);
      if (!name) return null;
    }
    const el = {
      type: 'el', name, tag: /^[a-z]/.test(name) || name.includes('-') ? name.toLowerCase() : name,
      attrs: {}, children: [], parent, line: lineOf(i), start: i, spread: false,
    };
    if (/^[A-Z]/.test(name) || (name.includes('.') && !name.includes(':'))) el.component = true;
    let selfClosing = false;
    while (j < n) {
      while (j < n && /\s/.test(src[j])) j++;
      const c = src[j];
      if (c === '>') { j++; break; }
      if (c === '/' && src[j + 1] === '>') { selfClosing = true; j += 2; break; }
      if (c === '/' && !jsx) { j++; continue; }
      if (c === '{' && braces) {
        const e = skipBraces(j, null);
        const code = src.slice(j + 1, e - 1).trim();
        if (code.startsWith('...')) el.spread = true;
        else if (/^[A-Za-z_$][\w$]*$/.test(code)) el.attrs[code.toLowerCase()] = { value: code, dynamic: true, line: lineOf(j) };
        j = e;
        continue;
      }
      if (c === '<' || c === undefined) return jsx ? null : { el, end: j, selfClosing: false };
      // attribute name
      const s = j;
      while (j < n && !/[\s=>]/.test(src[j]) && !(src[j] === '/' && src[j + 1] === '>')) j++;
      const rawName = src.slice(s, j);
      if (!rawName) { j++; continue; }
      if (jsx && !/^[A-Za-z_:@][\w:.\-@]*$/.test(rawName)) return null; // not JSX after all (e.g. generics)
      const { name: an, dynamic: dyn } = normaliseAttr(rawName);
      const attrLine = lineOf(s);
      let k = j;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === '=') {
        k++;
        while (k < n && /\s/.test(src[k])) k++;
        const q = src[k];
        if (q === '"' || q === "'") {
          const e = src.indexOf(q, k + 1);
          const end = e < 0 ? n : e;
          const v = src.slice(k + 1, end);
          const dynamic = dyn || (braces && /\{[^}]*\}/.test(v) && mode === 'template' && !/^\{\{/.test(v) ? true : dyn);
          el.attrs[an] = { value: decodeEntities(v), dynamic, line: attrLine };
          j = end + 1;
        } else if (q === '{' && braces) {
          const e = skipBraces(k, null);
          const code = src.slice(k + 1, e - 1);
          const lit = stringLiteralValue(code);
          el.attrs[an] = lit !== null ? { value: lit, dynamic: false, line: attrLine } : { value: code.trim(), dynamic: true, line: attrLine };
          j = e;
        } else {
          const s2 = k;
          while (k < n && !/[\s>]/.test(src[k])) k++;
          el.attrs[an] = { value: decodeEntities(src.slice(s2, k)), dynamic: dyn, line: attrLine };
          j = k;
        }
      } else {
        el.attrs[an] = { value: '', dynamic: dyn, line: attrLine, bare: true };
      }
    }
    if (j >= n && jsx) return null;
    return { el, end: j, selfClosing };
  }

  // Parse one element starting at '<' (i). Appends it to parent. Returns index after it,
  // or i if it is not markup.
  function parseElement(i, parent) {
    const open = parseOpenTag(i, parent);
    if (!open) return i;
    const { el, end, selfClosing } = open;
    parent.children.push(el);
    elements.push(el);
    if (selfClosing || (!el.component && VOID.has(el.tag))) { el.end = end; return end; }
    if (RAW_ALWAYS.has(el.tag) || (!braces && RAW_HTML.has(el.tag))) {
      const re = new RegExp(`</${el.tag}\\s*>`, 'i');
      const m = re.exec(src.slice(end));
      const stop = m ? end + m.index : n;
      const raw = src.slice(end, stop);
      if (raw.length) el.children.push({ type: 'raw', text: raw, line: lineOf(end) });
      el.end = m ? stop + m[0].length : n;
      return el.end;
    }
    return parseChildren(end, el);
  }

  function closesAncestor(el, tag) {
    for (let p = el.parent; p; p = p.parent) if (p.tag === tag || p.name === tag) return true;
    return false;
  }

  // Parse children of el from i until its closing tag. Returns index after the close tag
  // (or at a point where an ancestor closes).
  function parseChildren(i, el) {
    while (i < n) {
      const c = src[i];
      if (c === '<') {
        if (src.startsWith('<!--', i)) {
          const e = src.indexOf('-->', i + 4);
          i = e < 0 ? n : e + 3;
          continue;
        }
        if (src[i + 1] === '!' || src[i + 1] === '?') {
          const e = src.indexOf('>', i);
          i = e < 0 ? n : e + 1;
          continue;
        }
        if (src[i + 1] === '/') {
          const m = /^<\/\s*([A-Za-z0-9_.:\-]*)\s*>/.exec(src.slice(i, i + 200));
          if (m) {
            const raw = m[1];
            const tag = /^[a-z]/.test(raw) || raw.includes('-') ? raw.toLowerCase() : raw;
            if (tag === el.tag || raw === el.name || (raw === '' && el.name === '')) {
              el.end = i + m[0].length;
              return el.end;
            }
            if (!jsx && closesAncestor(el, tag)) { el.end = i; return i; } // implicit close
            if (jsx && el.parent && closesAncestor(el, tag)) { el.end = i; return i; }
            i += m[0].length; // stray close tag
            continue;
          }
        }
        if (isTagStart(src[i + 1]) || (braces && src[i + 1] === '>')) {
          if (!jsx && mode !== 'template') {
            const m = /^<([A-Za-z][A-Za-z0-9\-]*)/.exec(src.slice(i, i + 40));
            const nt = m && m[1].toLowerCase();
            if (nt && AUTO_CLOSE[el.tag] && AUTO_CLOSE[el.tag].has(nt)) { el.end = i; return i; }
          } else if (mode === 'template') {
            const m = /^<([a-z][a-z0-9\-]*)/.exec(src.slice(i, i + 40));
            const nt = m && m[1];
            if (nt && AUTO_CLOSE[el.tag] && AUTO_CLOSE[el.tag].has(nt)) { el.end = i; return i; }
          }
          const r = parseElement(i, el);
          if (r > i) { i = r; continue; }
        }
        // literal '<'
        el.children.push({ type: 'text', text: '<', line: lineOf(i) });
        i++;
        continue;
      }
      if (braces && c === '{') {
        const s = i;
        const e = skipBraces(i, el);
        const code = src.slice(s + 1, Math.max(s + 1, e - 1));
        const lit = stringLiteralValue(code);
        if (lit !== null) el.children.splice(childIndexFor(el, s), 0, { type: 'text', text: decodeEntities(lit), line: lineOf(s) });
        else if (!/^\s*\/\*[\s\S]*\*\/\s*$/.test(code)) el.children.splice(childIndexFor(el, s), 0, { type: 'expr', code, line: lineOf(s), start: s });
        i = e;
        continue;
      }
      // text run
      let j = i;
      while (j < n && src[j] !== '<' && !(braces && src[j] === '{')) j++;
      const t = src.slice(i, j);
      if (t.length) el.children.push({ type: 'text', text: decodeEntities(t), line: lineOf(i + (t.length - t.trimStart().length)) });
      i = j;
    }
    el.end = n;
    return n;
  }

  // keep expression nodes before any JSX parsed inside them
  function childIndexFor(el, start) {
    let idx = el.children.length;
    while (idx > 0) {
      const ch = el.children[idx - 1];
      if (ch.type === 'el' && ch.start > start) idx--; else break;
    }
    return idx;
  }

  // ---- drive ---------------------------------------------------------------
  if (!jsx) {
    parseChildren(0, root);
  } else {
    let i = 0;
    while (i < n) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') { i = skipString(i); continue; }
      if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipComment(i); continue; }
      if (c === '<' && canStartJsx(i)) {
        const r = parseElement(i, root);
        if (r > i) { i = r; continue; }
      }
      i++;
    }
  }
  return { root, elements, lineOf };
}

// ---- tree utilities --------------------------------------------------------

export function attr(el, name) {
  const a = el.attrs[name];
  return a ? a.value : undefined;
}

export function hasAttr(el, name) {
  return Object.prototype.hasOwnProperty.call(el.attrs, name);
}

export function* walk(node) {
  yield node;
  if (node.children) for (const ch of node.children) yield* walk(ch);
}

export function findAll(root, pred) {
  const out = [];
  for (const node of walk(root)) if (node.type === 'el' && node !== root && pred(node)) out.push(node);
  return out;
}

const NO_TEXT = new Set(['script', 'style', 'template', 'svg', 'head', 'noscript']);

export function textOf(el, { skip = NO_TEXT } = {}) {
  let out = '';
  for (const ch of el.children || []) {
    if (ch.type === 'text') out += ch.text;
    else if (ch.type === 'el') {
      if (skip.has(ch.tag)) continue;
      const t = textOf(ch, { skip });
      out += (BLOCKISH.has(ch.tag) || ch.tag === 'br' || ch.tag === 'li' || ch.tag === 'td' || ch.tag === 'th') ? ` ${t} ` : t;
    }
  }
  return out;
}

export function rawText(el) {
  return (el.children || []).filter((c) => c.type === 'raw' || c.type === 'text').map((c) => c.text).join('');
}

export function hasDynamicChildren(el) {
  for (const node of walk(el)) if (node.type === 'expr') return true;
  return false;
}

export function ancestors(el) {
  const out = [];
  for (let p = el.parent; p; p = p.parent) out.push(p);
  return out;
}

export { BLOCKISH };
