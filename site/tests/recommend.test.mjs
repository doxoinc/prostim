import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTaste, emptyStats, cleanTaste, recordSignal, recordStat, rankFeed, projectQuality, expectedDwell, topInterests, viewValue } from '../src/recommend.js';

const hour = 36e5;
const now = Date.UTC(2026, 10, 26, 12);
const catalogue = [
  { id: 'forest', category: 'games', tags: ['Приключение', 'PC'], handle: 'markv', votes: 120, createdAt: now - 30 * hour },
  { id: 'shores', category: 'games', tags: ['История', 'PC'], handle: 'markv', votes: 40, createdAt: now - 60 * hour },
  { id: 'board', category: 'apps', tags: ['Продуктивность', 'Web'], handle: 'alinar', votes: 80, createdAt: now - 20 * hour },
  { id: 'pulse', category: 'tools', tags: ['Аналитика', 'Web'], handle: 'danm', votes: 60, createdAt: now - 10 * hour }
];
const order = ranked => ranked.map(item => item.project.id);

test('a small catalogue is reordered, never filtered, whatever the taste', () => {
  const taste = emptyTaste();
  for (const project of catalogue) recordSignal(taste, project, { type: 'hide' }, now);
  const ranked = rankFeed(catalogue, { taste, now });
  assert.deepEqual([...order(ranked)].sort(), catalogue.map(project => project.id).sort());
});

test('the feed learns: watching and saving apps pulls apps up, quick skips push games down', () => {
  const coldStart = order(rankFeed(catalogue, { now, seed: 7 }));
  const taste = emptyTaste();
  for (let round = 0; round < 6; round += 1) {
    recordSignal(taste, catalogue[2], { type: 'view', dwell: 9000, expected: 4000 }, now - hour);
    recordSignal(taste, catalogue[0], { type: 'view', dwell: 400, expected: 4000 }, now - hour);
    recordSignal(taste, catalogue[1], { type: 'view', dwell: 600, expected: 4000 }, now - hour);
  }
  recordSignal(taste, catalogue[2], { type: 'save' }, now - hour);
  taste.seen = {};
  const learned = order(rankFeed(catalogue, { taste, now, seed: 7 }));
  assert.equal(coldStart[0], 'pulse', 'with no history the freshest strong post leads');
  assert.equal(learned[0], 'board');
  assert.ok(learned.indexOf('forest') > learned.indexOf('pulse'), 'skipped games fall below untouched tools');
  assert.deepEqual(topInterests(taste).slice(0, 2).map(item => item.value), ['alinar', 'apps'], 'the loved author and category lead the interests');
});

test('unseen posts lead; once all are seen, the one seen longest ago comes back first', () => {
  const taste = emptyTaste();
  recordSignal(taste, catalogue[0], { type: 'view', dwell: 6000, expected: 4000 }, now);
  assert.equal(order(rankFeed(catalogue, { taste, now, seed: 3 })).at(-1), 'forest');
  const later = now + 30 * hour;
  for (const project of catalogue.slice(1)) recordSignal(taste, project, { type: 'view', dwell: 5000, expected: 4000 }, later);
  assert.equal(order(rankFeed(catalogue, { taste, now: later, seed: 3 }))[0], 'forest');
});

test('the same author does not appear twice in a row when there is a choice', () => {
  const ranked = order(rankFeed(catalogue, { now, seed: 11 }));
  const authors = ranked.map(id => catalogue.find(project => project.id === id).handle);
  for (let index = 1; index < authors.length; index += 1) assert.notEqual(authors[index], authors[index - 1]);
});

test('post interest combines saves, votes and how long people stay', () => {
  const held = emptyStats();
  const skipped = emptyStats();
  for (let index = 0; index < 40; index += 1) {
    recordStat(held, { type: 'view', dwell: 7000, expected: 4000 });
    recordStat(skipped, { type: 'view', dwell: 500, expected: 4000 });
  }
  const base = { votes: 10, saves: 2 };
  assert.ok(projectQuality(base, held).score > projectQuality(base, skipped).score + 0.2);
  assert.ok(projectQuality({ votes: 10, saves: 20 }, held).score > projectQuality(base, held).score);
  assert.ok(projectQuality(base, held).retention > 0.8);
  assert.ok(projectQuality(base, {}).retention > 0.4 && projectQuality(base, {}).retention < 0.5, 'no data means a neutral prior, not zero');
});

test('dwell scoring and stored tastes are bounded and sanitised', () => {
  assert.ok(viewValue(500, 4000) < 0);
  assert.ok(viewValue(8000, 4000) > viewValue(3000, 4000));
  assert.equal(expectedDwell({ slides: 3 }), 6500);
  assert.equal(expectedDwell({}, 12), 12000);
  const taste = cleanTaste({ signals: 'x', weights: { 'cat:games': 99, '<script>': 1, 'tag:ok': 'NaN' }, seen: { '../x': { n: 1 } } });
  assert.deepEqual(taste.weights, { 'cat:games': 12 });
  assert.deepEqual(taste.seen, {});
  assert.equal(taste.signals, 0);
});
