export default {
  id: 'llms-txt-present',
  severity: 'warn',
  scope: 'site',
  category: 'crawl',
  title: 'llms.txt exists',
  rationale: 'llms.txt is a markdown index at /llms.txt that tells LLMs and agents what the site is and links its key pages. Agents reading docs or comparing products can use it instead of crawling HTML.',
  sources: ['llmstxt', 'x-ericciarla'],
  fix: 'Add /llms.txt (public/llms.txt in most frameworks): an H1 with the site name, a "> " one-line summary, then "## Section" lists of "- [Page name](https://...): what it covers".',
  check(site) {
    if (site.llms) return [];
    return [{ file: site.mode === 'url' ? site.origin + '/llms.txt' : 'llms.txt', line: 0, message: 'No llms.txt found.' }];
  },
};
