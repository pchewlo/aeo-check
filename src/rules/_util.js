// Helpers shared by rules.
import { words } from '../analyse.js';

export { words };

export const downgrade = (sev) => (sev === 'error' ? 'warn' : 'info');

/** Missing <head> data is certain for HTML; for framework files a layout or component may supply it. */
export function headSeverity(page, sev) {
  return page.headConfidence === 'partial' ? downgrade(sev) : sev;
}

/** Pages that are meant to be found: not utility pages and not redirect stubs. A noindex page still
 *  counts (the noindex rule reports it), so fixing it does not reveal a second wave of findings. */
export function isIndexable(page) {
  return !page.isUtility && !page.isRedirect;
}

/** Pages whose full text is visible to static analysis (so content rules are fair). */
export function hasFullText(page) {
  if (['html', 'url', 'md'].includes(page.kind)) return true;
  return !page.dataDriven && !rendersComponents(page);
}

export function rendersComponents(page) {
  return /<[A-Z][A-Za-z0-9]*[\s/>]/.test(stripImports(page.source || ''));
}

function stripImports(src) {
  return src.replace(/^import[^\n]*$/gm, '');
}

/** Split blocks into sections at headings. */
export function sections(page) {
  const out = [];
  let cur = { heading: null, blocks: [] };
  for (const b of page.blocks) {
    if (b.chrome) continue;
    if (b.kind === 'heading') {
      out.push(cur);
      cur = { heading: b, blocks: [] };
    } else cur.blocks.push(b);
  }
  out.push(cur);
  return out.filter((s) => s.heading || s.blocks.length);
}

export const paragraphs = (page) => page.blocks.filter((b) => !b.chrome && (b.kind === 'p' || b.kind === 'quote') && b.text);

export const QUESTION = /\?\s*$|^(how|what|why|when|which|who|whom|whose|where|can|could|does|do|did|is|are|was|were|should|will|would|may|might|has|have)\b/i;

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function excerpt(s, n = 80) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export function cap(findings, max, note) {
  if (findings.length <= max) return findings;
  const kept = findings.slice(0, max);
  kept[max - 1] = { ...kept[max - 1], message: `${kept[max - 1].message} (+${findings.length - max} more like this ${note || 'in this file'})` };
  return kept;
}
