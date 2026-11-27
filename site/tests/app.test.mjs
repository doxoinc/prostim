import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const source = (await Promise.all(['data.js', 'icons.js', 'state.js', 'page.js', 'chat.js', 'ads.js', 'social.js', 'trust.js', 'timeline.js', 'recommend.js', 'app.js'].map(name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8'))))
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
  assert.doesNotMatch(app.elements.get('main').innerHTML, /Лента знает тебя/, 'the taste card left the profile');
  runInContext('openFeedPrefs()', app.context);
  assert.match(app.elements.get('#modal').innerHTML, /Что лента узнала сама/);
});

test('feed modes: following shows followed authors first, discovery leads with the unknown', () => {
  const app = createApp();
  runInContext('state.follows = ["danm"]; setFeedMode("following")', app.context);
  const following = runInContext('feedOrder.entries.filter(entry => entry.id || entry.sep).map(entry => entry.sep || entry.id).join()', app.context);
  assert.match(following, /^pulse,following-end,/);
  assert.match(app.elements.get('#topbar').innerHTML, /class="mode-toggle custom"/, 'a non-default mode is marked on the switch');
  assert.match(app.elements.get('#topbar').innerHTML, /role="menuitemradio" aria-checked="true" class="on" data-action="feed-mode" data-mode="following"/);
  assert.doesNotMatch(app.elements.get('main').innerHTML, /feed-modes/, 'no second row over the feed');
  runInContext('setFeedMode("discover")', app.context);
  assert.equal(runInContext('feedOrder.key', app.context), 'discover:all');
  runInContext('setFeedMode("foryou")', app.context);
});

test('settings page: theme, privacy and feed controls in one place', () => {
  const app = createApp();
  app.navigate('#/settings');
  const html = app.elements.get('main').innerHTML;
  assert.match(html, /Как на устройстве/);
  assert.match(html, /Экономия трафика/);
  assert.match(html, /Твоя лента/);
  runInContext('chooseSetting("theme", "light")', app.context);
  assert.equal(runInContext('currentTheme()', app.context), 'light');
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

test('chat bubbles: emoji-only text is big, stickers come from the pack, reactions show counts', () => {
  const app = createApp();
  assert.equal(runInContext('onlyEmoji("😍🎮")', app.context), true);
  assert.equal(runInContext('onlyEmoji("ок 👍")', app.context), false);
  const html = runInContext(`bubbleHtml({ id: 'm1', from: 'me', sticker: 'release', reactions: { counts: { '🔥': 2 }, mine: '🔥' }, time: '12:00' }, { id: 'markv', online: true })`, app.context);
  assert.match(html, /is-sticker/);
  assert.match(html, /Релиз!/);
  assert.match(html, /class="reaction on"[^>]*>🔥<b>2<\/b>/);
});

test('agent versions compare as numbers', () => {
  const app = createApp();
  assert.equal(runInContext('versionAtLeast("0.3.0", "0.3.0")', app.context), true);
  assert.equal(runInContext('versionAtLeast("0.10.0", "0.3.0")', app.context), true);
  assert.equal(runInContext('versionAtLeast("0.2.9", "0.3.0")', app.context), false);
  assert.equal(runInContext('versionAtLeast("", "0.3.0")', app.context), false);
});

test('ads go in after every five posts, rotate, and never sit next to the same post', () => {
  const app = createApp();
  const result = JSON.parse(runInContext(`(() => {
    const entries = Array.from({ length: 12 }, (_, index) => ({ id: 'p' + index }));
    const ids = list => list.map(entry => entry.ad || entry.id);
    const rotation = ids(placeAds(entries, [{ id: 'a1', projectId: 'x' }, { id: 'a2', projectId: 'y' }]));
    const state = { since: 0, next: 0 };
    const nextTo = ids(placeAds(entries, [{ id: 'a1', projectId: 'x' }, { id: 'a2', projectId: 'p10' }], state));
    const more = ids(placeAds([{ id: 'q0' }, { id: 'q1' }, { id: 'q2' }], [{ id: 'a1', projectId: 'x' }], state));
    return JSON.stringify({ rotation, nextTo, more, none: placeAds(entries, []).length });
  })()`, app.context));
  assert.deepEqual(result.rotation, ['p0', 'p1', 'p2', 'p3', 'p4', 'a1', 'p5', 'p6', 'p7', 'p8', 'p9', 'a2', 'p10', 'p11']);
  assert.deepEqual(result.nextTo, ['p0', 'p1', 'p2', 'p3', 'p4', 'a1', 'p5', 'p6', 'p7', 'p8', 'p9', 'a1', 'p10', 'p11'], 'the ad for p10 is not put right before p10');
  assert.deepEqual(result.more, ['q0', 'q1', 'q2', 'a1'], 'the count carries over when the feed grows');
  assert.equal(result.none, 12);
});

test('the tab bar hides only for a real keyboard, not for a collapsing browser bar or a zoom', () => {
  const app = createApp();
  const seen = { kb: '', keyboard: null };
  Object.assign(app.context, { innerHeight: 812 });
  app.context.window.visualViewport = { height: 600, offsetTop: 0, scale: 1 };
  app.context.document.documentElement = { style: { setProperty: (name, value) => { seen.kb = value; } } };
  app.context.document.body.classList = { toggle: (name, on) => { if (name === 'keyboard') seen.keyboard = on; } };
  const sync = () => runInContext('syncKeyboard()', app.context);
  app.context.document.activeElement = null;
  sync();
  assert.deepEqual(seen, { kb: '0px', keyboard: false }, 'a shorter screen without a focused field is the browser bar');
  app.context.document.activeElement = { tagName: 'INPUT', type: 'text', closest: () => null };
  sync();
  assert.deepEqual(seen, { kb: '212px', keyboard: true });
  app.context.window.visualViewport.scale = 2;
  sync();
  assert.equal(seen.keyboard, false, 'pinch zoom is not a keyboard');
  app.context.window.visualViewport.scale = 1;
  app.context.document.activeElement = { tagName: 'INPUT', type: 'checkbox', closest: () => null };
  sync();
  assert.equal(seen.keyboard, false, 'a checkbox does not open a keyboard');
  app.context.window.visualViewport.height = 760;
  app.context.document.activeElement = { tagName: 'TEXTAREA', closest: () => null };
  sync();
  assert.equal(seen.keyboard, false, 'a small change is a toolbar, not a keyboard');
});
