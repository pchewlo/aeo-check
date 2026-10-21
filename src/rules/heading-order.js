export default {
  id: 'heading-order',
  severity: 'warn',
  scope: 'markup',
  category: 'structure',
  title: 'Headings do not skip levels',
  rationale: 'Answer engines split pages at headings and score each passage with its heading path. Skipped levels (H2 to H4) break that outline, so a passage can end up attached to the wrong topic.',
  sources: ['x-jingg', 'x-suraj'],
  fix: 'Nest headings in order: H1, then H2 for sections, H3 for subsections.',
  check(page) {
    const hs = page.headings.filter((h) => !h.chrome);
    const out = [];
    for (let i = 1; i < hs.length; i++) {
      if (hs[i].level > hs[i - 1].level + 1) out.push({ line: hs[i].line, message: `H${hs[i].level} "${hs[i].text.slice(0, 60)}" follows an H${hs[i - 1].level}; expected H${hs[i - 1].level + 1}.` });
    }
    return out.slice(0, 5);
  },
};
