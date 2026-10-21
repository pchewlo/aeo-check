import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findings, html, para } from '../helpers.js';

const page = (body, opts = {}) => ({ 'index.html': html({ body, ...opts }) });

test('single-h1: none, several, one', () => {
  assert.equal(findings('single-h1', page('<p>No heading here.</p>'))[0].severity, 'error');
  const two = findings('single-h1', page('<h1>A</h1><h1>B</h1>'));
  assert.equal(two[0].severity, 'warn');
  assert.deepEqual(findings('single-h1', page('<h1>A</h1><h2>B</h2>')), []);
  assert.deepEqual(findings('single-h1', { 'content/guide.md': '---\ntitle: Guide\n---\nText.\n' }), []);
  assert.equal(findings('single-h1', { 'package.json': '{"dependencies":{"next":"15"}}', 'app/page.tsx': 'import Hero from "./Hero"\nexport default () => <main><Hero /></main>' })[0].severity, 'info');
});

test('heading-order: skipped levels', () => {
  const f = findings('heading-order', page('<h1>A</h1><h2>B</h2><h4>C</h4>'));
  assert.equal(f.length, 1);
  assert.match(f[0].message, /H4 "C" follows an H2/);
  assert.deepEqual(findings('heading-order', page('<h1>A</h1><h2>B</h2><h3>C</h3><h2>D</h2>')), []);
});

test('heading-order: works in markdown', () => {
  const f = findings('heading-order', { 'content/a.md': '# A\n\n### C\n\ntext\n' });
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 3);
});

test('answer-first: lead-ins under H2s', () => {
  const f = findings('answer-first', page('<h1>A</h1><h2>How much does it cost?</h2><p>In this section we will look at pricing.</p><h2>Who is it for?</h2><p>Acme suits product teams of 5 to 50.</p>'));
  assert.equal(f.length, 1);
  assert.match(f[0].message, /How much does it cost/);
  const md = findings('answer-first', { 'blog/post.md': '# Post\n\n## Setup\n\nLet\'s dive into the setup.\n' });
  assert.equal(md.length, 1);
  assert.equal(md[0].line, 5);
});

test('self-contained-passages: vague references', () => {
  const f = findings('self-contained-passages', page('<h1>A</h1><p>As mentioned above, this approach cuts costs.</p><p>Server rendering cuts costs by 20%.</p>'));
  assert.equal(f.length, 1);
  assert.match(f[0].message, /as mentioned above/i);
});

test('question-headings: long page with no question headings', () => {
  const body = `<h1>Guide</h1><h2>Pricing</h2><p>${para(150)}</p><h2>Setup</h2><p>${para(150)}</p><h2>Limits</h2><p>${para(150)}</p>`;
  assert.equal(findings('question-headings', page(body)).length, 1);
  assert.deepEqual(findings('question-headings', page(body.replace('<h2>Pricing</h2>', '<h2>How much does Acme cost?</h2>'))), []);
  assert.deepEqual(findings('question-headings', page('<h1>A</h1><h2>B</h2><p>short</p>')), []);
});

test('long-paragraphs: over 150 words', () => {
  const f = findings('long-paragraphs', page(`<h1>A</h1><p>${para(200)}</p><p>${para(100)}</p>`));
  assert.equal(f.length, 1);
  assert.match(f[0].message, /200 words/);
});

test('long-paragraphs: also checks components', () => {
  const comp = `export function Story(){ return <section><p>${para(180)}</p></section> }`;
  const f = findings('long-paragraphs', { 'components/Story.tsx': comp });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'components/Story.tsx');
});

test('thin-content: short pages and articles', () => {
  assert.equal(findings('thin-content', page('<h1>A</h1><p>Too short.</p>')).length, 1);
  assert.equal(findings('thin-content', { 'blog/post.html': html({ body: `<h1>Post</h1><p>${para(200)}</p>` }) }).length, 1);
  assert.deepEqual(findings('thin-content', { 'blog/post.html': html({ body: `<h1>Post</h1><p>${para(320)}</p>` }) }), []);
  assert.deepEqual(findings('thin-content', { 'login.html': html({ body: '<h1>Log in</h1>' }) }), []);
});

test('table-headers: tables without th', () => {
  const f = findings('table-headers', page('<h1>A</h1><table><tr><td>Free</td><td>£0</td></tr><tr><td>Team</td><td>£20</td></tr></table>'));
  assert.equal(f.length, 1);
  assert.deepEqual(findings('table-headers', page('<h1>A</h1><table><thead><tr><th>Plan</th><th>Price</th></tr></thead><tr><td>Team</td><td>£20</td></tr></table>')), []);
});

test('comparison-format: vs and pricing pages without a table', () => {
  const f = findings('comparison-format', { 'acme-vs-zenith.html': html({ title: 'Acme vs Zenith: which analytics tool fits', body: `<h1>Acme vs Zenith</h1><p>${para(150)}</p>` }) });
  assert.equal(f.length, 1);
  const withTable = findings('comparison-format', { 'acme-vs-zenith.html': html({ title: 'Acme vs Zenith', body: '<h1>Acme vs Zenith</h1><table><tr><th>Tool</th><th>Price</th></tr><tr><td>Acme</td><td>£20</td></tr></table>' }) });
  assert.deepEqual(withTable, []);
});

test('ai-slop-phrases: stock phrases', () => {
  const f = findings('ai-slop-phrases', page("<h1>A</h1><p>In today's fast-paced world, analytics is a game-changer. Let's delve into it.</p>"));
  assert.equal(f.length, 1);
  assert.match(f[0].message, /fast-paced.*game-changer/);
  assert.deepEqual(findings('ai-slop-phrases', page('<h1>A</h1><p>Acme costs £20 per seat.</p>')), []);
});

test('stats-need-sources: numbers without links', () => {
  const f = findings('stats-need-sources', page('<h1>A</h1><p>Retention rose 42% after onboarding changes.</p><p>Churn fell 3x, <a href="https://example.org/study">per the study</a>.</p>'));
  assert.equal(f.length, 1);
  assert.match(f[0].message, /42%/);
});
