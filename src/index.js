// Programmatic API.
import { readFileSync } from 'node:fs';
import { discover } from './discover.js';
import { buildSite } from './site.js';
import { buildUrlSite } from './url.js';
import { runRules, summarise } from './engine.js';
import { runAI } from './ai.js';
import { loadConfig } from './config.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export { RULES, RULES_BY_ID } from './rules/index.js';
export { buildSite } from './site.js';
export { runRules, summarise } from './engine.js';

/**
 * Check a repository directory, an in-memory file list, or a live URL.
 * options: { root, files, url, config, onlyFiles, ai, aiModel, aiMaxPages, maxPages, probe, client, log }
 */
export async function check(options = {}) {
  const log = options.log || (() => {});
  let site;
  let config = options.config;
  let target;
  if (options.url) {
    config = config || {};
    target = options.url;
    site = await buildUrlSite(options.url, { maxPages: options.maxPages || 1, probe: options.probe !== false, fetchImpl: options.fetchImpl, log });
    if (!site.pages.length) {
      const e = site.fetchError || {};
      throw new Error(`Could not fetch ${options.url}${e.status ? ` (HTTP ${e.status})` : e.error ? ` (${e.error})` : ''}.`);
    }
  } else {
    const root = options.root || '.';
    config = config || loadConfig(root);
    target = root;
    const files = options.files || discover(root, { ignore: [...(config.ignore || []), ...(options.ignore || [])], include: config.include || [] });
    site = buildSite(files, { ...config, root });
  }
  let findings = runRules(site, config, { ai: !!options.ai });
  const notes = [];
  if (options.ai) {
    const aiFindings = await runAI(site, config, { client: options.client, model: options.aiModel, maxPages: options.aiMaxPages || 10, log });
    findings = findings.concat(aiFindings);
  }
  if (options.onlyFiles && options.onlyFiles.length) {
    const set = new Set(options.onlyFiles);
    findings = findings.filter((f) => set.has(f.file));
    notes.push(`Showing findings for ${options.onlyFiles.length} selected file(s).`);
  }
  if (site.parseErrors && site.parseErrors.length) notes.push(`Could not parse ${site.parseErrors.length} file(s): ${site.parseErrors.slice(0, 3).map((e) => e.path).join(', ')}`);
  const summary = summarise(site, findings);
  if (options.onlyFiles && options.onlyFiles.length) {
    const set = new Set(options.onlyFiles);
    summary.pages = summary.pages.filter((p) => set.has(p.file));
  }
  return { version: VERSION, target, site, findings, summary, notes, config };
}
