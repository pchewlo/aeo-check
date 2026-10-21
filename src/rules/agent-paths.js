import { groupFor, isAllowed } from '../parse/sitefiles.js';
import { COMMERCE_ROUTE } from './_util.js';

const USER_AGENTS = ['ChatGPT-User', 'Claude-User', 'Perplexity-User'];
const SEARCH_AGENTS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'];
const DEFAULT_PATHS = ['/book', '/booking', '/checkout', '/cart', '/basket', '/shop', '/products', '/pricing', '/reserve', '/order'];

export default {
  id: 'agent-paths',
  severity: 'warn',
  scope: 'site',
  category: 'agents',
  title: 'Agents may reach product, booking and checkout paths',
  rationale: 'An assistant booking or buying for a user fetches the booking and checkout pages with its user agent. In Larne\'s hotel test (Getting CEOs to trust CMOs, Oct 2026) the booking engine blocked automated access, so three of four assistants never saw a price. Keeping checkout out of search indexes is fine; blocking the agents acting for a user is not.',
  sources: ['larne-agents', 'openai-bots', 'anthropic-bots', 'perplexity-bots', 'rfc9309'],
  fix: 'Add a robots.txt group for ChatGPT-User, Claude-User and Perplexity-User with "Allow: /" (or allow your booking and checkout paths), and check your booking engine or WAF does not block them.',
  check(site) {
    const out = [];
    if (site.robots) {
      const pagePaths = site.pages.filter((p) => COMMERCE_ROUTE.test(p.route) && !p.isDynamicRoute).map((p) => p.route);
      const paths = [...new Set([...pagePaths, ...DEFAULT_PATHS])];
      for (const token of USER_AGENTS) {
        const g = groupFor(site.robots.parsed, token);
        const blocked = paths.filter((p) => !isAllowed(g.rules, p).allowed);
        if (blocked.length && !isAllowed(g.rules, '/').allowed) continue; // whole-site blocks are reported by robots-ai-search
        if (blocked.length) out.push({ file: site.robots.path, line: isAllowed(g.rules, blocked[0]).rule.line, message: `${token} (acting for a user) is blocked from ${blocked.slice(0, 4).join(', ')}${blocked.length > 4 ? ', ...' : ''}.` });
      }
      for (const token of SEARCH_AGENTS) {
        const g = groupFor(site.robots.parsed, token);
        if (!isAllowed(g.rules, '/').allowed) continue;
        const blocked = pagePaths.filter((p) => !/checkout|cart|basket|order/.test(p) && !isAllowed(g.rules, p).allowed);
        if (blocked.length) out.push({ file: site.robots.path, line: isAllowed(g.rules, blocked[0]).rule.line, severity: 'info', message: `${token} cannot fetch product or pricing pages: ${blocked.slice(0, 4).join(', ')}.` });
      }
    }
    for (const p of site.commerceProbes || []) {
      if (p.blocked.length) out.push({ file: p.url, line: 0, message: `${p.url} returns ${p.browser} to a browser but blocks ${p.blocked.map((b) => `${b.token} (${b.status})`).join(', ')}.` });
    }
    return out;
  },
};
