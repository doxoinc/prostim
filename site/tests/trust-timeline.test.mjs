import test from 'node:test';
import assert from 'node:assert/strict';
import { trustSummary } from '../src/trust.js';
import { buildSteps, renderRun, inlineMarkdown, summarizeTask } from '../src/timeline.js';

test('trust needs several ratings before it says reliable or caution', () => {
  assert.equal(trustSummary({ scores: [] }).trust, 'new');
  assert.equal(trustSummary({ scores: [5] }).trust, 'member');
  assert.equal(trustSummary({ scores: [5, 5, 5] }).trust, 'reliable');
  assert.equal(trustSummary({ scores: [5, 5, 5, 5, 5, 5, 5, 5] }).trust, 'verified');
  assert.equal(trustSummary({ scores: [1, 1, 2] }).trust, 'caution');
  assert.equal(trustSummary({ scores: [9, 0, 'x'] }).ratingCount, 0, 'invalid scores are ignored');
  const active = trustSummary({ projects: 2, votesReceived: 10, followers: 3 });
  assert.ok(active.level > 1 && active.levelProgress >= 0 && active.levelProgress <= 1);
});

test('tool results attach to their call and the final answer is not repeated', () => {
  const events = [
    { kind: 'start', engine: 'codex', mode: 'edit' },
    { kind: 'tool', id: 'a', tool: 'bash', command: 'npm test' },
    { kind: 'tool_result', id: 'a', ok: false, output: '1 failing' },
    { kind: 'tool', id: 'b', tool: 'edit', path: 'score.js', diff: [{ type: '-', text: 'i = 1' }, { type: '+', text: 'i = 0' }] },
    { kind: 'text', text: 'Исправил score.js' },
    { kind: 'done', ok: true, text: 'Исправил score.js' }
  ];
  const steps = buildSteps(events);
  assert.equal(steps.find(step => step.id === 'a').ok, false);
  assert.deepEqual(summarizeTask(events).files, ['score.js']);
  const html = renderRun({ id: 'k1', status: 'done', createdAt: 0, finishedAt: 5000, events });
  assert.equal(html.match(/Исправил score\.js/g).length, 1);
  assert.match(html, /class="dl del"/);
  assert.match(html, /2 шага/);
});

test('agent text is escaped before light formatting', () => {
  const html = inlineMarkdown('<img src=x onerror=alert(1)> **жирный** `код` [файл](/Users/me/secret.js)');
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /<b>жирный<\/b>/);
  assert.match(html, /<code>код<\/code>/);
  assert.doesNotMatch(html, /\/Users\/me/);
});

test('avatar ring colours: ten tiers, a glow from level 5, a shimmer from 14, a rainbow at the top', async () => {
  const { levelTier, levelTiers } = await import('../src/trust.js');
  assert.equal(levelTiers.length, 10);
  assert.deepEqual([levelTier(1).tier, levelTier(2).tier, levelTier(4).tier, levelTier(6).tier, levelTier(7).tier, levelTier(50).tier], [1, 2, 3, 4, 5, 10]);
  assert.equal(levelTier(4).aura, false);
  assert.equal(levelTier(5).aura, true, 'the ring glows from level 5');
  assert.deepEqual([levelTier(13).strong, levelTier(14).strong], [false, true]);
  assert.equal(levelTier(40).legend, true);
  assert.equal(levelTier(0).tier, 1, 'missing levels count as the first');
  assert.equal(levelTier(10).to, 13);
});
