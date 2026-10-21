import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteOf, html, para } from './helpers.js';
import { runAI, pageToMarkdown, DEFAULT_MODEL } from '../src/ai.js';
import { check } from '../src/index.js';

function fakeClient(findings, calls = []) {
  return {
    beta: {
      messages: {
        create: async (req) => {
          calls.push(req);
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ findings }) }] };
        },
      },
    },
  };
}

const body = `<h1>Measuring onboarding</h1><h2>Why does onboarding matter?</h2><p>${para(120)}</p><h2>Which metric should you track?</h2><p>${para(120)}</p>`;
const files = { 'guide.html': html({ body }) };

test('ai rules: ai-section-answers, ai-fanout-gaps, ai-claims-evidence and ai-metadata-match map onto pages', async () => {
  const calls = [];
  const client = fakeClient([
    { rule: 'ai-section-answers', heading: 'Which metric should you track?', message: 'The section never names a metric.', fix: 'Open with "Track week-4 retention".' },
    { rule: 'ai-fanout-gaps', heading: '', message: 'Does not say what onboarding tools cost.', fix: 'Add a costs section.' },
    { rule: 'ai-claims-evidence', heading: 'Why does onboarding matter?', message: '"Doubles retention" has no source.', fix: 'Link the study.' },
    { rule: 'ai-metadata-match', heading: '', message: 'Title is about pricing; page is about onboarding.', fix: 'Retitle.' },
  ], calls);
  const site = siteOf(files);
  const out = await runAI(site, {}, { client });
  assert.equal(out.length, 4);
  const byRule = Object.fromEntries(out.map((f) => [f.ruleId, f]));
  assert.equal(byRule['ai-section-answers'].line, site.pages[0].headings[2].line);
  assert.match(byRule['ai-section-answers'].message, /under "Which metric/);
  assert.equal(byRule['ai-fanout-gaps'].severity, 'info');
  assert.equal(byRule['ai-claims-evidence'].fix, 'Link the study.');
  assert.equal(byRule['ai-metadata-match'].severity, 'warn');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, DEFAULT_MODEL);
  assert.equal(calls[0].output_config.format.type, 'json_schema');
  assert.match(calls[0].messages[0].content, /## Which metric should you track\?/);
});

test('ai rules: respect "off" in config and skip short pages', async () => {
  const client = fakeClient([{ rule: 'ai-fanout-gaps', heading: '', message: 'x', fix: 'y' }]);
  const off = await runAI(siteOf(files), { rules: { 'ai-fanout-gaps': 'off' } }, { client });
  assert.deepEqual(off, []);
  const calls = [];
  await runAI(siteOf({ 'short.html': html({ body: '<h1>Short</h1><p>Too short to review.</p>' }) }), {}, { client: fakeClient([], calls) });
  assert.equal(calls.length, 0);
});

test('ai rules: refusals and bad JSON produce no findings', async () => {
  const refusing = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } };
  assert.deepEqual(await runAI(siteOf(files), {}, { client: refusing }), []);
  const garbled = { beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }) } } };
  assert.deepEqual(await runAI(siteOf(files), {}, { client: garbled }), []);
});

test('ai rules: off by default, and check() runs them with --ai', async () => {
  const plain = await check({ files: Object.entries(files).map(([path, content]) => ({ path, content })), config: {} });
  assert.ok(!plain.findings.some((f) => f.ruleId.startsWith('ai-')));
  const withAi = await check({ files: Object.entries(files).map(([path, content]) => ({ path, content })), config: {}, ai: true, client: fakeClient([{ rule: 'ai-fanout-gaps', heading: '', message: 'Missing costs.', fix: 'Add costs.' }]) });
  assert.ok(withAi.findings.some((f) => f.ruleId === 'ai-fanout-gaps'));
});

test('pageToMarkdown renders headings, lists and tables', () => {
  const site = siteOf({ 'a.html': html({ body: '<h1>A</h1><ul><li>one</li><li>two</li></ul><table><tr><th>Plan</th></tr><tr><td>Team</td></tr></table>' }) });
  const md = pageToMarkdown(site.pages[0]);
  assert.match(md, /^# A/);
  assert.match(md, /\* one\n\* two/);
  assert.match(md, /\[table with columns: Plan\]/);
});
