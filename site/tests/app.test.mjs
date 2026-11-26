import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const source = (await Promise.all(['data.js', 'icons.js', 'state.js', 'page.js', 'trust.js', 'timeline.js', 'recommend.js', 'app.js'].map(name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8'))))
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
  assert.match(app.elements.get('main').innerHTML, /Warkuda Games/);
  assert.match(app.elements.get('main').innerHTML, /Eduard Ivanov/);
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

test('steam calculator: 30% to Steam, then 2% of the payout to the publisher', () => {
  const app = createApp();
  app.navigate('#/steam');
  assert.match(app.elements.get('main').innerHTML, /Сколько получит автор/);
  assert.match(app.elements.get('main').innerHTML, /class="iri-text">2%/);
  assert.match(app.elements.get('main').innerHTML, /data-count="98">98%/);
  assert.match(app.elements.get('main').innerHTML, /Bullet Head[\s\S]*The Last of RAM/);
  const values = runInContext('calcValues()', app.context);
  assert.equal(values.gross, 75000);
  assert.equal(values.payout, 52500, 'Steam keeps 30%');
  assert.equal(values.publisher, 1050, 'the publisher takes 2% of the Steam payout');
  assert.equal(values.author, 51450);
});

test('feed order comes from the recommender and survives re-renders', () => {
  const app = createApp();
  const first = runInContext('feedOrder.entries.map(entry => entry.id).join()', app.context);
  assert.equal(first.split(',').length, 4, 'every project is in the first round');
  runInContext('trackSignal(projectById("pulse"), "save"); trackSignal(projectById("pulse"), "view", { dwell: 9000, expected: 4000 })', app.context);
  app.navigate('#/steam');
  app.navigate('#/feed');
  assert.equal(runInContext('feedOrder.entries.map(entry => entry.id).join()', app.context), first, 'order is stable until a refresh');
  assert.ok(runInContext('currentTaste().signals', app.context) >= 2);
  app.navigate('#/me');
  assert.match(app.elements.get('main').innerHTML, /Лента знает тебя/);
});

test('slide dots sit in the bottom info block, above the title', () => {
  const app = createApp();
  const multi = runInContext('demoProjects.find(project => slideKinds(project).length > 1)', app.context);
  assert.ok(multi, 'a seed project has several slides');
  const html = runInContext(`mediaInner(projectById(${JSON.stringify(multi.id)}))`, app.context);
  assert.doesNotMatch(html, /slide-bars/);
  const info = html.slice(html.indexOf('class="card-info"'));
  assert.ok(info.indexOf('slide-dots') > 0 && info.indexOf('slide-dots') < info.indexOf('card-title'), 'dots come before the title inside card-info');
});

test('a post opens as a themed store page; publishing has steps and no stock covers', () => {
  const app = createApp();
  app.navigate('#/project/forest-light');
  const page = app.elements.get('#modal').innerHTML;
  assert.match(page, /class="store pf-serif themed is-dark"/);
  assert.match(page, /Лес, который помнит/);
  assert.match(page, /Стадия<\/small><b>Прототип/);
  runInContext('openPublish()', app.context);
  const form = app.elements.get('#modal').innerHTML;
  assert.match(form, /wizard-steps/);
  assert.match(form, /data-pane="3"/);
  assert.doesNotMatch(form, /cover-picker|Интерфейс/);
});

test('profiles show a rating gauge of rounded segments and the level as a chip, not an XP bar', () => {
  const app = createApp();
  app.navigate('#/me');
  const html = app.elements.get('main').innerHTML;
  assert.match(html, /class="lvl lvl-profile/);
  const profileGauge = html.match(/class="lvl lvl-profile[\s\S]*?<\/button>/)[0];
  assert.equal((profileGauge.match(/<path d="M/g) || []).length, 16, 'the profile gauge has 16 segments');
  assert.match(html, /class="lvl-badge">—</, 'no ratings yet');
  assert.match(html, /class="level-chip"[^>]*><i><\/i>Ур\. 1/);
  const gauge = runInContext('gaugeSvg({ ratingCount: 3, ratingAverage: 4.7 }, levelTier(6))', app.context);
  assert.equal((gauge.match(/class="on"/g) || []).length, 11, '4,7 of 5 lights 11 of 12 segments');
  assert.equal(runInContext('ratingText(4)', app.context), '4,0');
  assert.doesNotMatch(html, /class="level"/);
  const items = runInContext('viewerItemsFor(projectById("forest-light"))', app.context);
  assert.equal(items.length, 3, 'every slide of a post can be opened full screen');
});
