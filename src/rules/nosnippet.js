export default {
  id: 'nosnippet',
  severity: 'warn',
  scope: 'page',
  category: 'crawl',
  title: 'No nosnippet on content you want quoted',
  rationale: 'Google uses nosnippet, max-snippet:0 and data-nosnippet to decide what may appear in AI Overviews and AI Mode. Content behind them cannot be quoted.',
  sources: ['google-ai-features', 'google-robots-meta'],
  fix: 'Remove nosnippet / max-snippet:0 from the page, and data-nosnippet from content blocks you want quoted.',
  check(page) {
    if (page.isUtility) return [];
    const out = [];
    const r = page.head.robots;
    if (r && r.nosnippet) out.push({ line: r.line || 1, message: `Robots directives block snippets on this page (${r.content || 'nosnippet'}).` });
    for (const el of page.nosnippetEls) if (el.words >= 30) out.push({ line: el.line, message: `<${el.tag} data-nosnippet> hides ${el.words} words from AI Overviews.` });
    return out;
  },
};
