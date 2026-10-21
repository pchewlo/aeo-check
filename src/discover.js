// Find the files to check in a repository.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { matchAny } from './glob.js';

export const DEFAULT_IGNORE = [
  'node_modules', '.git', '.next', '.nuxt', '.output', '.svelte-kit', '.astro', '.vercel', '.netlify', '.turbo', '.cache',
  'coverage', 'vendor', '__tests__', '__mocks__', '*.test.*', '*.spec.*', '*.stories.*', '*.min.js', '*.d.ts',
  '*.bak', '*.bak.*', '*.orig', '.github', '.claude', '.husky', 'CHANGELOG.md', 'LICENSE*', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md',
];
const NON_GIT_IGNORE = ['dist', 'build', 'out', 'tmp', '.idea', '.vscode'];

const RELEVANT = /\.(html?|jsx|tsx|js|mjs|cjs|ts|mts|vue|svelte|astro|mdx?|markdown|svx|txt|xml|json|toml)$|(^|\/)_headers$/i;
const MAX_BYTES = 2 * 1024 * 1024;

function gitFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    // ls-files prints paths relative to cwd, which is root
    return out.toString().split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function walkFiles(root, dir = root, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const abs = join(dir, e.name);
    const rel = relative(root, abs).split(sep).join('/');
    if (e.isDirectory()) {
      if (matchAny(rel, DEFAULT_IGNORE) || matchAny(rel, NON_GIT_IGNORE)) continue;
      walkFiles(root, abs, out);
    } else if (e.isFile()) out.push(rel);
  }
  return out;
}

// Outside a git checkout, honour the root .gitignore (simple patterns only).
function readGitignore(root) {
  try {
    return readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/)
      .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
      .map((l) => l.replace(/^\//, '').replace(/\/$/, ''));
  } catch {
    return [];
  }
}

/** Returns [{ path, content }] for relevant files under root. */
export function discover(root, { ignore = [], include = [] } = {}) {
  let paths = gitFiles(root);
  if (!paths || !paths.length) {
    paths = walkFiles(root);
    ignore = [...ignore, ...readGitignore(root)];
  }
  const files = [];
  for (const p of paths) {
    if (!RELEVANT.test(p)) continue;
    if (matchAny(p, DEFAULT_IGNORE) || matchAny(p, ignore)) continue;
    if (include.length && !matchAny(p, include)) continue;
    const abs = join(root, p);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > MAX_BYTES) continue;
    // only keep json/toml/xml/txt files we know how to use
    if (/\.(json|toml)$/i.test(p) && !/(^|\/)(vercel\.json|netlify\.toml|package\.json|wrangler\.toml|firebase\.json)$/.test(p)) continue;
    if (/\.txt$/i.test(p) && !/(^|\/)(robots|llms|llms-full)\.txt$/i.test(p)) continue;
    if (/\.xml$/i.test(p) && !/sitemap[^/]*\.xml$/i.test(p)) continue;
    if (p.includes('/') && /(^|\/)package\.json$/.test(p) && p.split('/').length > 2) continue;
    files.push({ path: p, content: readFileSync(abs, 'utf8') });
  }
  return files;
}
