import { isIndexable } from './_util.js';

const POPUP_SCRIPTS = /optinmonster|omappapi|klaviyo.*onsite|privy\.com|sumo\.com|hellobar|popupsmart|poptin|wisepops|justuno|mc\.us\d+\.list-manage|optimonk/i;

export default {
  id: 'load-interstitials',
  severity: 'warn',
  scope: 'page',
  category: 'agents',
  title: 'No pop-ups or modals in front of the main content',
  rationale: 'Every overlay is a step an agent has to get past. In Larne\'s hotel test (Getting CEOs to trust CMOs, Oct 2026) the only successful booking took nine steps through a cookie banner, a menu, a dropdown, an upsell pop-up and an add-ons page. Google also treats intrusive interstitials as a page-experience problem.',
  sources: ['larne-agents', 'google-interstitials'],
  fix: 'Remove modals that open on load, or show them after the user acts. Keep cookie consent as a non-blocking banner and keep the main content and call to action reachable without dismissing anything.',
  check(page) {
    if (!isIndexable(page)) return [];
    const out = [];
    for (const o of page.overlays || []) {
      if (!o.beforeH1) continue;
      out.push({ line: o.line, message: `<${o.tag}> "${o.hint.slice(0, 50)}" is a visible dialog or overlay before the page heading.` });
    }
    for (const s of page.scripts || []) {
      if (s.src && POPUP_SCRIPTS.test(s.src)) out.push({ line: s.line, severity: 'info', message: `Loads a pop-up script (${s.src.slice(0, 60)}).` });
    }
    return out.slice(0, 3);
  },
};
