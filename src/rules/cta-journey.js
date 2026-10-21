import { goalLabel } from '../journey.js';

const SEVERITY = { broken: 'error', 'needs-browser': 'warn', 'dead-end': 'warn', handoff: 'info' };
export const host = (u) => { try { const x = new URL(u); return x.host + (x.pathname === '/' ? '' : x.pathname) + x.search; } catch { return u; } };

export default {
  id: 'cta-journey',
  severity: 'error',
  scope: 'site',
  category: 'agents',
  title: 'An agent can follow the primary call to action through to a form, sign-in or payment (URL mode)',
  rationale: 'An assistant asked to "sign me up" or "book a demo" follows the main call to action and has to reach something it can use: a form, a booking slot, a checkout. Most agents fetch pages without running JavaScript. A link that goes nowhere, a JavaScript-only booking widget or a page with no next step ends the task, and the assistant tells the user to do it themselves or picks a competitor whose path works.',
  sources: ['larne-agents', 'vercel-ai-crawlers', 'openai-bots', 'anthropic-bots'],
  fix: 'Make every step of the main call to action work without JavaScript: a real URL in the link, server-rendered pages, a plain HTML form where the user fills something in, and a link that carries the choice (plan, date, product) as a URL parameter.',
  check(site) {
    const start = site.pages[0];
    const out = [];
    for (const j of site.journeys || []) {
      const sev = SEVERITY[j.outcome];
      if (!sev) continue;
      // a link that goes nowhere is already reported by primary-cta
      if (j.outcome === 'broken' && !j.steps.length) continue;
      const path = j.steps.map((s) => host(s.finalUrl || s.url)).join(' → ');
      const last = j.steps[j.steps.length - 1];
      const where = last && last.notes[0] && j.outcome !== 'dead-end' && j.outcome !== 'broken' ? `: ${last.notes[0]}` : '';
      const shared = j.steps.find((s) => s.shared);
      const lost = shared ? ` On ${host(shared.finalUrl || shared.url)}, ${shared.shared.count} "${shared.shared.name}" buttons share one URL, so the choice (such as the plan) is not carried through.` : '';
      out.push({
        file: start.file, line: j.line, severity: sev,
        message: `"${j.name}"${j.count > 1 ? ` (${j.count} links)` : ''} to ${goalLabel(j.goal)}: ${path}${where}. ${j.stop}${lost}${j.form ? ` The ${j.form.provider} behind it has ${j.form.notes.join('; ')}.` : ''}`,
      });
    }
    return out;
  },
};
