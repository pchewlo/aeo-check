// Command-line interface.
import { existsSync, statSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { check, VERSION, RULES } from './index.js';
import { severityAtLeast } from './engine.js';
import { loadConfig } from './config.js';
import { formatText } from './report/text.js';
import { formatJson } from './report/json.js';
import { formatSarif } from './report/sarif.js';
import { formatGithub } from './report/github.js';
import { formatMarkdown } from './report/markdown.js';
import { DEFAULT_MODEL } from './ai.js';

const HELP = `aeo-check ${VERSION}
Check a website's code for answer engine optimisation (AEO): whether ChatGPT,
Claude, Perplexity, Gemini and Google AI Overviews can crawl, understand and cite it.

Usage
  aeo-check [dir | files... | url] [options]

Examples
  aeo-check                         check the current repository
  aeo-check ./site --format json    JSON report
  aeo-check https://example.com     fetch a live page as a crawler would
  aeo-check --since origin/main     only report files changed since a git ref

Options
  --format <f>         text (default), json, sarif, github, markdown
  --output <file>      write the report to a file instead of stdout
  --sarif-output <f>   also write SARIF to a file
  --markdown-output <f> also write a markdown summary to a file
  --fail-on <sev>      exit 1 on findings at or above: error (default), warn, info, none
  --since <ref>        report only files changed since this git ref
  --ignore <glob>      skip matching paths (repeatable)
  --rule <id=sev>      set a rule to error, warn, info or off (repeatable)
  --only <ids>         run only these rules (comma-separated)
  --site-url <url>     production URL, for canonical and internal-link checks
  --config <file>      config file (default .aeo-check.json)
  --max-pages <n>      URL mode: pages to crawl from the start URL (default 1)
  --no-probe           URL mode: skip the AI user-agent firewall probe
  --ai                 add judgement checks with Claude (needs ANTHROPIC_API_KEY)
  --ai-model <id>      model for --ai (default ${DEFAULT_MODEL})
  --ai-max-pages <n>   pages to send for --ai (default 10)
  --quiet              text output without "why" and "fix" lines
  --no-color           plain text output
  --list-rules         print the rules and exit
  -v, --version        print the version
  -h, --help           print this help
`;

export function parseArgs(argv) {
  const opts = { paths: [], ignore: [], rules: {}, format: 'text', failOn: undefined };
  const need = (i, name) => { if (i >= argv.length) throw new Error(`${name} needs a value`); return argv[i]; };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline = null;
    if (a.startsWith('--') && a.includes('=')) { inline = a.slice(a.indexOf('=') + 1); a = a.slice(0, a.indexOf('=')); }
    const val = (name) => (inline !== null ? inline : need(++i, name));
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '-v': case '--version': opts.version = true; break;
      case '--format': case '-f': opts.format = val(a); break;
      case '--output': case '-o': opts.output = val(a); break;
      case '--sarif-output': opts.sarifOutput = val(a); break;
      case '--markdown-output': opts.markdownOutput = val(a); break;
      case '--fail-on': opts.failOn = val(a); break;
      case '--since': opts.since = val(a); break;
      case '--ignore': opts.ignore.push(val(a)); break;
      case '--rule': {
        const v = val(a);
        const [id, sev] = v.split('=');
        if (!id || !['error', 'warn', 'info', 'off'].includes(sev)) throw new Error(`--rule expects id=error|warn|info|off, got "${v}"`);
        opts.rules[id] = sev;
        break;
      }
      case '--only': opts.only = val(a).split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--site-url': opts.siteUrl = val(a); break;
      case '--config': opts.config = val(a); break;
      case '--max-pages': opts.maxPages = Number(val(a)); break;
      case '--no-probe': opts.probe = false; break;
      case '--ai': opts.ai = true; break;
      case '--ai-model': opts.aiModel = val(a); break;
      case '--ai-max-pages': opts.aiMaxPages = Number(val(a)); break;
      case '--quiet': case '-q': opts.quiet = true; break;
      case '--no-color': opts.color = false; break;
      case '--color': opts.color = true; break;
      case '--list-rules': opts.listRules = true; break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option ${a}`);
        opts.paths.push(a);
    }
  }
  if (!['text', 'json', 'sarif', 'github', 'markdown'].includes(opts.format)) throw new Error(`Unknown format "${opts.format}"`);
  if (opts.failOn && !['error', 'warn', 'info', 'none'].includes(opts.failOn)) throw new Error(`--fail-on expects error, warn, info or none`);
  return opts;
}

function listRules() {
  const rows = RULES.map((r) => `${r.id.padEnd(26)} ${r.severity.padEnd(6)} ${r.category.padEnd(10)} ${r.title}`);
  return `${'id'.padEnd(26)} ${'sev'.padEnd(6)} ${'category'.padEnd(10)} checks\n${rows.join('\n')}\n${RULES.length} rules\n`;
}

function gitChanged(root, ref) {
  const run = (args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  const top = run(['rev-parse', '--show-toplevel']).trim();
  const names = new Set();
  for (const args of [['diff', '--name-only', `${ref}...HEAD`], ['diff', '--name-only'], ['diff', '--name-only', '--cached'], ['ls-files', '--others', '--exclude-standard']]) {
    try { run(args).split('\n').filter(Boolean).forEach((n) => names.add(n)); } catch (e) { if (args[2] && args[2].includes('...')) throw new Error(`git diff against ${ref} failed: ${e.stderr ? e.stderr.toString().trim() : e.message}`); }
  }
  // paths from git are relative to the repo top; convert to relative-to-root
  const absRoot = realpathSync(resolve(root));
  return [...names].map((n) => relative(absRoot, resolve(top, n)).split(sep).join('/')).filter((p) => !p.startsWith('..'));
}

export async function main(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { stderr.write(`aeo-check: ${e.message}\n\n${HELP}`); return 2; }
  if (opts.help) { stdout.write(HELP); return 0; }
  if (opts.version) { stdout.write(VERSION + '\n'); return 0; }
  if (opts.listRules) { stdout.write(listRules()); return 0; }

  const url = opts.paths.find((p) => /^https?:\/\//i.test(p));
  let root = '.';
  let onlyFiles = [];
  if (!url) {
    const dirs = opts.paths.filter((p) => existsSync(p) && statSync(p).isDirectory());
    const files = opts.paths.filter((p) => !dirs.includes(p));
    for (const f of files) if (!existsSync(f)) { stderr.write(`aeo-check: no such file or directory: ${f}\n`); return 2; }
    if (dirs.length > 1) { stderr.write('aeo-check: pass one directory at a time\n'); return 2; }
    root = dirs[0] || '.';
    onlyFiles = files.map((f) => relative(resolve(root), resolve(f)).split(sep).join('/'));
  }
  let config = {};
  try { config = url ? (opts.config ? loadConfig('.', opts.config) : {}) : loadConfig(root, opts.config); } catch (e) { stderr.write(`aeo-check: cannot read config: ${e.message}\n`); return 2; }
  config = { ...config, rules: { ...(config.rules || {}), ...opts.rules } };
  if (opts.only) config.only = opts.only;
  if (opts.siteUrl) config.siteUrl = opts.siteUrl;
  const failOn = opts.failOn || config.failOn || 'error';
  if (opts.since && !url) {
    try { onlyFiles = onlyFiles.concat(gitChanged(root, opts.since)); } catch (e) { stderr.write(`aeo-check: ${e.message}\n`); return 2; }
    if (!onlyFiles.length) onlyFiles = ['\0none'];
  }

  let result;
  try {
    result = await check({
      root, url, config, onlyFiles, ignore: opts.ignore, ai: opts.ai, aiModel: opts.aiModel, aiMaxPages: opts.aiMaxPages,
      maxPages: opts.maxPages, probe: opts.probe, log: (m) => { if (env.AEO_CHECK_DEBUG) stderr.write(m + '\n'); },
    });
  } catch (e) {
    stderr.write(`aeo-check: ${e.message}\n`);
    if (env.AEO_CHECK_DEBUG) stderr.write(e.stack + '\n');
    return 2;
  }

  const color = opts.color !== undefined ? opts.color : !!(stdout.isTTY && !env.NO_COLOR) && !opts.output;
  const render = (fmt) => ({
    text: () => formatText(result, { color: fmt === 'text' && color, quiet: opts.quiet }),
    json: () => formatJson(result),
    sarif: () => formatSarif(result),
    github: () => formatGithub(result),
    markdown: () => formatMarkdown(result),
  }[fmt])();
  const report = render(opts.format);
  if (opts.output) writeFileSync(opts.output, report); else stdout.write(report);
  if (opts.sarifOutput) writeFileSync(opts.sarifOutput, formatSarif(result));
  if (opts.markdownOutput) writeFileSync(opts.markdownOutput, formatMarkdown(result));

  const failing = result.findings.filter((f) => severityAtLeast(f.severity, failOn));
  return failing.length ? 1 : 0;
}
