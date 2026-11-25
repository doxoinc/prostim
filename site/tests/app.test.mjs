import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const source = (await Promise.all(['data.js', 'icons.js', 'state.js', 'trust.js', 'timeline.js', 'app.js'].map(name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8'))))
  .map(content => content.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''))
  .join('\n');

function createApp() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, {
        innerHTML: '', value: '', scrollTop: 0, open: false, dataset: {}, textContent: '',
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {}, setAttribute() {}, removeAttribute() {},
        showModal() { this.open = true; }, close() { this.open = false; }, focus() {}
      });
    }
    return elements.get(selector);
  }
  const storage = new Map();
  const location = { hash: '#/feed', href: 'file:///tmp/index.html', origin: 'null' };
  const window = {
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    addEventListener: (name, listener) => windowListeners.set(name, listener)
  };
  const document = {
    body: { dataset: {} },
    querySelector: element,
    querySelectorAll: () => ['feed', 'steam', 'ai'].map(section => ({ ...element(section), dataset: { section } })),
    addEventListener(name, listener) {
      documentListeners.set(name, [...(documentListeners.get(name) || []), listener]);
    },
    removeEventListener() {}
  };
  const context = createContext({ document, window, location, history: { back() {} }, navigator: {}, URL, Map, Set, FormData, Blob, TextDecoder, Uint8Array, AbortSignal, atob, setTimeout, clearTimeout, console, crypto: globalThis.crypto });
  runInContext(source, context);
  return {
    context, elements, documentListeners,
    navigate(hash) { location.hash = hash; windowListeners.get('hashchange')(); },
    dispatch(name, target) { for (const listener of documentListeners.get(name) || []) listener({ target, preventDefault() {}, stopPropagation() {} }); }
  };
}

test('normal app entry renders all main sections and direct project links', () => {
  const app = createApp();
  assert.match(app.elements.get('main').innerHTML, /Лесной свет/);
  app.navigate('#/steam');
  assert.match(app.elements.get('main').innerHTML, /Выпускаем твою игру/);
  assert.match(app.elements.get('main').innerHTML, /Дорожная карта/);
  app.navigate('#/steam/studio');
  assert.match(app.elements.get('main').innerHTML, /Warcuda Games/);
  app.navigate('#/steam/discussions');
  assert.match(app.elements.get('main').innerHTML, /Обсуждения Steam/);
  app.navigate('#/ai/connections');
  assert.match(app.elements.get('main').innerHTML, /Подключи проект/);
  app.navigate('#/ai/connect/cloud');
  assert.match(app.elements.get('main').innerHTML, /Google Drive/);
  app.navigate('#/ai');
  assert.match(app.elements.get('main').innerHTML, /Claude Code и Codex/);
  app.navigate('#/ai/editor');
  assert.match(app.elements.get('main').innerHTML, /Файлы проекта/);
  app.navigate('#/project/forest-light');
  assert.equal(app.elements.get('#modal').open, true);
  assert.match(app.elements.get('#modal').innerHTML, /Лесной свет/);
});

test('editor draft prompt survives switching files', async () => {
  const app = createApp();
  app.navigate('#/ai/editor');
  app.dispatch('input', { id: 'prompt', value: 'Незаконченная задача', name: '' });
  app.dispatch('click', { closest: selector => selector === '[data-action]' ? { dataset: { action: 'file', path: 'app.js' } } : null });
  assert.match(app.elements.get('main').innerHTML, /Незаконченная задача/);
  assert.match(app.elements.get('main').innerHTML, /file-row active[^>]*data-path="app.js"/);
});

test('sharing a bundled file uses a valid file URL', async () => {
  const app = createApp();
  runInContext('navigator.clipboard = { writeText: async value => { globalThis.shared = value; } }', app.context);
  await runInContext('shareProject("forest-light")', app.context);
  assert.equal(app.context.shared, 'file:///tmp/index.html#/project/forest-light');
});

test('bottom-bar pages render: search, inbox, chat, profile, author', () => {
  const app = createApp();
  assert.match(app.elements.get('#dock').innerHTML, /Входящие/);
  assert.match(app.elements.get('#topbar').innerHTML, /class="active"[^>]*>Лента</);
  app.navigate('#/search');
  assert.match(app.elements.get('main').innerHTML, /Авторы/);
  app.navigate('#/inbox');
  assert.match(app.elements.get('main').innerHTML, /Марк Ветров/);
  app.navigate('#/inbox/markv');
  assert.match(app.elements.get('main').innerHTML, /dm-form/);
  assert.doesNotMatch(app.elements.get('#dock').innerHTML, /class="badge"[^>]*>2</);
  app.navigate('#/me/saved');
  assert.match(app.elements.get('main').innerHTML, /Сохраняй проекты из ленты/);
  app.navigate('#/u/alinar');
  assert.match(app.elements.get('main').innerHTML, /Алина Русу/);
});

test('steam calculator splits revenue after the 30% store share', () => {
  const app = createApp();
  app.navigate('#/steam');
  assert.match(app.elements.get('main').innerHTML, /Сколько получит автор/);
  const values = runInContext('calcValues()', app.context);
  assert.equal(values.gross, 75000);
  assert.equal(values.author, 36750);
});
