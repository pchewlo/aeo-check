import { groupFor, isAllowed } from '../parse/sitefiles.js';

const TRAINING = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot'];

export default {
  id: 'robots-ai-training',
  severity: 'info',
  scope: 'site',
  category: 'crawl',
  title: 'Training crawlers blocked on purpose',
  rationale: 'GPTBot, ClaudeBot, Google-Extended, Applebot-Extended and CCBot gather data for model training. Blocking them does not remove you from AI search answers, but models trained without your pages know less about your brand when they answer without searching.',
  sources: ['openai-bots', 'anthropic-bots', 'google-crawlers', 'apple-bots'],
  fix: 'Keep the block if opting out of training is a deliberate decision. If not, remove these Disallow lines.',
  check(site) {
    if (!site.robots) return [];
    const blocked = [];
    for (const token of TRAINING) {
      const g = groupFor(site.robots.parsed, token);
      const r = isAllowed(g.rules, '/');
      if (!r.allowed) blocked.push({ token, line: r.rule.line });
    }
    if (!blocked.length) return [];
    return [{ file: site.robots.path, line: blocked[0].line, message: `Training crawlers blocked: ${blocked.map((b) => b.token).join(', ')}.` }];
  },
};
