import { isIndexable } from './_util.js';

const VISIBLE_DATE = /\b(updated|published|posted|last (updated|modified|reviewed)|reviewed)\b[^.]{0,40}?\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|(19|20)\d\d)/i;

export function ldHas(page, key) {
  for (const j of page.jsonLd || []) {
    if (j.keys && j.keys.includes(key)) return true;
    if (j.data && JSON.stringify(j.data).includes(`"${key}"`)) return true;
  }
  return false;
}

export default {
  id: 'dates',
  severity: 'warn',
  scope: 'page',
  category: 'trust',
  title: 'Articles show when they were published and updated',
  rationale: 'ChatGPT\'s retrieval carries a crawl date and a publication date for every result, and answer engines favour recent sources. A machine-readable dateModified plus a visible "Updated" date shows the page is current.',
  sources: ['x-jingg', 'x-boringlocal', 'x-cody-refresh', 'google-article'],
  fix: 'Add datePublished and dateModified to the Article JSON-LD (or article:published_time / article:modified_time meta), and show "Updated <date>" near the title. Refresh key pages regularly.',
  check(page) {
    if (!page.isArticle || !isIndexable(page)) return [];
    const machine = !!(page.head.published || page.head.modified || ldHas(page, 'datePublished') || ldHas(page, 'dateModified'));
    const visible = page.times.length > 0 || VISIBLE_DATE.test(page.text) || (page.kind === 'md' && page.head.published);
    const out = [];
    if (!machine && !visible) out.push({ line: 1, message: 'No publication or update date, visible or in metadata.' });
    else if (!machine) out.push({ line: 1, message: 'Date is visible but not machine-readable (no datePublished/dateModified).' });
    else if (!visible && page.kind !== 'md') out.push({ line: 1, severity: 'info', message: 'Date is in metadata but not shown on the page.' });
    if (page.dataDriven && !['html', 'url', 'md'].includes(page.kind)) {
      for (const f of out) { f.severity = 'info'; f.message += ' This page renders data, so check the live page (aeo-check <url>).'; }
    }
    const mod = page.head.modified || page.head.published;
    if (mod && mod.value) {
      const d = new Date(mod.value);
      const age = (Date.now() - d.getTime()) / 86400000;
      if (!isNaN(age) && age > 365) out.push({ line: mod.line || 1, severity: 'info', message: `Last dated ${mod.value.slice(0, 10)}, over a year ago.` });
    }
    return out;
  },
};
