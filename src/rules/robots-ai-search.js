import { groupFor, isAllowed } from '../parse/sitefiles.js';

export const SEARCH_BOTS = [
  { token: 'OAI-SearchBot', what: 'ChatGPT search results', src: 'openai-bots' },
  { token: 'ChatGPT-User', what: 'pages ChatGPT opens for a user', src: 'openai-bots' },
  { token: 'Claude-SearchBot', what: 'Claude search results', src: 'anthropic-bots' },
  { token: 'Claude-User', what: 'pages Claude opens for a user', src: 'anthropic-bots' },
  { token: 'PerplexityBot', what: 'Perplexity search results', src: 'perplexity-bots' },
  { token: 'Perplexity-User', what: 'pages Perplexity opens for a user', src: 'perplexity-bots' },
  { token: 'Googlebot', what: 'Google Search, AI Overviews and AI Mode', src: 'google-ai-features' },
  { token: 'Bingbot', what: 'Bing and Microsoft Copilot', src: 'bing-bots' },
  { token: 'Applebot', what: 'Siri and Spotlight', src: 'apple-bots' },
];

export default {
  id: 'robots-ai-search',
  severity: 'error',
  scope: 'site',
  category: 'crawl',
  title: 'robots.txt lets AI search and answer crawlers in',
  rationale: 'Answer engines can only quote pages their crawler may fetch. Blocking OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot or Bingbot removes the site from ChatGPT search, Claude, Perplexity, AI Overviews or Copilot answers.',
  sources: ['x-suraj', 'openai-bots', 'anthropic-bots', 'perplexity-bots', 'google-ai-features', 'rfc9309'],
  fix: 'Remove the Disallow lines for these user agents, or add "Allow: /" in their own group. Block training crawlers (GPTBot, ClaudeBot, Google-Extended) separately if you want to opt out of training.',
  check(site) {
    if (!site.robots) return [];
    const parsed = site.robots.parsed;
    const routes = site.pages.filter((p) => !p.isUtility && !p.isDynamicRoute).map((p) => p.route);
    const blockedAll = [];
    const partial = [];
    for (const bot of SEARCH_BOTS) {
      const g = groupFor(parsed, bot.token);
      const root = isAllowed(g.rules, '/');
      if (!root.allowed) { blockedAll.push({ bot, line: root.rule.line, specific: g.specific }); continue; }
      const blocked = routes.filter((r) => !isAllowed(g.rules, r).allowed);
      if (blocked.length) partial.push({ bot, blocked, line: isAllowed(g.rules, blocked[0]).rule.line });
    }
    const out = [];
    const viaStar = blockedAll.filter((b) => !b.specific);
    const named = blockedAll.filter((b) => b.specific);
    if (viaStar.length) {
      out.push({
        file: site.robots.path, line: viaStar[0].line,
        message: `"User-agent: *" disallows the whole site and no group lets these crawlers back in: ${viaStar.map((b) => b.bot.token).join(', ')}. They feed ${viaStar.slice(0, 3).map((b) => b.bot.what).join('; ')}.`,
      });
    }
    for (const b of named) {
      out.push({ file: site.robots.path, line: b.line, message: `${b.bot.token} is blocked from the whole site. It fetches ${b.bot.what}.` });
    }
    for (const p of partial) {
      out.push({ file: site.robots.path, line: p.line, severity: 'warn', message: `${p.bot.token} is blocked from ${p.blocked.length} page${p.blocked.length > 1 ? 's' : ''}, e.g. ${p.blocked.slice(0, 3).join(', ')}.` });
    }
    return out;
  },
};
