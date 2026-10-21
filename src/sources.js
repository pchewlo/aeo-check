// Every rule cites at least one of these. Posts are from the MVXX AEO bookmark set (Oct 2026);
// docs are the vendors' and standards bodies' own pages.
export const SOURCES = {
  // X posts
  'x-jingg': { label: '@Jingg_n_Tonic on ChatGPT retrieval: answer within each section, plain text, claims beside evidence (quoting @metehan777)', url: 'https://x.com/Jingg_n_Tonic/status/2097252340973617458' },
  'x-kasra': { label: '@Kasra_Dash: cited for 5,000+ phrases by writing for each LLM\'s query fan-outs', url: 'https://x.com/Kasra_Dash/status/2098379471615111583' },
  'x-mal': { label: '@mal_shaik: Amplitude out-cited PostHog with pages that answer the problem', url: 'https://x.com/mal_shaik/status/2094859359004373352' },
  'x-rob-pages': { label: '@RobHoffman_: the 5-20 pages that drive conversions; interlink them', url: 'https://x.com/RobHoffman_/status/2099577674763243765' },
  'x-lotti': { label: '@LottiSchmitt: deleted 200 thin AI posts, traffic tripled', url: 'https://x.com/LottiSchmitt/status/2096967274343047324' },
  'x-daniel': { label: '@danielkbuilds: pages not indexing usually come down to content quality', url: 'https://x.com/danielkbuilds/status/2096917237105885412' },
  'x-suraj': { label: '@suraj_sharma14: the SEO checklist for vibe-coded sites', url: 'https://x.com/suraj_sharma14/status/2106240327569035424' },
  'x-boringlocal': { label: '@boringlocalseo: recent, structured, research-style content with comparison tables', url: 'https://x.com/boringlocalseo/status/2025616604512604454' },
  'x-cody-refresh': { label: '@codyschneider: bottom-of-funnel pages, refreshed every 30 days', url: 'https://x.com/codyschneider/status/2085516293164134861' },
  'x-cody-claude': { label: '@codyschneider: Claude Code for SEO: schema, internal linking maps, content refresh', url: 'https://x.com/codyschneider/status/2028500579501183024' },
  'x-ericciarla': { label: '@ericciarla: llms.txt generator', url: 'https://x.com/ericciarla/status/1899490834862809139' },
  'x-roundtable': { label: '@RoundtableSpace: agent skills list, including claude-seo', url: 'https://x.com/RoundtableSpace/status/2092609257338200469' },
  // Vendor docs
  'openai-bots': { label: 'OpenAI: Overview of OpenAI crawlers (OAI-SearchBot, GPTBot, ChatGPT-User)', url: 'https://developers.openai.com/api/docs/bots' },
  'anthropic-bots': { label: 'Anthropic: ClaudeBot, Claude-User and Claude-SearchBot', url: 'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler' },
  'perplexity-bots': { label: 'Perplexity: PerplexityBot and Perplexity-User', url: 'https://docs.perplexity.ai/guides/bots' },
  'google-crawlers': { label: 'Google: common crawlers, including Google-Extended', url: 'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers' },
  'apple-bots': { label: 'Apple: Applebot and Applebot-Extended', url: 'https://support.apple.com/en-us/119829' },
  'bing-bots': { label: 'Bing: which crawlers Bing uses', url: 'https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0' },
  'rfc9309': { label: 'RFC 9309: Robots Exclusion Protocol', url: 'https://www.rfc-editor.org/rfc/rfc9309' },
  'google-ai-features': { label: 'Google: AI features and your website (AI Overviews, AI Mode)', url: 'https://developers.google.com/search/docs/appearance/ai-features' },
  'google-helpful': { label: 'Google: creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
  'google-links': { label: 'Google: make your links crawlable', url: 'https://developers.google.com/search/docs/crawling-indexing/links-crawlable' },
  'google-js-seo': { label: 'Google: JavaScript SEO basics', url: 'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics' },
  'google-robots-meta': { label: 'Google: robots meta tag, data-nosnippet and X-Robots-Tag', url: 'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag' },
  'google-canonical': { label: 'Google: how to specify a canonical URL', url: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls' },
  'google-sitemaps': { label: 'Google: build and submit a sitemap', url: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap' },
  'google-title': { label: 'Google: influencing title links', url: 'https://developers.google.com/search/docs/appearance/title-link' },
  'google-snippet': { label: 'Google: control your snippets (meta descriptions)', url: 'https://developers.google.com/search/docs/appearance/snippet' },
  'google-redirects': { label: 'Google: redirects and Google Search', url: 'https://developers.google.com/search/docs/crawling-indexing/301-redirects' },
  'google-images': { label: 'Google: image SEO best practices', url: 'https://developers.google.com/search/docs/appearance/google-images' },
  'google-sd-policies': { label: 'Google: structured data general guidelines', url: 'https://developers.google.com/search/docs/appearance/structured-data/sd-policies' },
  'google-article': { label: 'Google: Article structured data', url: 'https://developers.google.com/search/docs/appearance/structured-data/article' },
  'google-faq': { label: 'Google: FAQPage structured data', url: 'https://developers.google.com/search/docs/appearance/structured-data/faqpage' },
  'google-breadcrumb': { label: 'Google: BreadcrumbList structured data', url: 'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb' },
  'google-org': { label: 'Google: Organization structured data', url: 'https://developers.google.com/search/docs/appearance/structured-data/organization' },
  'schema-org': { label: 'schema.org vocabulary', url: 'https://schema.org/docs/schemas.html' },
  'llmstxt': { label: 'llms.txt specification', url: 'https://llmstxt.org/' },
  'vercel-ai-crawlers': { label: 'Vercel: The rise of the AI crawler (Dec 2024): none of the major AI crawlers render JavaScript', url: 'https://vercel.com/blog/the-rise-of-the-ai-crawler' },
  'cloudflare-ai-block': { label: 'Cloudflare: AI crawlers blocked by default for new domains (Jul 2025)', url: 'https://blog.cloudflare.com/content-independence-day-no-ai-crawl-without-compensation/' },
  'ogp': { label: 'The Open Graph protocol', url: 'https://ogp.me/' },
  'w3c-lang': { label: 'W3C: declaring language in HTML', url: 'https://www.w3.org/International/questions/qa-html-language-declarations' },
};

export function sourceList(ids) {
  return (ids || []).map((id) => ({ id, ...(SOURCES[id] || { label: id, url: '' }) }));
}
