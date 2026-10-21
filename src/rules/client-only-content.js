import { rendersComponents } from './_util.js';

export default {
  id: 'client-only-content',
  severity: 'error',
  scope: 'page',
  category: 'crawl',
  title: 'Main content is in the server HTML',
  rationale: 'GPTBot, ClaudeBot and PerplexityBot fetch HTML but do not run JavaScript. Text that only appears after a client-side fetch, a useEffect or an innerHTML write is invisible to them, so the page has nothing to quote.',
  sources: ['x-suraj', 'vercel-ai-crawlers', 'google-js-seo'],
  fix: 'Render the content on the server: fetch in a Server Component, getStaticProps/getServerSideProps, an Astro/SvelteKit load function, or prerender the page at build time. For a static SPA, prerender each route to HTML.',
  check(page) {
    if (page.isUtility) return [];
    const out = [];
    const s = page.signals || {};
    if (page.kind === 'html' || page.kind === 'url') {
      const thin = page.wordCount < 50;
      const scripts = page.scripts.length > 0;
      if (page.emptyRoots.length && thin && scripts) {
        const r = page.emptyRoots[0];
        const how = s.innerHTML && s.innerHTML.length ? ` Inline script writes it with innerHTML (line ${s.innerHTML[0]}).` : s.spaMount && s.spaMount.length ? ` A client framework mounts into it (line ${s.spaMount[0]}).` : '';
        out.push({ line: r.line, message: `<${r.tag} id="${r.id}"> is empty in the HTML and the page has ${page.wordCount} words of text without JavaScript.${how}` });
      } else if (thin && s.innerHTML && s.innerHTML.length >= 2 && scripts) {
        out.push({ line: s.innerHTML[0], message: `The page has ${page.wordCount} words in its HTML and builds the rest with innerHTML (${s.innerHTML.length} writes).` });
      }
      return out;
    }
    if (s.serverData) return out;
    const hooks = [...(s.effectFetch || []), ...(s.clientDataHooks || [])].sort((a, b) => a - b);
    if (hooks.length && page.staticWordCount < 80) {
      out.push({ line: hooks[0], message: `Page content arrives through a client-side fetch (line ${hooks[0]}) and the file has ${page.staticWordCount} words of static text.${s.useClient ? ' The page is a "use client" component.' : ''}` });
    }
    for (const l of s.ssrFalse || []) out.push({ line: l, severity: 'warn', message: 'A component is loaded with ssr: false, so it is missing from the server HTML.' });
    if (s.useClient && !hooks.length && page.staticWordCount < 20 && !rendersComponents(page) && page.exprCount > 0) {
      out.push({ line: 1, severity: 'info', message: '"use client" page with no static text; check that its text renders on the server.' });
    }
    return out;
  },
};
