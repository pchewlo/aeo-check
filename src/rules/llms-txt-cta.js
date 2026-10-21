import { goalLabel } from '../journey.js';
import { host } from './cta-journey.js';

// what an llms.txt entry offers, from its name and notes; stricter than ctaGoal, which defaults to buy
const GOAL_WORDS = [
  ['demo', /\b(demo|call|meeting|consultation|talk to (sales|us)|contact sales)\b/i],
  ['signup', /\b(free trial|trial|sign ?up|get started|create (an |your )?account|register)\b/i],
  ['booking', /\b(book (a |your )?(room|table|stay|tickets?)|reserve|reservations?|tickets?)\b/i],
  ['buy', /\b(buy|checkout|order online|shop)\b/i],
];
const SCHEDULER = /(^|\.)(calendly\.com|cal\.com|savvycal\.com|chilipiper\.com)$|^meetings(-[a-z0-9]+)?\.hubspot\.com$/;

/** Comparable form of a URL: host without www, path without trailing slash; any Typeform share URL by its id. */
export function sameTarget(u) {
  try {
    const x = new URL(u);
    const tf = /(^|\.)typeform\.com$/.test(x.hostname) && /^\/to\/([A-Za-z0-9]+)/.exec(x.pathname);
    if (tf) return `typeform:${tf[1]}`;
    return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch { return null; }
}

const goalOf = (link) => {
  const text = `${link.name} ${link.notes || ''}`;
  const hit = GOAL_WORDS.find(([, re]) => re.test(text));
  if (hit) return hit[0];
  try { if (SCHEDULER.test(new URL(link.url).hostname)) return 'demo'; } catch {}
  return null;
};

export default {
  id: 'llms-txt-cta',
  severity: 'warn',
  scope: 'site',
  category: 'agents',
  title: 'llms.txt and the page\'s call to action send agents to the same place (URL mode)',
  rationale: 'Agents that read llms.txt follow its links instead of clicking through the site. When llms.txt names one demo or sign-up link and the page\'s button goes somewhere else, often an old scheduler event or a retired form, agents and people end up in different flows, and one of them is probably not maintained.',
  sources: ['llmstxt', 'larne-agents'],
  fix: 'Point the llms.txt entry for each action (book a demo, start a trial, buy) at the same URL as the page\'s main button, and update both together.',
  check(site) {
    if (!site.llms || !site.llms.parsed || !site.journeys || !site.journeys.length) return [];
    const start = site.pages[0];
    const walks = (site.browser && site.browser.journeys) || [];
    const out = [];
    const links = site.llms.parsed.sections.flatMap((s) => s.links);
    // many files give actions as a bare URL in a sentence ("Book a demo: https://...") rather than a link item
    (site.llms.content || '').split(/\r?\n/).forEach((text, i) => {
      for (const m of text.matchAll(/https?:\/\/[^\s)>\]]+/g)) {
        const url = m[0].replace(/[.,;:]+$/, '');
        if (links.some((l) => l.url === url)) continue;
        links.push({ name: text.slice(Math.max(0, m.index - 60), m.index).replace(/^.*[.!?]\s+/, '').replace(/[\s:(—-]+$/, '').trim() || url, url, notes: '', line: i + 1 });
      }
    });
    for (const j of site.journeys) {
      const dests = new Set();
      const add = (u) => { const k = u && sameTarget(u); if (k) dests.add(k); };
      try { add(new URL(j.href, start.file).href); } catch {}
      for (const s of j.steps) { add(s.url); add(s.finalUrl); }
      if (j.form) add(j.form.url);
      for (const w of walks.filter((x) => x.name.toLowerCase() === j.name.toLowerCase())) { add(w.href); for (const s of w.steps) add(s.url); }
      if (!dests.size) continue;
      for (const l of links) {
        if (goalOf(l) !== j.goal) continue;
        let abs;
        try { abs = new URL(l.url, site.llms.path).href; } catch { continue; }
        if (dests.has(sameTarget(abs))) continue;
        const first = [...dests][0];
        out.push({
          file: site.llms.path, line: l.line,
          message: `llms.txt links "${l.name}" (${host(abs)}) to ${goalLabel(j.goal)}, but the page's "${j.name}" goes to ${first.startsWith('typeform:') ? `Typeform ${first.slice(9)}` : first}. Agents reading llms.txt and agents clicking the button end up in different places.`,
        });
      }
    }
    return out;
  },
};
