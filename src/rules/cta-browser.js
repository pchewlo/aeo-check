import { host } from './cta-journey.js';

const SEVERITY = { stuck: 'error', broken: 'error', handoff: 'info' };

export default {
  id: 'cta-browser',
  severity: 'error',
  scope: 'site',
  category: 'agents',
  title: 'A browser agent can complete the primary call to action up to the final submit (--browser)',
  rationale: 'Agents that drive a real browser (ChatGPT agent, Claude in Chrome) can use JavaScript forms and booking widgets, but they still fail on controls outside the visible area, clicks that do nothing, embedded forms cut off by their frame and validation that rejects plausible input. If the agent cannot reach the submit button, the user is told to do it themselves.',
  sources: ['larne-agents', 'openai-bots', 'anthropic-bots'],
  fix: 'Walk the flow yourself at a 1280x900 window: every step\'s controls visible without scrolling inside a frame, buttons that respond to a click and to Enter, embeds tall enough for their longest step (or a link to the full-page form), and the same link for a CTA before and after JavaScript runs.',
  check(site) {
    if (!site.browser) return [];
    const start = site.pages[0];
    const out = [];
    for (const w of site.browser.journeys) {
      const where = w.href ? ` (to ${host(w.href)})` : '';
      const path = w.steps.map((s) => host(s.url) + (s.notes.length ? ` [${s.notes.join('; ')}]` : '')).join(' → ');
      const friction = w.friction.length ? ` Friction: ${w.friction.join('; ')}.` : '';
      let sev = SEVERITY[w.outcome];
      if (w.outcome === 'reached') { if (!w.friction.length) continue; sev = 'warn'; }
      if (!sev) continue;
      const verb = { reached: 'reached the final button, with friction', stuck: 'got stuck', broken: 'failed', handoff: 'reached a step only the user can finish' }[w.outcome];
      out.push({ file: start.file, line: 1, severity: sev, message: `In a browser, "${w.name}"${where} ${verb}${path ? `: ${path}` : ''}. ${w.stop || ''}${friction}`.trim() });
    }
    for (const d of (site.browser.ctaDiff || []).slice(0, 3)) {
      out.push({
        file: start.file, line: 1, severity: 'warn',
        message: d.kind === 'js-only'
          ? `"${d.name}" (${host(d.rendered || '')}) appears only after JavaScript runs; agents that fetch the HTML never see it.`
          : `A "${d.name}" link goes to ${host(d.server || '')} in the HTML but to ${host(d.rendered)} once JavaScript runs, so agents with and without a browser take different paths.`,
      });
    }
    return out;
  },
};
