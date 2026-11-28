import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Notifications, push delivery, updates, reposts, comments, reports, blocks and posts from links,
// against a real server with a stand-in push service and stand-in web pages.

const root = fileURLToPath(new URL('../', import.meta.url));
const port = 4900 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
let server;
let dataDir;
let mock;
let mockUrl;
const pushes = [];

function startMock() {
  mock = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/push/')) {
      pushes.push({ path: url.pathname, headers: request.headers, body: Buffer.concat(chunks) });
      response.writeHead(url.pathname === '/push/gone' ? 410 : 201);
      return response.end();
    }
    if (url.pathname === '/game') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(`<html><head><meta property="og:title" content="Тихая гавань — сайт"><meta property="og:description" content="Уютная игра про маяк и шторм."><meta property="og:image" content="${mockUrl}/cover.png"></head><body></body></html>`);
    }
    if (url.pathname === '/cover.png') { response.writeHead(200, { 'Content-Type': 'image/png' }); return response.end(png); }
    if (url.pathname === '/framed') { response.writeHead(200, { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' }); return response.end('<html></html>'); }
    response.writeHead(404);
    response.end();
  });
  return new Promise(resolve => mock.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${mock.address().port}`)));
}

test.before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'prostim-social-'));
  mockUrl = await startMock();
  server = spawn(process.execPath, [path.join(root, 'server/index.mjs')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, DATABASE_URL: '', MAIL_TRANSPORT: 'outbox', REQUIRE_EMAIL: '0', PUSH_TEST_ENDPOINTS: '1', LINK_PREVIEW_ALLOW_LOCAL: '1', REPORT_HIDE: '2', AUTH_LIMIT: '500', ANTHROPIC_API_KEY: '', DEMO_ADS: '0', YOOKASSA_SHOP_ID: '', YOOKASSA_SECRET_KEY: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server did not start');
});

test.after(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
  mock?.close();
  await rm(dataDir, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, url, body, headers = {}) => {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(`${base}${url}`, { method, headers: { ...(method === 'GET' || raw ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: method === 'GET' ? undefined : raw ? body : JSON.stringify(body ?? {}) });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
}

async function person(handle) {
  const call = client();
  assert.equal((await call('POST', '/api/auth/register', { handle, name: handle[0].toUpperCase() + handle.slice(1), password: 'secret12' })).status, 200);
  return call;
}

async function project(call, title, extra = {}) {
  const result = await call('POST', '/api/projects', { title, summary: `${title} — коротко`, category: 'games', ...extra });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.project;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function decrypt(body, receiver, auth) {
  const salt = body.subarray(0, 16);
  const keyLength = body[20];
  const senderKey = body.subarray(21, 21 + keyLength);
  const data = body.subarray(21 + keyLength);
  const shared = receiver.computeSecret(senderKey);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), receiver.getPublicKey(), senderKey]), 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(data.subarray(-16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]);
  return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString('utf8'));
}

test('follows, support and comments become notifications and encrypted pushes', async () => {
  const ann = await person('annpush');
  const bob = await person('bobpush');
  const config = (await ann('GET', '/api/bootstrap')).body.config;
  assert.equal(Buffer.from(config.push, 'base64url').length, 65, 'the browser gets the VAPID public key');
  const receiver = createECDH('prime256v1');
  receiver.generateKeys();
  const auth = randomBytes(16);
  const keys = { p256dh: receiver.getPublicKey().toString('base64url'), auth: auth.toString('base64url') };
  assert.equal((await ann('POST', '/api/push/subscribe', { endpoint: 'https://evil.example/push', keys })).status, 400, 'unknown push services are refused');
  assert.equal((await ann('POST', '/api/push/subscribe', { endpoint: `${mockUrl}/push/ann`, keys, tz: 'Europe/Chisinau' })).body.devices, 1);

  const post = await project(ann, 'Маяк');
  await bob('POST', '/api/users/annpush/follow');
  await bob('POST', `/api/projects/${post.id}/vote`);
  await bob('POST', `/api/projects/${post.id}/comments`, { text: 'Когда демо?' });
  await wait(300);
  const list = (await ann('GET', '/api/notifications')).body;
  assert.equal(list.unread, 3);
  assert.deepEqual(list.items.map(item => item.type), ['comment', 'like', 'follow']);
  assert.equal(list.items[0].text, 'Bobpush комментирует «Маяк»: «Когда демо?»');
  assert.equal(list.items[0].url, `/#/project/${post.id}`);
  assert.equal((await ann('GET', '/api/bootstrap')).body.activity.unread, 3);

  const delivered = pushes.filter(item => item.path === '/push/ann');
  assert.equal(delivered.length, 3);
  assert.match(delivered[0].headers.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
  assert.equal(delivered[0].headers['content-encoding'], 'aes128gcm');
  const messages = delivered.map(item => decrypt(item.body, receiver, auth));
  assert.deepEqual(messages.map(message => message.body), ['Новый подписчик: Bobpush', 'Bobpush поддерживает «Маяк»', 'Bobpush комментирует «Маяк»: «Когда демо?»']);
  assert.equal(messages[2].url, `/#/project/${post.id}`);

  // Turning a kind off stops its pushes but keeps the list.
  await ann('PATCH', '/api/me', { notify: { comments: false } });
  await bob('POST', `/api/projects/${post.id}/comments`, { text: 'И ещё вопрос' });
  await wait(200);
  assert.equal(pushes.filter(item => item.path === '/push/ann').length, 3);
  assert.equal((await ann('GET', '/api/notifications')).body.unread, 4);
  assert.equal((await ann('POST', '/api/notifications/read')).body.unread, 0);

  // A gone subscription is forgotten.
  await bob('POST', '/api/push/subscribe', { endpoint: `${mockUrl}/push/gone`, keys });
  assert.deepEqual((await bob('POST', '/api/push/test')).body, { devices: 0, delivered: 0 });
});

test('several people supporting one post pile into one row', async () => {
  const owner = await person('pileowner');
  const post = await project(owner, 'Куча');
  for (const name of ['pileone', 'piletwo', 'pilethree']) await (await person(name))('POST', `/api/projects/${post.id}/vote`);
  const items = (await owner('GET', '/api/notifications')).body.items;
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Pilethree и ещё 2 поддерживают «Куча»');
});

test('updates reach people who follow the project, and reposts reach the author', async () => {
  const dev = await person('devlogger');
  const fan = await person('devfan');
  const post = await project(dev, 'Девлог');
  assert.equal((await fan('POST', `/api/projects/${post.id}/watch`)).body.watching, true);
  assert.equal((await fan('POST', `/api/projects/${post.id}/updates`, { title: 'Взлом' })).status, 403);
  const updated = (await dev('POST', `/api/projects/${post.id}/updates`, { version: '0.2', title: 'Новые уровни', text: 'Три острова' })).body.project;
  assert.equal(updated.updates[0].title, 'Новые уровни');
  assert.equal(updated.watchers, 1);
  assert.ok(updated.lastUpdateAt > 0);
  assert.equal((await fan('GET', '/api/notifications')).body.items[0].text, 'Новое в «Девлог»: «0.2 · Новые уровни»');
  const fanBoot = (await fan('GET', '/api/bootstrap')).body;
  assert.deepEqual(fanBoot.watching, [post.id]);

  const repost = (await fan('POST', `/api/projects/${post.id}/repost`)).body;
  assert.equal(repost.reposted, true);
  assert.deepEqual(repost.project.reposters, ['devfan']);
  assert.equal((await dev('POST', `/api/projects/${post.id}/repost`)).status, 400, 'your own post is not reposted');
  assert.equal((await dev('GET', '/api/notifications')).body.items[0].text, 'Devfan делится «Девлог» со своими подписчиками');
  const without = (await dev('DELETE', `/api/projects/${post.id}/updates/${updated.updates[0].id}`)).body.project;
  assert.deepEqual(without.updates, []);
});

test('comments: replies, likes, pins, voice, removal and a digest', async () => {
  const owner = await person('threadowner');
  const guest = await person('threadguest');
  const post = await project(owner, 'Обсуждение');
  const first = (await guest('POST', `/api/projects/${post.id}/comments`, { text: 'Графика супер!' })).body;
  const commentId = first.comment;
  const reply = (await owner('POST', `/api/projects/${post.id}/comments`, { text: 'Спасибо!', replyTo: commentId })).body;
  assert.equal(reply.project.comments.find(item => item.id === reply.comment).replyTo, commentId);
  assert.equal((await guest('GET', '/api/notifications')).body.items[0].type, 'reply');
  assert.deepEqual((await owner('POST', `/api/projects/${post.id}/comments/${commentId}/like`)).body, { liked: true, likes: 1 });
  assert.equal((await guest('POST', `/api/projects/${post.id}/comments/${commentId}/pin`)).status, 403);
  const pinned = (await owner('POST', `/api/projects/${post.id}/comments/${commentId}/pin`)).body.project;
  assert.equal(pinned.comments.find(item => item.id === commentId).pinned, true);
  assert.deepEqual((await guest('GET', '/api/notifications')).body.items.slice(0, 2).map(item => item.type), ['pin', 'comment-like']);

  const webm = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), randomBytes(400)]);
  const upload = await guest('POST', '/api/uploads', webm, { 'Content-Type': 'audio/webm' });
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  assert.match(upload.body.url, /^\/uploads\/a-[\w-]+\.weba$/);
  assert.equal((await guest('POST', `/api/projects/${post.id}/comments`, { voice: upload.body.url, duration: 7 })).status, 402, 'voice comments are part of Plus');
  await guest('POST', '/api/plus/trial');
  const voiced = (await guest('POST', `/api/projects/${post.id}/comments`, { voice: upload.body.url, duration: 7 })).body;
  const voice = voiced.project.comments.find(item => item.id === voiced.comment);
  assert.deepEqual([voice.voice, voice.duration, voice.text], [upload.body.url, 7, '']);
  assert.equal((await fetch(`${base}${upload.body.url}`)).headers.get('content-type'), 'audio/webm');

  await guest('POST', `/api/projects/${post.id}/comments`, { text: 'Когда выйдет демо?' });
  const digest = (await guest('GET', `/api/projects/${post.id}/comments/summary`)).body;
  assert.equal(digest.source, 'auto');
  assert.match(digest.summary, /^4 комментария/);

  assert.equal((await owner('DELETE', `/api/projects/${post.id}/comments/${commentId}`)).status, 200);
  const left = (await guest('GET', '/api/bootstrap')).body.projects.find(item => item.id === post.id).comments;
  assert.equal(left.some(item => item.id === commentId || item.replyTo === commentId), false, 'the comment and its replies are gone');
});

test('reports hide a post after enough people, blocks cut every path', async () => {
  const author = await person('blockauthor');
  const one = await person('reporterone');
  const two = await person('reportertwo');
  const post = await project(author, 'Спорный');
  assert.equal((await one('POST', '/api/reports', { kind: 'project', id: post.id, reason: 'nonsense' })).status, 400);
  assert.deepEqual((await one('POST', '/api/reports', { kind: 'project', id: post.id, reason: 'spam' })).body, { ok: true, hidden: false });
  assert.equal((await one('POST', '/api/reports', { kind: 'project', id: post.id, reason: 'spam' })).body.duplicate, true);
  assert.deepEqual((await two('POST', '/api/reports', { kind: 'project', id: post.id, reason: 'fraud' })).body, { ok: true, hidden: true });
  assert.equal((await one('GET', '/api/bootstrap')).body.projects.some(item => item.id === post.id), false, 'others no longer see it');
  const own = (await author('GET', '/api/bootstrap')).body.projects.find(item => item.id === post.id);
  assert.equal(own.flagged, true, 'the author still sees it, marked');

  const visible = await project(author, 'Обычный');
  await one('POST', '/api/users/blockauthor/follow');
  assert.deepEqual((await author('POST', '/api/users/reporterone/block')).body, { blocked: true });
  assert.equal((await one('POST', '/api/messages/blockauthor', { text: 'привет' })).status, 403);
  assert.equal((await author('POST', '/api/messages/reporterone', { text: 'привет' })).status, 403);
  assert.equal((await one('POST', `/api/projects/${visible.id}/comments`, { text: 'эй' })).status, 404, 'a blocked person does not see the post at all');
  assert.equal((await one('POST', '/api/users/blockauthor/follow')).status, 403);
  const blockedView = (await one('GET', '/api/bootstrap')).body;
  assert.equal(blockedView.projects.some(item => item.id === visible.id), false);
  assert.deepEqual(blockedView.follows, [], 'the follow was removed');
  assert.deepEqual((await author('GET', '/api/bootstrap')).body.blocked, ['reporterone']);
  assert.deepEqual((await author('POST', '/api/users/reporterone/block')).body, { blocked: false });
  assert.equal((await one('POST', '/api/messages/blockauthor', { text: 'мир?' })).status, 200);
});

test('a post can be sent to a chat as a card, feed preferences are kept', async () => {
  const ann = await person('cardann');
  const bob = await person('cardbob');
  const post = await project(ann, 'Открытка');
  const threads = (await ann('POST', '/api/messages/cardbob', { project: post.id })).body.threads;
  assert.equal(threads[0].messages[0].project, post.id);
  assert.equal((await ann('POST', '/api/messages/cardbob', { project: 'nope' })).status, 404);
  const prefs = (await bob('POST', '/api/me/feed-prefs', { more: ['tag:пиксель'], hidden: ['author:cardann', 'junk'] })).body.feedPrefs;
  assert.deepEqual(prefs, { more: ['tag:пиксель'], less: [], hidden: ['author:cardann'] });
  assert.deepEqual((await bob('GET', '/api/bootstrap')).body.feedPrefs, prefs);
});

test('a post is drafted from a page, its pictures are copied, a demo is checked', async () => {
  const dev = await person('linkdev');
  const { draft } = (await dev('POST', '/api/link-preview', { url: `${mockUrl}/game` })).body;
  assert.equal(draft.title, 'Тихая гавань');
  assert.equal(draft.summary, 'Уютная игра про маяк и шторм.');
  assert.deepEqual(draft.images, [`${mockUrl}/cover.png`]);
  const copy = (await dev('POST', '/api/uploads/remote', { url: draft.images[0] })).body;
  assert.match(copy.url, /^\/uploads\/i-[\w-]+\.png$/);
  assert.equal((await dev('POST', '/api/uploads/remote', { url: `${mockUrl}/game` })).status, 415, 'a page is not a picture');
  assert.equal((await dev('POST', '/api/link-preview', { url: `${mockUrl}/missing` })).status, 422);
  assert.equal((await dev('POST', '/api/demo-check', { url: `${mockUrl}/framed` })).status, 400, 'http demos are refused');
  const post = await project(dev, 'С демо', { demo: '<iframe src="https://itch.io/embed-upload/42?color=111111"></iframe>', media: [{ url: copy.url }], links: ['t.me/linkdev'], page: [{ type: 'button', url: 'linkdev.itch.io', label: 'Скачать' }] });
  assert.equal(post.demo, 'https://itch.io/embed-upload/42?color=111111');
  assert.deepEqual(post.links, ['https://t.me/linkdev']);
  assert.deepEqual(post.page, [{ type: 'button', url: 'https://linkdev.itch.io/', label: 'Скачать' }]);
  assert.equal(post.media[0].url, copy.url);
});

test('new accounts get the interest picker once, and the picks seed the feed', async () => {
  const fresh = await person('pickerfresh');
  const author = await person('pickerauthor');
  await project(author, 'Мелодия', { tags: ['Музыка'] });
  assert.equal((await fresh('GET', '/api/bootstrap')).body.account.onboarding, true);
  const result = (await fresh('POST', '/api/me/onboarding', { categories: ['games', 'nope'], goals: ['make'], tags: ['Пиксель-арт', 'Хоррор'], follows: ['pickerauthor', 'nobody'] })).body;
  assert.equal(result.taste.weights['cat:games'], 4);
  assert.equal(result.taste.weights['tag:пиксель-арт'], 3);
  assert.equal(result.taste.weights['cat:tools'], 2, 'people who make games see tools too');
  const after = (await fresh('GET', '/api/bootstrap')).body;
  assert.equal(after.account.onboarding, false);
  assert.deepEqual(after.follows, ['pickerauthor']);
  assert.equal((await author('GET', '/api/notifications')).body.items[0].type, 'follow');
});

test('privacy: who may write and comment, and hidden reposts', async () => {
  const shy = await person('shyauthor');
  const fan = await person('shyfan');
  const post = await project(shy, 'Тишина');
  await shy('PATCH', '/api/me', { privacy: { messages: 'following', comments: 'following', reposts: false } });
  assert.deepEqual((await shy('GET', '/api/bootstrap')).body.account.privacy, { messages: 'following', comments: 'following', reposts: false });
  assert.equal((await fan('POST', '/api/messages/shyauthor', { text: 'привет' })).status, 403);
  assert.equal((await fan('POST', `/api/projects/${post.id}/comments`, { text: 'классно' })).status, 403);
  await shy('POST', '/api/users/shyfan/follow');
  assert.equal((await fan('POST', '/api/messages/shyauthor', { text: 'привет' })).status, 200);
  assert.equal((await fan('POST', `/api/projects/${post.id}/comments`, { text: 'классно' })).status, 200);
  const other = await project(fan, 'Шум');
  await shy('POST', `/api/projects/${other.id}/repost`);
  assert.deepEqual((await fan('GET', '/api/bootstrap')).body.projects.find(item => item.id === other.id).reposters, [], 'a hidden repost is not shown to others');
  assert.deepEqual((await shy('GET', '/api/bootstrap')).body.projects.find(item => item.id === other.id).reposters, ['shyauthor'], 'but the person still sees their own');
});

test('comments say who is the author and whom a reply answers; pictures keep their focus', async () => {
  const owner = await person('markauthor');
  const one = await person('markone');
  const two = await person('marktwo');
  const upload = await owner('POST', '/api/uploads', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'), { 'Content-Type': 'image/png' });
  const post = await project(owner, 'Отметки', { media: [{ url: upload.body.url, focus: [20, 70] }] });
  assert.deepEqual(post.media[0].focus, [20, 70]);
  const root = (await one('POST', `/api/projects/${post.id}/comments`, { text: 'Вопрос' })).body.comment;
  const answer = (await owner('POST', `/api/projects/${post.id}/comments`, { text: 'Ответ', replyTo: root })).body.comment;
  const third = await two('POST', `/api/projects/${post.id}/comments`, { text: 'А я добавлю', replyTo: answer });
  const comments = third.body.project.comments;
  const byId = id => comments.find(item => item.id === id);
  assert.equal(byId(answer).byAuthor, true);
  assert.equal(byId(root).byAuthor, false);
  assert.equal(byId(third.body.comment).replyTo, root, 'threads stay one level deep');
  assert.equal(byId(third.body.comment).mention, 'markauthor', 'but the reply names whom it answers');
  const edited = (await owner('PATCH', `/api/projects/${post.id}`, { title: 'Отметки', summary: 'коротко', media: [{ url: upload.body.url, focus: [50, 50] }] })).body.project;
  assert.equal(edited.media[0].focus, undefined, 'back to the centre');
});

// A stand-in for the agent on the author's computer: it answers the commands the server sends.
async function connectAgent(owner) {
  const { code } = (await owner('POST', '/api/devices/pair-code')).body;
  const claim = await fetch(`${base}/api/agent/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name: 'Mac', allow: 'edit' }) }).then(response => response.json());
  const agent = (url, body) => fetch(`${base}${url}`, { method: 'POST', headers: { Authorization: `Bearer ${claim.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(response => response.json());
  const hello = await agent('/api/agent/hello', { engines: [{ id: 'demo', label: 'Демо', ok: true }], workspaces: [{ key: 'game', name: 'game' }], allow: 'edit' });
  const controller = new AbortController();
  const answers = { tree: { entries: [{ path: 'README.md', size: 10 }, { path: 'LICENSE', size: 4 }, { path: 'builds/game.exe', size: 99 }], truncated: false }, read: { content: '# Маяк\nИгра про шторм' } };
  const stream = await fetch(`${base}/api/agent/stream`, { headers: { Authorization: `Bearer ${claim.token}` }, signal: controller.signal });
  (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of stream.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (!block.includes('event: cmd')) continue;
          const command = JSON.parse(block.split('\n').find(line => line.startsWith('data: ')).slice(6));
          if (answers[command.type]) await agent('/api/agent/reply', { id: command.id, ok: true, data: answers[command.type] });
        }
      }
    } catch {}
  })();
  await wait(150);
  return { workspaceId: hello.workspaces.game, agent, close: () => controller.abort() };
}

test('one project across the feed, ИИ-мир and Steam: links, tasks from comments, sparks, the way to Steam', async () => {
  const author = await person('ecoauthor');
  const fan = await person('ecofan');
  const stranger = await person('ecostranger');
  const device = await connectAgent(author);
  const post = await project(author, 'Маяк', { tags: ['Инди'] });
  assert.equal((await stranger('POST', `/api/projects/${post.id}/link`, { workspaceId: device.workspaceId })).status, 403);
  const linked = (await author('POST', `/api/projects/${post.id}/link`, { workspaceId: device.workspaceId })).body.project;
  assert.equal(linked.workspaceId, device.workspaceId);
  assert.equal((await fan('GET', '/api/bootstrap')).body.projects.find(item => item.id === post.id).workspaceId, undefined, 'only the author sees the link');

  // a comment becomes an AI task; the player gets sparks
  const comment = (await fan('POST', `/api/projects/${post.id}/comments`, { text: 'Вылетает на втором уровне' })).body.comment;
  const tasked = (await author('POST', `/api/projects/${post.id}/comments/${comment}/task`, { mode: 'edit' })).body;
  assert.match(tasked.task.prompt, /^Игрок @ecofan пишет в комментариях к «Маяк»/);
  assert.equal(tasked.workspaceId, device.workspaceId);
  assert.equal(tasked.project.comments.find(item => item.id === comment).tasked, true);
  await author('POST', `/api/projects/${post.id}/comments/${comment}/accept`);
  await author('POST', `/api/projects/${post.id}/comments/${comment}/accept`);
  await author('POST', `/api/projects/${post.id}/comments/${comment}/accept`);
  await author('POST', `/api/projects/${post.id}/comments/${comment}/pin`);
  const fanBoot = (await fan('GET', '/api/bootstrap')).body;
  assert.equal(fanBoot.account.sparks, 40, '10 for the task, 20 for the accepted report once, 10 for the pin');
  assert.deepEqual(fanBoot.account.sparkLog.map(entry => entry.amount), [10, 20, 10]);
  assert.deepEqual((await fan('GET', '/api/notifications')).body.items.slice(0, 3).map(item => item.type), ['pin', 'accepted', 'tasked']);
  assert.equal((await fan('POST', '/api/plus/sparks')).status, 403, 'not enough sparks for a week of Plus');
  assert.equal((await fan('POST', `/api/projects/${post.id}/comments/${comment}/task`, {})).status, 403);

  // the discussion as a task, the repository check, texts for Steam
  assert.equal((await author('POST', `/api/projects/${post.id}/digest-task`, {})).body.task.mode, 'read');
  const checked = (await author('POST', `/api/projects/${post.id}/repo-check`)).body.project;
  assert.deepEqual([checked.repo.readme, checked.repo.license, checked.repo.buildFiles, checked.repo.screens], [true, true, true, false]);
  const texts = (await author('POST', `/api/projects/${post.id}/steam-texts`)).body;
  assert.equal(texts.source, 'post');
  assert.equal(texts.readme, true);
  assert.equal(texts.short, 'Маяк — коротко');

  // a finished task goes out as an update
  await device.agent('/api/agent/events', { taskId: tasked.task.id, status: 'done', events: [{ kind: 'done', ok: true, text: 'Исправил' }] });
  const updated = (await author('POST', `/api/projects/${post.id}/updates`, { title: 'Вылет исправлен', taskId: tasked.task.id })).body.project;
  assert.equal(updated.updates[0].title, 'Вылет исправлен');

  // the application is tied to the project, then the release
  const application = (await author('POST', '/api/applications', { title: 'Маяк', description: 'Нужна помощь с релизом', contact: '@author', projectId: post.id })).body.application;
  assert.equal(application.projectId, post.id);
  let mine = (await author('GET', '/api/bootstrap')).body.projects.find(item => item.id === post.id);
  assert.equal(mine.steam.status, 'applied');
  assert.equal(mine.applicationId, application.id);
  await fan('POST', `/api/projects/${post.id}/watch`);
  await author('POST', `/api/projects/${post.id}/steam`, { status: 'coming', checklist: { build: true, cheat: true } });
  assert.equal((await fan('GET', '/api/notifications')).body.items[0].text, '«Маяк»: скоро в Steam — добавь в желаемое');
  const released = (await author('POST', `/api/projects/${post.id}/steam`, { status: 'released' })).body;
  assert.equal(released.releaseBoost, true);
  assert.deepEqual(released.project.steam, { status: 'released', releaseAt: 0, checklist: { build: true } });
  assert.ok((await stranger('GET', '/api/bootstrap')).body.ads.some(ad => ad.projectId === post.id), 'the release day comes with a free promotion');
  assert.deepEqual((await stranger('GET', '/api/bootstrap')).body.projects.find(item => item.id === post.id).steam, { status: 'released', releaseAt: 0 }, 'others see the status, not the checklist');
  device.close();
});

test('demo reviews: sorted feedback, one task for the AI, an update that pays the players back, a new web build', async () => {
  const author = await person('fbauthor');
  const vera = await person('fbvera');
  const oleg = await person('fboleg');
  const device = await connectAgent(author);
  const post = await project(author, 'Гавань', { demo: 'https://itch.io/embed-upload/7' });
  const plain = await project(author, 'Без демо');
  await author('POST', `/api/projects/${post.id}/link`, { workspaceId: device.workspaceId });
  await vera('POST', `/api/projects/${post.id}/watch`);

  // reviews: stars and marks with or without words; only for a demo, not from the author, not in replies
  const bug = (await vera('POST', `/api/projects/${post.id}/comments`, { text: 'Вылетает после босса', review: { stars: 2, tags: ['bugs', 'hard', 'hack'] } })).body.comment;
  const praise = (await oleg('POST', `/api/projects/${post.id}/comments`, { review: { stars: 5, tags: ['mood'] } })).body.comment;
  const idea = (await oleg('POST', `/api/projects/${post.id}/comments`, { text: 'Добавьте кооператив, пожалуйста' })).body.comment;
  assert.equal((await author('POST', `/api/projects/${post.id}/comments`, { review: { stars: 5 } })).status, 400, 'the author does not rate their own demo');
  assert.equal((await vera('POST', `/api/projects/${plain.id}/comments`, { review: { stars: 5 } })).status, 400, 'no demo, nothing to rate');
  const again = (await vera('POST', `/api/projects/${post.id}/comments`, { review: { stars: 4, tags: [] } })).body.project;
  assert.deepEqual(again.demoRating, { average: 4.5, count: 2 }, 'the latest review of each player counts');
  const byId = Object.fromEntries(again.comments.map(comment => [comment.id, comment]));
  assert.deepEqual([byId[bug].kind, byId[praise].kind, byId[idea].kind], ['bug', 'review', 'idea']);
  assert.deepEqual(byId[bug].review, { stars: 2, tags: ['bugs', 'hard'] });
  const notices = (await author('GET', '/api/notifications')).body.items;
  assert.equal(notices.filter(item => item.type === 'review').length, 3);
  assert.match(notices.find(item => item.type === 'review').text, /оценивает демо «Гавань»: «★4»/);

  // picked feedback goes to the AI as one task, the players get sparks for it
  assert.equal((await vera('POST', `/api/projects/${post.id}/feedback-task`, { ids: [bug] })).status, 403);
  assert.equal((await author('POST', `/api/projects/${post.id}/feedback-task`, { ids: [] })).status, 400);
  const sent = (await author('POST', `/api/projects/${post.id}/feedback-task`, { ids: [bug, idea, 'missing'], mode: 'edit' })).body;
  assert.match(sent.task.prompt, /Баги и проблемы:\n1\. @fbvera \(★2, баги, сложно\): «Вылетает после босса»/);
  assert.match(sent.task.prompt, /Просьбы и идеи:\n1\. @fboleg: «Добавьте кооператив, пожалуйста»/);
  assert.deepEqual([sent.task.projectId, sent.task.feedback, sent.task.mode], [post.id, 2, 'edit']);
  assert.equal(sent.project.comments.find(comment => comment.id === bug).tasked, true);
  assert.equal((await vera('GET', '/api/bootstrap')).body.account.sparks, 10);

  // the agent finishes: the author hears about it; the update closes the feedback and pays the players
  await device.agent('/api/agent/events', { taskId: sent.task.id, status: 'done', events: [{ kind: 'done', ok: true, text: 'Исправил вылет, добавил кооператив' }] });
  assert.match((await author('GET', '/api/notifications')).body.items[0].text, /^ИИ закончил задачу по «Гавань»/);
  const update = (await author('POST', `/api/projects/${post.id}/updates`, { title: 'Кооператив и без вылетов', taskId: sent.task.id })).body.project;
  assert.ok(update.comments.find(comment => comment.id === bug).resolved);
  assert.ok(update.comments.find(comment => comment.id === idea).resolved);
  assert.equal(update.comments.find(comment => comment.id === praise).resolved, '');
  await author('POST', `/api/projects/${post.id}/updates`, { title: 'Ещё раз', taskId: sent.task.id });
  assert.equal((await vera('GET', '/api/bootstrap')).body.account.sparks, 25, '10 for the task and 15 once for the fix');
  assert.equal((await oleg('GET', '/api/bootstrap')).body.account.sparks, 25);
  assert.ok((await vera('GET', '/api/notifications')).body.items.some(item => item.type === 'fixed' && /твой отзыв учли в обновлении/.test(item.text)));

  // a web build through the agent: the link from its answer is offered to the post
  const demoTask = (await author('POST', `/api/projects/${post.id}/demo-task`)).body.task;
  assert.deepEqual([demoTask.purpose, demoTask.mode], ['demo', 'edit']);
  await device.agent('/api/agent/events', { taskId: demoTask.id, status: 'done', events: [{ kind: 'done', ok: true, text: 'Собрал и выложил.\nhttps://fbauthor.github.io/gavan/' }] });
  assert.equal((await author('GET', '/api/notifications')).body.items[0].type, 'demo-ready');
  let mine = (await author('GET', '/api/bootstrap')).body.projects.find(item => item.id === post.id);
  assert.equal(mine.demoDraft.url, 'https://fbauthor.github.io/gavan/');
  assert.equal((await vera('GET', '/api/bootstrap')).body.projects.find(item => item.id === post.id).demoDraft, undefined, 'only the author sees the draft');
  assert.equal((await author('POST', `/api/projects/${post.id}/demo`, { url: 'http://insecure.example' })).status, 400);
  assert.equal((await vera('POST', `/api/projects/${post.id}/demo`, { url: mine.demoDraft.url })).status, 403);
  mine = (await author('POST', `/api/projects/${post.id}/demo`, { url: mine.demoDraft.url })).body.project;
  assert.deepEqual([mine.demo, mine.demoDraft], ['https://fbauthor.github.io/gavan/', null]);
  assert.match((await vera('GET', '/api/notifications')).body.items[0].text, /новая версия демо/);
  device.close();
});

test('the comment menu: labels, «Помогло» from the one who asked, a Plus prompt in the project context, help in profiles', async () => {
  const author = await person('menuauthor');
  const asker = await person('menuasker');
  const helper = await person('menuhelper');
  const device = await connectAgent(author);
  const post = await project(author, 'Маяк');
  await author('POST', `/api/projects/${post.id}/link`, { workspaceId: device.workspaceId });

  // the person who wrote a comment says what it is; the author of the project may correct it
  const question = (await asker('POST', `/api/projects/${post.id}/comments`, { text: 'Кнопки мелкие на телефоне', label: 'question' })).body.comment;
  const answer = (await helper('POST', `/api/projects/${post.id}/comments`, { text: 'Включи крупный интерфейс в настройках', replyTo: question })).body.comment;
  assert.equal((await helper('POST', `/api/projects/${post.id}/comments/${question}/label`, { label: 'bug' })).status, 403, 'not their comment');
  let view = (await helper('POST', `/api/projects/${post.id}/comments/${answer}/label`, { label: 'solution' })).body.project;
  assert.deepEqual(['label', 'kind'].map(key => view.comments.find(item => item.id === answer)[key]), ['solution', 'solution']);
  view = (await author('POST', `/api/projects/${post.id}/comments/${question}/label`, { label: 'bug' })).body.project;
  assert.equal(view.comments.find(item => item.id === question).kind, 'bug');
  view = (await author('POST', `/api/projects/${post.id}/comments/${question}/label`, { label: 'nope' })).body.project;
  assert.deepEqual([view.comments.find(item => item.id === question).label, view.comments.find(item => item.id === question).kind], ['', 'other'], 'a wrong label clears it, and the words alone say little');
  await author('POST', `/api/projects/${post.id}/comments/${question}/label`, { label: 'bug' });

  // the one who asked marks the reply that helped; a stranger cannot
  const stranger = await person('menustranger');
  assert.equal((await stranger('POST', `/api/projects/${post.id}/comments/${answer}/accept`)).status, 403);
  view = (await asker('POST', `/api/projects/${post.id}/comments/${answer}/accept`)).body.project;
  assert.equal(view.comments.find(item => item.id === answer).accepted, true);
  assert.equal((await helper('GET', '/api/bootstrap')).body.account.sparks, 20);

  // the prompt with AI is part of Plus; it reads the thread and the files on the computer
  assert.equal((await author('POST', `/api/projects/${post.id}/comments/${question}/prompt`)).status, 402);
  const { payment } = (await author('POST', '/api/plus')).body;
  await author('POST', `/api/payments/${payment.id}/test`);
  const prompt = (await author('POST', `/api/projects/${post.id}/comments/${question}/prompt`)).body;
  assert.equal(prompt.source, 'template', 'no AI key in tests: the template still carries the context');
  assert.match(prompt.prompt, /^Проект «Маяк» — Маяк — коротко\./);
  assert.match(prompt.prompt, /@menuasker оставил сообщение о баге:\n«Кнопки мелкие на телефоне»/);
  assert.match(prompt.prompt, /— @menuhelper: «Включи крупный интерфейс в настройках»/);
  assert.match(prompt.prompt, /Файлы в корне проекта: README\.md, LICENSE/);
  assert.match(prompt.prompt, /Из README: Игра про шторм/);
  assert.deepEqual(prompt.context, { files: 2, readme: true, thread: 2 });
  assert.equal((await helper('POST', `/api/projects/${post.id}/comments/${question}/prompt`)).status, 403, 'only the author of the project');
  const sent = (await author('POST', `/api/projects/${post.id}/comments/${question}/task`, { prompt: prompt.prompt })).body;
  assert.equal(sent.workspaceId, device.workspaceId);

  // help shows in profiles: the helper's solution, the asker's report taken to the AI
  const users = (await stranger('GET', '/api/bootstrap')).body.users;
  const helperHelp = users.find(item => item.handle === 'menuhelper').help;
  assert.deepEqual([helperHelp.points, helperHelp.helped, helperHelp.kinds], [10, 1, { solution: 1 }]);
  const askerHelp = users.find(item => item.handle === 'menuasker').help;
  assert.deepEqual([askerHelp.points, askerHelp.title, askerHelp.kinds], [15, 'Помощник', { bug: 1 }]);
  assert.equal(users.find(item => item.handle === 'menuauthor').help.points, 0, 'the author does not earn help on their own project');
  device.close();
});

test('Plus across the parts: a free day of promotion a month, more computers, priority in Steam', async () => {
  const member = await person('plusmember');
  const post = await project(member, 'Плюсовый');
  assert.equal((await member('POST', '/api/promotions', { projectId: post.id, plan: 'day', pay: 'plus' })).status, 403, 'the free day is part of Plus');
  const { payment } = (await member('POST', '/api/plus')).body;
  await member('POST', `/api/payments/${payment.id}/test`);
  assert.equal((await member('GET', '/api/bootstrap')).body.account.plusCredit, true);
  const gift = (await member('POST', '/api/promotions', { projectId: post.id, plan: 'day', pay: 'plus' })).body;
  assert.equal(gift.promotion.status, 'active');
  assert.equal(gift.payment, null);
  assert.equal((await member('GET', '/api/bootstrap')).body.account.plusCredit, false, 'once a month');
  const application = (await member('POST', '/api/applications', { title: 'Игра', description: 'Описание', contact: '@m' })).body.application;
  assert.deepEqual([application.priority, application.documentReview], [true, true]);
  assert.equal((await member('GET', '/api/bootstrap')).body.account.limits.devices, 6);
  const free = await person('freemember');
  for (let index = 0; index < 2; index += 1) {
    const { code } = (await free('POST', '/api/devices/pair-code')).body;
    await fetch(`${base}/api/agent/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name: `PC ${index}` }) });
  }
  const third = await free('POST', '/api/devices/pair-code');
  assert.equal(third.status, 403);
  assert.match(third.body.error, /С Плюсом — до 6/);
});

test('a publisher notices a game people hold on to', async () => {
  const dev = await person('noticedev');
  const post = await project(dev, 'Тихий берег');
  for (const name of ['noticeone', 'noticetwo', 'noticethree']) await (await person(name))('POST', `/api/projects/${post.id}/save`);
  const events = Array.from({ length: 32 }, () => ({ id: post.id, type: 'view', dwell: 9000, expected: 4000 }));
  await fetch(`${base}/api/feed/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.7.7.7' }, body: JSON.stringify({ events }) });
  const notice = (await dev('GET', '/api/notifications')).body.items.find(item => item.type === 'publisher');
  assert.equal(notice?.text, 'Издатель заметил «Тихий берег»: людям интересно. Подай заявку в Steam — её посмотрят первой');
  assert.ok((await dev('GET', '/api/bootstrap')).body.projects.find(item => item.id === post.id).publisherNoticed > 0);
});

test('Plus: a free day once for people who never had it, the first paid month at half price; who follows whom', async () => {
  const fresh = await person('trialfresh');
  let account = (await fresh('GET', '/api/bootstrap')).body.account;
  assert.deepEqual([account.plusTrial, account.plusPrice, account.plusUntil], [true, 149, 0]);
  const trial = (await fresh('POST', '/api/plus/trial')).body;
  assert.ok(trial.plusUntil > Date.now() + 23 * 3600 * 1000 && trial.plusUntil <= Date.now() + 24 * 3600 * 1000);
  account = (await fresh('GET', '/api/bootstrap')).body.account;
  assert.deepEqual([account.plusTrial, account.plusTrialNow], [false, true]);
  assert.equal((await fresh('POST', '/api/plus/trial')).status, 409, 'only once');
  const first = (await fresh('POST', '/api/plus')).body.payment;
  assert.equal(first.amount, 149);
  await fresh('POST', `/api/payments/${first.id}/test`);
  account = (await fresh('GET', '/api/bootstrap')).body.account;
  assert.deepEqual([account.plusPrice, account.plusTrialNow], [299, false]);
  assert.ok(account.plusUntil > Date.now() + 30 * 864e5, 'the paid month adds to the free day');
  assert.equal((await fresh('POST', '/api/plus')).body.payment.amount, 299);

  const fan = await person('peoplefan');
  const other = await person('peopleother');
  await fan('POST', '/api/users/trialfresh/follow');
  await other('POST', '/api/users/trialfresh/follow');
  await fresh('POST', '/api/users/peoplefan/follow');
  assert.deepEqual((await fan('GET', '/api/users/trialfresh/people?list=followers')).body.people.sort(), ['peoplefan', 'peopleother']);
  assert.deepEqual((await fan('GET', '/api/users/trialfresh/people?list=following')).body.people, ['peoplefan']);
  await other('POST', '/api/users/peoplefan/block');
  assert.deepEqual((await other('GET', '/api/users/trialfresh/people?list=following')).body.people, [], 'blocked people are left out');
});

test('the spark shop: looks bought for sparks stay without Plus, Plus looks still need Plus', async () => {
  const author = await person('shopauthor');
  const buyer = await person('shopbuyer');
  const viewer = await person('shopviewer');
  const post = await project(author, 'Лавка');
  for (let index = 0; index < 7; index += 1) {
    const comment = (await buyer('POST', `/api/projects/${post.id}/comments`, { text: `Отзыв ${index + 1}: на третьем уровне неясно, куда идти` })).body.comment;
    await author('POST', `/api/projects/${post.id}/comments/${comment}/accept`);
    await author('POST', `/api/projects/${post.id}/comments/${comment}/pin`);
  }
  assert.equal((await buyer('GET', '/api/bootstrap')).body.account.sparks, 210);
  assert.equal((await buyer('POST', '/api/me/look', { name: 'gold' })).status, 403, 'a spark look has to be bought first');
  assert.equal((await buyer('POST', '/api/shop/buy', { item: 'banner:galaxy' })).status, 403, 'not enough sparks');
  assert.equal((await buyer('POST', '/api/shop/buy', { item: 'banner:aurora' })).status, 404, 'Plus looks are not sold');
  const bought = (await buyer('POST', '/api/shop/buy', { item: 'name:gold' })).body;
  assert.equal(bought.sparks, 10);
  assert.deepEqual(bought.owned, ['name:gold']);
  assert.equal(bought.sparkLog[0].amount, -200);
  assert.equal((await buyer('POST', '/api/shop/buy', { item: 'name:gold' })).status, 409, 'bought once');
  const worn = (await buyer('POST', '/api/me/look', { name: 'gold' })).body.me;
  assert.equal(worn.plus, false);
  assert.equal(worn.look.name, 'gold');
  assert.equal((await buyer('POST', '/api/me/look', { banner: 'synthwave' })).status, 402, 'Plus themes need Plus');
  assert.equal((await buyer('POST', '/api/me/look', { status: '🎮' })).status, 402);
  assert.equal((await buyer('POST', '/api/me/look', { accent: 'mint' })).status, 402);
  const seen = (await viewer('GET', '/api/bootstrap')).body.users.find(item => item.handle === 'shopbuyer');
  assert.equal(seen.look.name, 'gold', 'a bought look shows without Plus');
  assert.equal(seen.owned, undefined, 'what someone owns stays private');
  assert.equal(seen.sparks, undefined, 'so do their sparks');
  assert.deepEqual((await buyer('GET', '/api/bootstrap')).body.account.owned, ['name:gold']);
  assert.equal((await buyer('POST', '/api/me/look', { name: '' })).body.me.look, null, 'taking it off is always allowed');
});

test('Plus profile look: a banner, a colour and a live avatar, shown only while Plus is on', async () => {
  const styled = await person('lookstyled');
  const viewer = await person('lookviewer');
  assert.equal((await styled('POST', '/api/me/look', { banner: 'aurora' })).status, 402);
  const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), randomBytes(200)]);
  const upload = (await styled('POST', '/api/uploads', gif, { 'Content-Type': 'image/gif' })).body;
  assert.match(upload.url, /\.gif$/);
  await styled('POST', '/api/plus/trial');
  const me = (await styled('POST', '/api/me/look', { banner: 'aurora', accent: 'mint', motion: upload.url, bannerImage: '' })).body.me;
  assert.deepEqual(me.look, { banner: 'aurora', bannerImage: '', accent: '#3ddc84', accentKey: 'mint', motion: { url: upload.url, type: 'image' }, deco: '', name: '', status: '' });
  const dressed = (await styled('POST', '/api/me/look', { deco: 'halo', name: 'neon', status: '🎮' })).body.me.look;
  assert.deepEqual([dressed.deco, dressed.name, dressed.status], ['halo', 'neon', '🎮']);
  assert.equal((await styled('POST', '/api/me/look', { accent: '' })).body.me.look.accent, '#3ddc84', 'without a chosen colour the theme brings its own');
  await styled('POST', '/api/me/look', { accent: 'mint' });
  assert.equal(me.plus, true);
  const seen = (await viewer('GET', '/api/bootstrap')).body.users.find(item => item.handle === 'lookstyled');
  assert.equal(seen.look.banner, 'aurora');
  assert.deepEqual((await styled('POST', '/api/me/look', { banner: 'nope', accent: 'nope' })).body.me.look.banner, '', 'unknown presets are dropped');
  const stranger = await person('lookstranger');
  const foreign = (await stranger('POST', '/api/uploads', gif, { 'Content-Type': 'image/gif' })).body;
  assert.equal((await styled('POST', '/api/me/look', { motion: foreign.url })).status, 400, 'only your own uploads');
  assert.equal(seen.plus, true);
  assert.equal((await viewer('GET', '/api/bootstrap')).body.users.find(item => item.handle === 'lookviewer').look, null, 'no Plus, no look');
});
