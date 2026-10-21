// Optional judgement checks with Claude (--ai). Off by default; needs ANTHROPIC_API_KEY.
import { RULES_BY_ID } from './rules/index.js';
import { decorate } from './engine.js';
import { words } from './analyse.js';

export const AI_RULE_IDS = ['ai-section-answers', 'ai-fanout-gaps', 'ai-claims-evidence', 'ai-metadata-match'];
export const DEFAULT_MODEL = 'claude-opus-5';
const MAX_WORDS = 12000;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['rule', 'heading', 'message', 'fix'],
        properties: {
          rule: { type: 'string', enum: AI_RULE_IDS },
          heading: { type: 'string', description: 'Exact text of the heading the finding is under, or "" for the whole page' },
          message: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
};

const SYSTEM = `You review web pages for answer engine optimisation: how well ChatGPT, Claude, Perplexity, Gemini and Google AI Overviews can retrieve, understand and cite them.

Retrieval facts to apply: pages are converted to markdown-like text and cut into passages of about 170 words; only one to three passages per source reach the answering model; one user prompt fans out into many hidden sub-queries; metadata travels with each passage.

Report only concrete, fixable problems for these rules:
- ai-section-answers: a section (H2/H3) that does not answer its heading within its first two sentences, or that only makes sense with context from elsewhere on the page.
- ai-fanout-gaps: important sub-questions a reader deciding about this topic would ask (use cases, costs, requirements, limits, alternatives, hard cases) that the page leaves unanswered. At most three, most important first.
- ai-claims-evidence: claims, figures or superlatives with no metric, source, method or caveat in the same passage.
- ai-metadata-match: title or meta description that does not describe what the page actually covers.

Be specific: quote or name the passage, say what is missing, and give a one-sentence fix. Do not report style preferences. Return an empty list if the page is fine. Write in plain British English.`;

export function pageToMarkdown(page) {
  const lines = [];
  for (const b of page.blocks) {
    if (b.chrome) continue;
    if (b.kind === 'heading') lines.push(`${'#'.repeat(b.level)} ${b.text}`);
    else if (b.kind === 'list') lines.push((b.items || [b.text]).map((i) => `* ${i}`).join('\n'));
    else if (b.kind === 'table') lines.push(`[table${b.hasHeader ? ` with columns: ${(b.headerCells || []).join(' | ')}` : ' without header cells'}] ${b.text}`);
    else if (b.kind !== 'code' && b.text) lines.push(b.text);
  }
  return lines.join('\n\n');
}

function truncateWords(text, max) {
  const ws = text.split(/(\s+)/);
  let count = 0, out = '';
  for (const w of ws) {
    if (/\S/.test(w)) count++;
    if (count > max) return { text: out, truncated: true };
    out += w;
  }
  return { text: out, truncated: false };
}

async function defaultClient() {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    throw new Error('--ai needs the Anthropic SDK: npm install @anthropic-ai/sdk');
  }
  return new Anthropic();
}

/** Ask the model about one page. `client` is an Anthropic client (or a test double with the same shape). */
export async function reviewPage(page, { client, model = DEFAULT_MODEL }) {
  const body = pageToMarkdown(page);
  const { text, truncated } = truncateWords(body, MAX_WORDS);
  const user = [
    `URL path: ${page.route}`,
    `Title: ${page.head.title && page.head.title.text ? page.head.title.text : '(none)'}`,
    `Meta description: ${page.head.description && page.head.description.text ? page.head.description.text : '(none)'}`,
    truncated ? `Note: the page is longer than ${MAX_WORDS} words; only the first ${MAX_WORDS} are included.` : '',
    '',
    '--- page text ---',
    text,
  ].filter((l) => l !== '').join('\n');
  const res = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal') return { findings: [], note: 'model declined this page' };
  const textBlock = (res.content || []).find((b) => b.type === 'text');
  if (!textBlock) return { findings: [], note: 'no text in response' };
  let parsed;
  try { parsed = JSON.parse(textBlock.text); } catch { return { findings: [], note: 'unparseable response' }; }
  return { findings: parsed.findings || [], truncated };
}

/** Run the AI rules over the site's content pages. Returns decorated findings. */
export async function runAI(site, config = {}, { client, model = DEFAULT_MODEL, maxPages = 10, log = () => {} } = {}) {
  const enabled = AI_RULE_IDS.filter((id) => !(config.rules && config.rules[id] === 'off'));
  if (!enabled.length) return [];
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new Error('--ai needs ANTHROPIC_API_KEY in the environment.');
    client = await defaultClient();
  }
  const pages = site.pages
    .filter((p) => !p.isUtility && words(p.mainText).length >= 150)
    .sort((a, b) => b.wordCount - a.wordCount)
    .slice(0, maxPages);
  const out = [];
  for (const page of pages) {
    log(`ai: reviewing ${page.route}`);
    let r;
    try { r = await reviewPage(page, { client, model }); } catch (e) { log(`ai: ${page.route} failed: ${e.message}`); continue; }
    for (const f of r.findings) {
      if (!enabled.includes(f.rule)) continue;
      const h = f.heading ? page.headings.find((x) => x.text.trim().toLowerCase() === f.heading.trim().toLowerCase()) : null;
      out.push(decorate(RULES_BY_ID[f.rule], { file: page.file, line: h ? h.line : 1, message: f.heading ? `${f.message} (under "${f.heading}")` : f.message, fix: f.fix }, config));
    }
  }
  return out;
}
