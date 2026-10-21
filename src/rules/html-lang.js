export default {
  id: 'html-lang',
  severity: 'warn',
  scope: 'site',
  category: 'metadata',
  title: '<html> declares a language',
  rationale: 'The lang attribute tells crawlers and answer engines which language the page is in, which decides the language and region of the answers it can be cited in.',
  sources: ['w3c-lang', 'x-suraj'],
  fix: 'Set <html lang="en-GB"> (or your language) in the root layout or every HTML file.',
  check(site) {
    const out = [];
    const htmlPages = site.pages.filter((p) => p.kind === 'html' || p.kind === 'url');
    for (const p of htmlPages) {
      if (p.isUtility) continue;
      if (!p.head.lang) out.push({ file: p.file, line: 1, message: 'No lang attribute on <html>.' });
      else if (!p.head.lang.dynamic && !String(p.head.lang.value).trim()) out.push({ file: p.file, line: p.head.lang.line, message: 'lang attribute is empty.' });
    }
    const others = site.pages.filter((p) => p.kind !== 'html' && p.kind !== 'url');
    if (others.length && !others.some((p) => p.head.lang) && !site.layouts.some((l) => l.head.lang)) {
      const shell = site.layouts.find((l) => /layout\.|_document\.|app\.html|Layout|app\.vue/.test(l.file));
      out.push({ file: shell ? shell.file : others[0].file, line: 1, severity: shell ? 'warn' : 'info', message: shell ? 'The root layout does not set lang on <html>.' : 'No root layout with a lang attribute was found; check the rendered <html> tag.' });
    }
    return out;
  },
};
