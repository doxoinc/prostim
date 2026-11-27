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
  server = spawn(process.execPath, [path.join(root, 'server/index.mjs')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, DATABASE_URL: '', MAIL_TRANSPORT: 'outbox', REQUIRE_EMAIL: '0', PUSH_TEST_ENDPOINTS: '1', LINK_PREVIEW_ALLOW_LOCAL: '1', REPORT_HIDE: '2', ANTHROPIC_API_KEY: '', DEMO_ADS: '0', YOOKASSA_SHOP_ID: '', YOOKASSA_SECRET_KEY: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
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
