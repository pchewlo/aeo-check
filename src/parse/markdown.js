// Markdown / MDX reader. Produces the same block model the HTML analyser produces.
import { parseMarkup } from './markup.js';

export function parseFrontmatter(src) {
  const m = /^(?:﻿)?(---|\+\+\+)[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { data: {}, body: src, bodyLine: 1 };
  const data = m[1] === '---' ? parseYamlish(m[2]) : parseTomlish(m[2]);
  const consumed = m[0];
  return { data, body: src.slice(consumed.length), bodyLine: consumed.split('\n').length };
}

function scalar(v) {
  let s = v.trim();
  if (!s) return '';
  if ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'"))) return s.slice(1, -1);
  if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1).split(',').map((x) => scalar(x)).filter((x) => x !== '');
  if (s === 'true') return true;
  if (s === 'false') return false;
  s = s.replace(/\s+#.*$/, '');
  return s;
}

// Enough YAML for frontmatter: top-level scalars, one level of nesting, dash lists.
export function parseYamlish(text) {
  const out = {};
  const lines = text.split(/\r?\n/);
  let key = null;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = /^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/.exec(line);
    if (top) {
      key = top[1];
      out[key] = top[2].trim() === '' || top[2].trim() === '|' || top[2].trim() === '>' ? null : scalar(top[2]);
      continue;
    }
    if (!key) continue;
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item) {
      if (!Array.isArray(out[key])) out[key] = [];
      const kv = /^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/.exec(item[1]);
      out[key].push(kv ? { [kv[1]]: scalar(kv[2]) } : scalar(item[1]));
      continue;
    }
    const nested = /^\s+([A-Za-z0-9_\-]+)\s*:\s*(.*)$/.exec(line);
    if (nested) {
      if (out[key] === null || typeof out[key] !== 'object' || Array.isArray(out[key])) out[key] = {};
      out[key][nested[1]] = scalar(nested[2]);
      continue;
    }
    if (typeof out[key] === 'string' || out[key] === null) out[key] = ((out[key] || '') + ' ' + line.trim()).trim();
  }
  return out;
}

function parseTomlish(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_\-]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = scalar(m[2]);
  }
  return out;
}

const INLINE_LINK = /(!?)\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+["'][^"']*["'])?\s*\)/g;

export function stripInline(s) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<https?:\/\/[^>]+>/g, (m) => m.slice(1, -1))
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Parse a markdown body. Returns { blocks, headings, images, links, tables, lists, htmlFragments }.
 * startLine: line number of the first body line in the original file.
 */
export function parseMarkdown(body, startLine = 1, { mdx = false } = {}) {
  const lines = body.split(/\r?\n/);
  const blocks = [];
  const images = [];
  const links = [];
  const fragments = [];
  const refs = {};
  for (const l of lines) {
    const r = /^\s{0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s|$)/.exec(l);
    if (r) refs[r[1].toLowerCase()] = r[2];
  }

  const collectInline = (text, line) => {
    INLINE_LINK.lastIndex = 0;
    let m;
    while ((m = INLINE_LINK.exec(text))) {
      if (m[1]) images.push({ src: m[3], alt: m[2], line, tag: 'img', markdown: true });
      else links.push({ href: m[3], text: stripInline(m[2]), line, tag: 'a' });
    }
    const refRe = /(!?)\[([^\]]+)\]\[([^\]]*)\]/g;
    while ((m = refRe.exec(text))) {
      const href = refs[(m[3] || m[2]).toLowerCase()];
      if (!href) continue;
      if (m[1]) images.push({ src: href, alt: m[2], line, tag: 'img', markdown: true });
      else links.push({ href, text: m[2], line, tag: 'a' });
    }
    const auto = /<(https?:\/\/[^>\s]+)>/g;
    while ((m = auto.exec(text))) links.push({ href: m[1], text: m[1], line, tag: 'a' });
  };

  let i = 0;
  let para = null;
  const flush = () => {
    if (para) {
      const text = stripInline(para.raw.join(' '));
      if (text) blocks.push({ kind: 'p', text, line: para.line, hasLink: /\]\(|\]\[|<https?:/.test(para.raw.join(' ')) });
      para = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const ln = startLine + i;
    const t = line.trim();

    if (/^(```|~~~)/.test(t)) {
      flush();
      const fence = t.slice(0, 3);
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(fence)) j++;
      blocks.push({ kind: 'code', text: '', line: ln });
      i = j + 1;
      continue;
    }
    if (!t) { flush(); i++; continue; }
    if (/^\s{0,3}\[[^\]]+\]:\s*\S+/.test(line)) { flush(); i++; continue; }
    if (mdx && /^(import|export)\s/.test(t)) {
      flush();
      // skip a multi-line export block roughly: until blank line
      let j = i + 1;
      if (/[{(\[]\s*$/.test(t)) while (j < lines.length && lines[j].trim()) j++;
      i = j;
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(t);
    if (h) {
      flush();
      collectInline(h[2], ln);
      blocks.push({ kind: 'heading', level: h[1].length, text: stripInline(h[2]), line: ln });
      i++;
      continue;
    }
    if (para && /^=+\s*$/.test(t) && para.raw.length === 1) {
      blocks.push({ kind: 'heading', level: 1, text: stripInline(para.raw[0]), line: para.line });
      para = null; i++; continue;
    }
    if (para && /^-+\s*$/.test(t) && para.raw.length === 1) {
      blocks.push({ kind: 'heading', level: 2, text: stripInline(para.raw[0]), line: para.line });
      para = null; i++; continue;
    }
    if (/^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)[\s*_-]*$/.test(t)) { flush(); i++; continue; }
    if (t.startsWith('|') || (/\|/.test(t) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]))) {
      flush();
      const rows = [];
      let j = i;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) { rows.push(lines[j]); collectInline(lines[j], startLine + j); j++; }
      const hasHeader = rows.length > 1 && /^\s*\|?\s*:?-{3,}/.test(rows[1]);
      const cells = rows.filter((r) => !/^\s*\|?\s*:?-{3,}/.test(r)).map((r) => r.split('|').map((c) => stripInline(c)).filter(Boolean));
      blocks.push({ kind: 'table', text: cells.map((c) => c.join(' ')).join(' '), line: ln, hasHeader, rows: cells.length, headerCells: hasHeader ? cells[0] : [] });
      i = j;
      continue;
    }
    if (/^([-*+]|\d+[.)])\s+/.test(t)) {
      flush();
      const items = [];
      let j = i;
      while (j < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[j]) || (/^\s{2,}\S/.test(lines[j]) && items.length))) {
        collectInline(lines[j], startLine + j);
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[j]);
        if (m) items.push(stripInline(m[2])); else items[items.length - 1] += ' ' + stripInline(lines[j]);
        j++;
      }
      blocks.push({ kind: 'list', text: items.join(' '), items, line: ln, ordered: /^\d/.test(t) });
      i = j;
      continue;
    }
    if (t.startsWith('>')) {
      flush();
      const parts = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('>')) { parts.push(lines[j].trim().replace(/^>\s?/, '')); collectInline(lines[j], startLine + j); j++; }
      const text = stripInline(parts.join(' '));
      if (text) blocks.push({ kind: 'quote', text, line: ln });
      i = j;
      continue;
    }
    if (t.startsWith('<') && /^<\/?[A-Za-z]/.test(t)) {
      flush();
      let j = i;
      const chunk = [];
      while (j < lines.length && lines[j].trim()) { chunk.push(lines[j]); j++; }
      fragments.push({ src: chunk.join('\n'), line: ln });
      i = j;
      continue;
    }
    collectInline(line, ln);
    if (!para) para = { raw: [], line: ln };
    para.raw.push(t);
    i++;
  }
  flush();

  // HTML/JSX inside markdown: parse for images, links and text.
  for (const f of fragments) {
    const doc = parseMarkup(f.src, { mode: mdx ? 'jsx' : 'html', lineOffset: f.line - 1 });
    f.doc = doc;
  }
  return { blocks, images, links, fragments };
}
