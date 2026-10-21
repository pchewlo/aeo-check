import { cap } from './_util.js';

export default {
  id: 'js-only-links',
  severity: 'warn',
  scope: 'markup',
  category: 'links',
  title: 'Navigation uses real <a href> links',
  rationale: 'Crawlers only follow <a> elements with an href. Click handlers, javascript: links and buttons that change location hide the pages behind them, so they are never discovered or cited.',
  sources: ['google-links', 'x-suraj'],
  fix: 'Use <a href="/path"> (or your framework\'s Link component with href) for anything that navigates. Keep onClick for actions that do not change the URL.',
  check(page) {
    const out = [];
    for (const l of page.links) {
      if (l.spread) continue;
      if (!l.hasHref && l.onClick) out.push({ line: l.line, message: `<${l.tag}> navigates with onClick and has no href${l.text ? ` ("${l.text.slice(0, 40)}")` : ''}.` });
      else if (!l.hasHref && l.routerLink) out.push({ line: l.line, message: `<${l.tag} routerLink> has no href in the HTML.` });
      else if (typeof l.href === 'string' && /^javascript:/i.test(l.href)) out.push({ line: l.line, message: `Link uses a javascript: URL (${l.href.slice(0, 40)}).` });
      else if (l.href === '#' && l.onClick) out.push({ line: l.line, message: `<${l.tag} href="#"> navigates with onClick${l.text ? ` ("${l.text.slice(0, 40)}")` : ''}.` });
    }
    for (const c of page.clickNav) out.push({ line: c.line, message: `<${c.tag}> changes the URL in an onClick handler instead of being a link.` });
    for (const line of (page.signals && page.signals.clickNav) || []) out.push({ line, message: 'Script assigns a click handler that changes the location instead of using a link.' });
    return cap(out, 5);
  },
};
