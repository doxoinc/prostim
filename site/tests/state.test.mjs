import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, safeUrl, toggleMembership, loadState, filterProjects } from '../src/state.js';

test('invalid persisted state recovers and removes malformed records', () => {
  assert.deepEqual(loadState({ getItem: () => 'null' }).votes, []);
  assert.deepEqual(loadState({ getItem: () => '{broken' }).projects, []);
  const state = loadState({ getItem: () => JSON.stringify({ votes: ['a', 'a', 7], comments: { a: [null, { text: 'ok', name: 'Я' }, { text: 4 }] }, projects: [null, { id: 'x', title: 'Title', summary: 'Text', category: 'apps', scene: '<bad>', tags: 'broken', handle: '<bad>', color: 'red;display:none' }] }) });
  assert.deepEqual(state.votes, ['a']);
  assert.equal(state.comments.a.length, 1);
  assert.equal(state.projects[0].scene, 'board');
  assert.deepEqual(state.projects[0].tags, []);
  assert.equal(state.projects[0].handle, 'me');
  assert.equal(state.projects[0].color, '#c4f56f');
  const messages = loadState({ getItem: () => JSON.stringify({ dms: { markv: [{ text: 'Привет', time: 5 }, { text: 3 }], '<bad>': [{ text: 'x' }] }, readiness: ['build', 4] }) });
  assert.deepEqual(messages.dms, { markv: [{ text: 'Привет', time: '' }] });
  assert.deepEqual(messages.readiness, ['build']);
});

test('user content and external links cannot inject markup or script schemes', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('https://example.com'), 'https://example.com/');
});

test('votes are reversible and filtering combines subscriptions and category', () => {
  assert.deepEqual(toggleMembership(toggleMembership([], 'x'), 'x'), []);
  const projects = [{ id: 'a', title: 'Лес', summary: 'Игра', author: 'Марк', handle: 'm', category: 'games' }, { id: 'b', title: 'Доска', summary: 'Задачи', author: 'Алина', handle: 'a', category: 'apps' }];
  assert.deepEqual(filterProjects(projects, { tab: 'follows', follows: ['m'], category: 'apps' }), []);
  assert.equal(filterProjects(projects, { search: 'АЛИНА' })[0].id, 'b');
  assert.equal(filterProjects(projects, { tab: 'saved', saved: ['a'] })[0].id, 'a');
});
