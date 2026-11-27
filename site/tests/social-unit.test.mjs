import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFeedPrefs, withFeedPref, searchProjects, commentDigest, sortComments, cleanReview, feedbackKind, demoRating } from '../src/social.js';
import { rankFeed, hiddenByPrefs, emptyTaste } from '../src/recommend.js';
import { normalizeUrl, cleanDemoUrl, cleanPage, linkKind, cleanFocus, pageHtml } from '../src/page.js';
import { parseMeta, htmlToText, steamDraft, githubDraft, pageFromText, metaDraft } from '../server/linkpreview.mjs';

test('links without https:// are accepted, other schemes are not', () => {
  assert.equal(normalizeUrl('t.me/game_channel'), 'https://t.me/game_channel');
  assert.equal(normalizeUrl('  www.mygame.ru/demo  '), 'https://www.mygame.ru/demo');
  assert.equal(normalizeUrl('http://site.com'), 'http://site.com/');
  assert.equal(normalizeUrl('javascript:alert(1)'), '');
  assert.equal(normalizeUrl('localhost:3000'), '');
  assert.equal(normalizeUrl('просто текст'), '');
  assert.equal(linkKind('store.steampowered.com/app/1').kind, 'steam');
  assert.deepEqual(cleanPage([{ type: 'button', url: 't.me/x', label: 'Канал' }, { type: 'button', url: 'нет ссылки' }]), [{ type: 'button', url: 'https://t.me/x', label: 'Канал' }]);
});

test('a demo link can be pasted as a URL or as an embed code', () => {
  assert.equal(cleanDemoUrl('user.github.io/game'), 'https://user.github.io/game');
  assert.equal(cleanDemoUrl('<iframe frameborder="0" src="https://itch.io/embed-upload/123?color=333333&amp;x=1" allowfullscreen width="980"></iframe>'), 'https://itch.io/embed-upload/123?color=333333&x=1');
  assert.equal(cleanDemoUrl('http://insecure.example/game'), '', 'http would be blocked inside an https page');
  assert.equal(cleanDemoUrl('<iframe src="javascript:alert(1)">'), '');
});

test('feed preferences: one list per key, more and less change the order, hidden drops posts', () => {
  let prefs = cleanFeedPrefs({ more: ['tag:Пиксель-арт', 'bad key'], hidden: ['author:spam'] });
  assert.deepEqual(prefs, { more: ['tag:пиксель-арт'], less: [], hidden: ['author:spam'] });
  prefs = withFeedPref(prefs, 'tag:пиксель-арт', 'less');
  assert.deepEqual(prefs.more, []);
  assert.deepEqual(prefs.less, ['tag:пиксель-арт']);
  const posts = [
    { id: 'a', category: 'games', tags: ['Пиксель-арт'], handle: 'ann', createdAt: 0 },
    { id: 'b', category: 'apps', tags: ['Заметки'], handle: 'bob', createdAt: 0 },
    { id: 'c', category: 'games', tags: ['Хоррор'], handle: 'spam', createdAt: 0 }
  ];
  assert.equal(hiddenByPrefs(posts[2], prefs), true);
  assert.equal(hiddenByPrefs(posts[0], prefs), false);
  const order = prefs => rankFeed(posts.slice(0, 2), { seed: 1, now: 1, prefs }).map(item => item.project.id);
  assert.deepEqual(order({ more: ['tag:пиксель-арт'], less: [], hidden: [] }), ['a', 'b']);
  assert.deepEqual(order({ more: [], less: ['tag:пиксель-арт'], hidden: [] }), ['b', 'a']);
});

test('reposts by people I follow and fresh updates lift a post and say why', () => {
  const now = Date.UTC(2026, 10, 1);
  const taste = emptyTaste();
  taste.seen = { old: { n: 3, last: now - 5 * 864e5, done: 1 } };
  const posts = [
    { id: 'old', category: 'games', tags: [], handle: 'ann', createdAt: now - 30 * 864e5, lastUpdateAt: now - 3600e3 },
    { id: 'shared', category: 'apps', tags: [], handle: 'bob', createdAt: now - 30 * 864e5 },
    { id: 'plain', category: 'tools', tags: [], handle: 'cid', createdAt: now - 30 * 864e5 }
  ];
  const ranked = rankFeed(posts, { taste, now, seed: 3, watching: ['old'], reposts: new Map([['shared', 'dan']]) });
  const byId = Object.fromEntries(ranked.map(item => [item.project.id, item]));
  assert.equal(byId.old.reason, 'update');
  assert.equal(byId.shared.reason, 'repost');
  assert.equal(byId.shared.by, 'dan');
  assert.ok(byId.shared.score > byId.plain.score);
});

test('search finds words in pages and updates, with a highlighted snippet', () => {
  const posts = [
    { id: 'a', title: 'Лесной свет', summary: 'Медитативная игра', tags: ['Пиксель-арт'], handle: 'mark', author: 'Марк', page: [{ type: 'text', text: 'Исследуй туманный лес и собирай светлячков ночью' }] },
    { id: 'b', title: 'Пульс', summary: 'Аналитика', tags: [], handle: 'dan', author: 'Дан', updates: [{ title: 'Тёмная тема', text: 'Добавили светлячков в интерфейс' }] },
    { id: 'c', title: 'Контур', summary: 'Задачи', tags: [], handle: 'ali', author: 'Алина' }
  ];
  const found = searchProjects(posts, 'светлячки');
  assert.deepEqual(found.map(item => item.project.id).sort(), ['a', 'b']);
  assert.match(found.find(item => item.project.id === 'a').snippet, /<mark>светляч<\/mark>ков/i);
  assert.deepEqual(searchProjects(posts, 'лесной пиксель').map(item => item.project.id), ['a'], 'every word has to match');
  assert.deepEqual(searchProjects(posts, '@dan').map(item => item.project.id), ['b']);
  assert.deepEqual(searchProjects(posts, 'x'), [], 'one letter is not a query');
  assert.equal(searchProjects([{ id: 'x', title: '<b>', summary: 'тег <script>', tags: [] }], 'тег')[0].snippet.includes('<script>'), false);
});

test('a comment thread without AI gets an honest digest', () => {
  const digest = commentDigest([
    { text: 'Очень круто, графика огонь' }, { text: 'Графика супер, а когда демо?' }, { text: 'Вылетает на втором уровне, баг' }, { voice: '/uploads/a-1.weba' }
  ]);
  assert.match(digest.summary, /^4 комментария\. /);
  assert.match(digest.summary, /графика/);
  assert.deepEqual(digest.points, ['Хвалят: 2', 'Жалобы и баги: 1', 'Вопросы автору: 1', 'Голосовых: 1']);
  assert.equal(commentDigest([]).summary, 'Комментариев пока нет');
});

test('store pages become drafts: Open Graph, Steam and GitHub', () => {
  const html = '<html><head><title>Fallback</title><meta property="og:title" content="Star &amp; Sea | itch.io"><meta property="og:description" content="Сплав по реке"><meta property="og:image" content="/cover.png"><meta name="keywords" content="roguelike, pixel"></head><body>https://img.itch.zone/aW1n/1.png</body></html>';
  const meta = parseMeta(html, 'https://dev.itch.io/star');
  assert.deepEqual(meta, { title: 'Star & Sea | itch.io', description: 'Сплав по реке', site: '', keywords: ['roguelike', 'pixel'], images: ['https://dev.itch.io/cover.png'] });
  const draft = metaDraft(meta, html, 'https://dev.itch.io/star');
  assert.equal(draft.title, 'Star & Sea');
  assert.equal(draft.category, 'games');
  assert.deepEqual(draft.images, ['https://dev.itch.io/cover.png', 'https://img.itch.zone/aW1n/1.png']);
  assert.equal(htmlToText('<p>Один</p><ul><li>Два</li><li>Три &amp; четыре</li></ul>'), 'Один\n• Два\n• Три & четыре');
  const steam = steamDraft({ name: 'Between Shores', short_description: 'Кооперативный сплав', about_the_game: '<p>Долгий текст про игру, в которой вы плывёте по реке и строите лагерь на берегу.</p><ul><li>Кооператив до 4 игроков</li><li>Процедурные реки</li></ul>', header_image: 'https://cdn/h.jpg', screenshots: [{ path_full: 'https://cdn/1.jpg' }], genres: [{ description: 'Инди' }], platforms: { windows: true, mac: false, linux: true }, is_free: false, release_date: { coming_soon: true }, demos: [{ appid: 2 }] }, 'https://store.steampowered.com/app/1/');
  assert.deepEqual([steam.title, steam.summary, steam.category, steam.pricing, steam.stage], ['Between Shores', 'Кооперативный сплав', 'games', 'paid', 'demo']);
  assert.deepEqual(steam.platforms, ['windows', 'linux']);
  assert.deepEqual(steam.images, ['https://cdn/h.jpg', 'https://cdn/1.jpg']);
  assert.deepEqual(steam.page.map(block => block.type), ['heading', 'text', 'list']);
  assert.deepEqual(steam.page[2].items, ['Кооператив до 4 игроков', 'Процедурные реки']);
  const repo = githubDraft({ name: 'tiny-engine', description: 'A tiny game engine', topics: ['gamedev'], language: 'C', homepage: 'https://tiny.dev', owner: { login: 'kit' } }, '# Tiny\n\n![shot](docs/shot.png) ![badge](https://img.shields.io/x.svg)\n\nA tiny engine for jams, written in plain C with no dependencies at all.\n\n- Fast\n- Small', 'https://github.com/kit/tiny-engine');
  assert.equal(repo.title, 'tiny engine');
  assert.equal(repo.pricing, 'open');
  assert.deepEqual(repo.links, ['https://github.com/kit/tiny-engine', 'https://tiny.dev']);
  assert.deepEqual(repo.images, ['https://raw.githubusercontent.com/kit/tiny-engine/HEAD/docs/shot.png', 'https://opengraph.githubassets.com/1/kit/tiny-engine']);
  assert.deepEqual(pageFromText('', 'О проекте'), []);
});

test('comments: pinned first, then best mixes fresh and liked, replies stay in order under their thread', () => {
  const now = Date.UTC(2026, 10, 27, 12);
  const hour = 36e5;
  const list = [
    { id: 'old-liked', likes: 9, createdAt: now - 30 * hour },
    { id: 'fresh', likes: 0, createdAt: now - 0.2 * hour },
    { id: 'pin', likes: 0, createdAt: now - 50 * hour, pinned: true },
    { id: 'mid', likes: 2, createdAt: now - 2 * hour },
    { id: 'r2', replyTo: 'mid', createdAt: now - 0.5 * hour },
    { id: 'r1', replyTo: 'mid', createdAt: now - hour },
    { id: 'orphan', replyTo: 'gone', createdAt: now - 3 * hour }
  ];
  const ids = mode => sortComments(list, mode, now).map(({ comment }) => comment.id);
  assert.deepEqual(ids('new'), ['pin', 'fresh', 'mid', 'orphan', 'old-liked']);
  assert.deepEqual(ids('top'), ['pin', 'old-liked', 'mid', 'fresh', 'orphan']);
  assert.deepEqual(ids('best').slice(0, 2), ['pin', 'mid'], 'liked and answered recent comment beats a lone fresh one');
  assert.deepEqual(sortComments(list, 'best', now).find(({ comment }) => comment.id === 'mid').replies.map(reply => reply.id), ['r1', 'r2']);
});

test('discovery puts topics the person has not met before the familiar ones', () => {
  const taste = emptyTaste();
  taste.weights = { 'cat:games': 6, 'tag:хоррор': 5 };
  taste.signals = 20;
  const posts = [
    { id: 'known', category: 'games', tags: ['Хоррор'], handle: 'a', createdAt: 0 },
    { id: 'new-topic', category: 'tools', tags: ['Музыка'], handle: 'b', createdAt: 0 }
  ];
  assert.equal(rankFeed(posts, { taste, now: 1, seed: 2 })[0].project.id, 'known');
  const discovered = rankFeed(posts, { taste, now: 1, seed: 2, mode: 'discover' });
  assert.equal(discovered[0].project.id, 'new-topic');
  assert.equal(discovered[0].reason, 'discover');
});

test('pictures keep a focus point and page images a chosen shape', () => {
  assert.deepEqual(cleanFocus([12.4, 80]), [12, 80]);
  assert.equal(cleanFocus([50, 50]), null, 'the centre is the default and is not stored');
  assert.equal(cleanFocus(['x', 1]), null);
  assert.deepEqual(cleanFocus([-5, 140]), [0, 100]);
  const blocks = cleanPage([{ type: 'image', url: '/uploads/i-1.png', ratio: '4:5', focus: [30, 20] }, { type: 'image', url: '/uploads/i-2.png', ratio: '7:1', focus: [30, 20] }], block => ({ url: block.url, type: 'image' }));
  assert.deepEqual(blocks, [{ type: 'image', url: '/uploads/i-1.png', ratio: '4:5', focus: [30, 20] }, { type: 'image', url: '/uploads/i-2.png' }]);
  assert.match(pageHtml(blocks), /aspect-ratio:4 \/ 5;object-fit:cover;object-position:30% 20%/);
});

test('a demo review keeps stars from 1 to 5 and known marks only', () => {
  assert.deepEqual(cleanReview({ stars: 4.6, tags: ['controls', 'hack', 'controls', 'bugs'] }), { stars: 5, tags: ['controls', 'bugs'] });
  assert.equal(cleanReview({ stars: 0 }), null);
  assert.equal(cleanReview({ stars: 9 }), null);
  assert.equal(cleanReview('5'), null);
});

test('feedback is sorted into bugs, requests, questions and praise', () => {
  assert.equal(feedbackKind('Вылетает на втором уровне, добавьте сохранение'), 'bug', 'a crash comes first even when it asks for more');
  assert.equal(feedbackKind('Добавьте кооператив, пожалуйста'), 'idea');
  assert.equal(feedbackKind('А когда выйдет на Android?'), 'question');
  assert.equal(feedbackKind('Очень красиво, круто!'), 'praise');
  assert.equal(feedbackKind('', { stars: 5, tags: [] }), 'praise');
  assert.equal(feedbackKind('', { stars: 3, tags: ['slow'] }), 'bug');
  assert.equal(feedbackKind('На телефоне управление неудобное, кнопки мелкие'), 'bug', 'a problem with controls is something to fix');
  assert.equal(feedbackKind('Привет'), 'other');
});

test('the demo score counts the latest review of each person once', () => {
  assert.deepEqual(demoRating([
    { userId: 'a', review: { stars: 2 } }, { userId: 'b', review: { stars: 5 } }, { userId: 'a', review: { stars: 4 } }, { userId: 'c', text: 'без оценки' }
  ]), { average: 4.5, count: 2 });
  assert.deepEqual(demoRating([]), { average: 0, count: 0 });
});
