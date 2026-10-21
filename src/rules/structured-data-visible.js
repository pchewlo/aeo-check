const norm = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9À-ɏ]+/g, ' ').trim();

export default {
  id: 'structured-data-visible',
  severity: 'warn',
  scope: 'page',
  category: 'schema',
  title: 'Structured data matches the visible page',
  rationale: 'Google\'s structured-data policy and its AI features guidance both require markup to reflect visible content. FAQ answers that exist only in JSON-LD are a mismatch, and answer engines that quote the page text will not find them.',
  sources: ['google-sd-policies', 'google-ai-features', 'google-faq'],
  fix: 'Show every FAQ question and answer on the page, using the same wording as the JSON-LD.',
  check(page) {
    if (!page.text || page.dataDriven) return [];
    const text = norm(page.text);
    const out = [];
    for (const j of page.jsonLd || []) {
      if (!j.data || j.from) continue;
      const items = [];
      const visit = (d) => { if (!d || typeof d !== 'object') return; if (Array.isArray(d)) return d.forEach(visit); if (d['@type'] === 'Question' && d.name) items.push(d.name); Object.values(d).forEach(visit); };
      visit(j.data);
      const missing = items.filter((q) => !text.includes(norm(q)));
      if (missing.length) out.push({ line: j.line, message: `${missing.length} of ${items.length} FAQ questions in JSON-LD are not visible on the page, e.g. "${String(missing[0]).slice(0, 70)}".` });
    }
    return out;
  },
};
