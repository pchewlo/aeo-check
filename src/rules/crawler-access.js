export default {
  id: 'crawler-access',
  severity: 'error',
  scope: 'site',
  category: 'crawl',
  title: 'Firewall and CDN let AI crawlers through (URL mode)',
  rationale: 'CDNs and firewalls can block AI crawlers before robots.txt is read; Cloudflare changed its default to block AI crawlers on 1 July 2025. If the AI user agents get a 403 or a challenge page, the site cannot be cited.',
  sources: ['cloudflare-ai-block', 'openai-bots', 'anthropic-bots', 'perplexity-bots'],
  fix: 'In your CDN or WAF, allow verified AI search crawlers (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot). In Cloudflare, check Security > Bots and the AI Crawl Control settings.',
  check(site) {
    if (site.mode !== 'url' || !site.probes) return [];
    const base = site.probes.find((p) => p.token === 'browser');
    if (!base || base.status >= 400) return [];
    const blocked = site.probes.filter((p) => p.token !== 'browser' && (p.status >= 400 || p.challenge));
    if (!blocked.length) return [];
    return [{ file: site.pages[0] ? site.pages[0].file : site.origin, line: 0, message: `A normal browser gets ${base.status}, but requests with these user agents got blocked: ${blocked.map((b) => `${b.token} (${b.challenge ? 'challenge page' : b.status})`).join(', ')}. Some firewalls also check IP ranges, so confirm in your CDN settings.` }];
  },
};
