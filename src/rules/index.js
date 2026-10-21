// Rule registry. Each rule is its own module.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js' && !f.startsWith('_')).sort();
const mods = await Promise.all(files.map((f) => import(`./${f}`)));

export const RULES = mods.map((m) => m.default).filter(Boolean);
export const RULES_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

const ORDER = ['crawl', 'metadata', 'structure', 'content', 'trust', 'schema', 'links', 'media'];
RULES.sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || (a.ai ? 1 : 0) - (b.ai ? 1 : 0) || a.id.localeCompare(b.id));
