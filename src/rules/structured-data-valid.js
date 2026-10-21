const REQUIRED = {
  Article: ['headline', 'author', 'datePublished'], BlogPosting: ['headline', 'author', 'datePublished'], NewsArticle: ['headline', 'author', 'datePublished'], TechArticle: ['headline', 'author'],
  FAQPage: ['mainEntity'], QAPage: ['mainEntity'], HowTo: ['name', 'step'], Product: ['name'], SoftwareApplication: ['name'],
  Organization: ['name', 'url'], WebSite: ['name', 'url'], BreadcrumbList: ['itemListElement'], Person: ['name'],
  LocalBusiness: ['name', 'address'], Event: ['name', 'startDate', 'location'], Recipe: ['name', 'recipeIngredient'], VideoObject: ['name', 'thumbnailUrl', 'uploadDate'],
};

function nodes(data) {
  const out = [];
  const visit = (d, top) => {
    if (!d || typeof d !== 'object') return;
    if (Array.isArray(d)) { d.forEach((x) => visit(x, top)); return; }
    if (d['@graph']) { visit(d['@graph'], true); }
    if (d['@type'] && top) out.push(d);
  };
  visit(data, true);
  return out;
}

export function checkNode(n) {
  const problems = [];
  const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
  for (const t of types) {
    for (const key of REQUIRED[t] || []) {
      const v = n[key];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) problems.push({ severity: key === 'author' || key === 'datePublished' ? 'warn' : 'error', message: `${t} is missing "${key}".` });
    }
    if (t === 'FAQPage' && Array.isArray(n.mainEntity)) {
      n.mainEntity.forEach((q, i) => {
        if (!q || q['@type'] !== 'Question' || !q.name) problems.push({ severity: 'error', message: `FAQPage mainEntity[${i}] must be a Question with a "name".` });
        else if (!q.acceptedAnswer || !q.acceptedAnswer.text) problems.push({ severity: 'error', message: `FAQPage question "${String(q.name).slice(0, 50)}" has no acceptedAnswer.text.` });
      });
    }
    if (t === 'Product' && !n.offers && !n.review && !n.aggregateRating) problems.push({ severity: 'warn', message: 'Product needs at least one of "offers", "review" or "aggregateRating".' });
    if (t === 'BreadcrumbList' && Array.isArray(n.itemListElement)) {
      n.itemListElement.forEach((it, i) => { if (!it || it.position === undefined || !it.name) problems.push({ severity: 'error', message: `BreadcrumbList item ${i} needs "position" and "name".` }); });
    }
  }
  for (const k of ['datePublished', 'dateModified', 'uploadDate', 'startDate']) {
    if (n[k] && typeof n[k] === 'string' && isNaN(Date.parse(n[k]))) problems.push({ severity: 'warn', message: `"${k}" is not an ISO 8601 date (${n[k]}).` });
  }
  return problems;
}

export default {
  id: 'structured-data-valid',
  severity: 'error',
  scope: 'markup',
  category: 'schema',
  title: 'JSON-LD parses and has the required properties',
  rationale: 'Invalid JSON-LD is ignored. Google requires structured data to be complete and to match the page; a FAQPage without answers or an Article without a headline adds nothing.',
  sources: ['google-sd-policies', 'schema-org', 'google-faq', 'google-article'],
  fix: 'Fix the JSON so it parses, include "@context": "https://schema.org" and "@type", and add the required properties for the type. Test with the Schema Markup Validator or Rich Results Test.',
  check(page) {
    const out = [];
    for (const j of page.jsonLd || []) {
      if (j.from || j.dynamic) continue;
      if (j.error) { out.push({ line: j.line, message: `JSON-LD does not parse: ${j.error}.` }); continue; }
      const data = j.data;
      const list = Array.isArray(data) ? data : [data];
      const hasContext = list.every((d) => d && (d['@context'] || (d['@graph'] && d['@context'])));
      if (!hasContext) out.push({ line: j.line, severity: 'warn', message: 'JSON-LD has no "@context": "https://schema.org".' });
      const ns = nodes(data);
      if (!ns.length) { out.push({ line: j.line, message: 'JSON-LD has no "@type".' }); continue; }
      for (const n of ns) for (const p of checkNode(n)) out.push({ line: j.line, severity: p.severity, message: p.message });
    }
    return out;
  },
};
