import { cap } from './_util.js';

export default {
  id: 'accessible-names',
  severity: 'warn',
  scope: 'markup',
  category: 'agents',
  title: 'Links and buttons have an accessible name',
  rationale: 'Agents that act on a page read its links and buttons by their accessible name. In Larne\'s hotel test (Getting CEOs to trust CMOs, Oct 2026) the main "Book Now" buttons were blank links, invisible to an agent reading the page, and three of four assistants failed to book.',
  sources: ['larne-agents', 'w3c-names', 'google-links'],
  fix: 'Give every link and button visible text, or an aria-label when it is icon-only (e.g. <a href="/book" aria-label="Book a room">), or alt text on the image inside it.',
  check(unit) {
    const out = [];
    for (const c of unit.controls || []) {
      if (c.spread || c.name) continue;
      out.push({ line: c.line, message: `<${c.tag}${c.hint ? ` class/id "${c.hint.slice(0, 40)}"` : ''}> has no text, aria-label or labelled image, so agents and screen readers see an empty ${c.kind === 'link' ? 'link' : 'button'}.` });
    }
    return cap(out, 5);
  },
};
