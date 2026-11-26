import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = 4600 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
let server;
let dataDir;
let oauthMock;

// A stand-in for Google: it hands out one code, checks the secret, and returns a fixed profile.
function startOauthMock() {
  oauthMock = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let body = '';
    for await (const chunk of request) body += chunk;
    const json = data => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
    if (url.pathname === '/google/token') {
      const form = new URLSearchParams(body);
      if (form.get('code') !== 'good-code' || form.get('client_secret') !== 'gsecret') { response.writeHead(400); return response.end('{}'); }
      return json({ access_token: 'g-token' });
    }
    if (url.pathname === '/google/userinfo') {
      if (request.headers.authorization !== 'Bearer g-token') { response.writeHead(401); return response.end('{}'); }
      return json({ sub: 'g-123', email: 'Ivan.Petrov@gmail.com', email_verified: true, name: 'Иван Петров' });
    }
    response.writeHead(404);
    response.end();
  });
  return new Promise(resolve => oauthMock.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${oauthMock.address().port}`)));
}

async function lastCode(email) {
  const lines = (await readFile(path.join(dataDir, 'outbox.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const letter = lines.reverse().find(item => item.to === email);
  return /\b(\d{6})\b/.exec(letter?.text || '')?.[1];
}

test.before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'prostim-test-'));
  const mockUrl = await startOauthMock();
  server = spawn(process.execPath, [path.join(root, 'server/index.mjs')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, DATABASE_URL: '', MAIL_TRANSPORT: 'outbox', GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', OAUTH_MOCK_URL: mockUrl, YOOKASSA_SHOP_ID: '', YOOKASSA_SECRET_KEY: '', PAYMENTS_TEST: '' }, stdio: 'pipe' });
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
  oauthMock?.close();
  await rm(dataDir, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, url, body, headers = {}) => {
    const response = await fetch(`${base}${url}`, { method, headers: { ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
}

test('accounts, ratings and follows build a trust profile', async () => {
  const alice = client();
  const bob = client();
  assert.equal((await alice('POST', '/api/auth/register', { handle: 'alice', name: 'Алиса', password: 'secret12' })).status, 200);
  assert.equal((await bob('POST', '/api/auth/register', { handle: 'bob', name: 'Боб', password: 'secret12' })).status, 200);
  assert.equal((await bob('POST', '/api/auth/register', { handle: 'alice', name: 'X', password: 'secret12' })).status, 409);
  assert.equal((await client()('POST', '/api/auth/login', { handle: 'alice', password: 'wrong-pass' })).status, 401);
  assert.equal((await alice('POST', '/api/users/alice/rate', { score: 5 })).status, 400, 'self rating is refused');
  const rated = await bob('POST', '/api/users/alice/rate', { score: 4, text: 'помог' });
  assert.equal(rated.body.user.ratingCount, 1);
  assert.equal(rated.body.user.trust, 'member');
  await bob('POST', '/api/users/alice/rate', { score: 5 });
  const followed = await bob('POST', '/api/users/alice/follow');
  assert.equal(followed.body.following, true);
  assert.equal(followed.body.user.followers, 1);
  assert.equal(followed.body.user.ratingAverage, 5, 'a second rating replaces the first');
  const reviews = await client()('GET', '/api/users/alice/reviews');
  assert.equal(reviews.body.reviews[0].handle, 'bob');
  const boot = await alice('GET', '/api/bootstrap');
  assert.equal(boot.body.me.handle, 'alice');
  assert.equal(boot.body.threads[0].handle, 'prostim', 'a welcome message is waiting');
});

test('writes need a session and JSON, and user text is stored as plain text', async () => {
  assert.equal((await client()('POST', '/api/projects', { title: 'x', summary: 'y' })).status, 401);
  const carol = client();
  await carol('POST', '/api/auth/register', { handle: 'carol', name: 'Кэрол', password: 'secret12' });
  const form = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
  assert.equal(form.status, 415);
  const created = await carol('POST', '/api/projects', { title: '<b>Игра</b>', summary: 'Тест', category: 'games', url: 'javascript:alert(1)', images: [] });
  assert.equal(created.status, 200);
  assert.equal(created.body.project.url, '');
  assert.equal(created.body.project.title, '<b>Игра</b>');
  const bad = await carol('POST', '/api/projects', { title: 'x', summary: 'y', images: ['data:image/png;base64,AAAA'] });
  assert.equal(bad.status, 400, 'non-image bytes are rejected');
});

test('a paired device receives tasks and streams events back to the owner', async () => {
  const owner = client();
  const guest = client();
  await owner('POST', '/api/auth/register', { handle: 'owner1', name: 'Владелец', password: 'secret12' });
  await guest('POST', '/api/auth/register', { handle: 'guest1', name: 'Гость', password: 'secret12' });
  const { code } = (await owner('POST', '/api/devices/pair-code')).body;
  const claim = await fetch(`${base}/api/agent/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name: 'Test Mac', allow: 'edit' }) }).then(response => response.json());
  assert.ok(claim.token);
  const reuse = await fetch(`${base}/api/agent/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  assert.equal(reuse.status, 401, 'a pairing code works once');
  const agent = (url, body) => fetch(`${base}${url}`, { method: 'POST', headers: { Authorization: `Bearer ${claim.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(response => response.json());
  const hello = await agent('/api/agent/hello', { engines: [{ id: 'demo', label: 'Демо', ok: true }], workspaces: [{ key: 'k1', name: 'game' }], allow: 'edit' });
  const workspaceId = hello.workspaces.k1;
  assert.ok(workspaceId);
  assert.equal((await guest('GET', `/api/workspaces/${workspaceId}`)).status, 404, 'strangers cannot see the project');
  assert.equal((await owner('POST', `/api/workspaces/${workspaceId}/tasks`, { prompt: 'Привет', mode: 'full' })).status, 403, 'mode above the device limit is refused');
  const created = await owner('POST', `/api/workspaces/${workspaceId}/tasks`, { prompt: 'Привет', mode: 'edit' });
  assert.equal(created.body.task.status, 'waiting', 'offline device: task waits');
  await agent('/api/agent/events', { taskId: created.body.task.id, status: 'running', events: [{ kind: 'start', engine: 'demo' }, { kind: 'tool', id: 't1', tool: 'read', path: 'README.md' }] });
  await agent('/api/agent/events', { taskId: created.body.task.id, status: 'done', events: [{ kind: 'done', ok: true, text: 'Готово', sessionId: 's-1' }] });
  const detail = await owner('GET', `/api/workspaces/${workspaceId}`);
  const task = detail.body.workspace.tasks[0];
  assert.equal(task.status, 'done');
  assert.deepEqual(task.events.map(event => event.seq), [1, 2, 3]);
  await owner('POST', `/api/workspaces/${workspaceId}/shares`, { handle: 'guest1', role: 'view' });
  assert.equal((await guest('GET', `/api/workspaces/${workspaceId}`)).status, 200);
  assert.equal((await guest('POST', `/api/workspaces/${workspaceId}/tasks`, { prompt: 'x', mode: 'read' })).status, 403, 'viewers cannot run tasks');
  await owner('POST', `/api/workspaces/${workspaceId}/shares`, { handle: 'guest1', role: 'run' });
  assert.equal((await guest('POST', `/api/workspaces/${workspaceId}/tasks`, { prompt: 'x', mode: 'read' })).status, 200);
});

test('media uploads: owner-only reuse, type sniffing and byte ranges for video', async () => {
  const dave = client();
  const eve = client();
  await dave('POST', '/api/auth/register', { handle: 'dave', name: 'Дэйв', password: 'secret12' });
  await eve('POST', '/api/auth/register', { handle: 'eve', name: 'Ева', password: 'secret12' });
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: 'dave', password: 'secret12' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(200, 7)]);
  const upload = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'Content-Type': 'video/mp4', Cookie: cookie }, body: mp4 }).then(response => response.json());
  assert.match(upload.url, /^\/uploads\/v-[\w-]+\.mp4$/);
  const fake = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'Content-Type': 'video/mp4', Cookie: cookie }, body: Buffer.from('not a video at all') });
  assert.equal(fake.status, 400);
  const form = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: cookie }, body: 'x' });
  assert.equal(form.status, 415);
  const partial = await fetch(`${base}${upload.url}`, { headers: { Range: 'bytes=0-9' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), `bytes 0-9/${mp4.length}`);
  assert.equal((await partial.arrayBuffer()).byteLength, 10);
  const stolen = await eve('POST', '/api/projects', { title: 'x', summary: 'y', media: [{ url: upload.url }] });
  assert.equal(stolen.status, 400, 'another user cannot attach someone else’s upload');
  const created = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ title: 'Видео', summary: 'Трейлер', media: [{ url: upload.url }], video: 'https://www.youtube.com/watch?v=abc' }) }).then(response => response.json());
  assert.deepEqual(created.project.media, [{ type: 'video', url: upload.url }]);
  assert.equal(created.project.video, 'https://www.youtube.com/watch?v=abc');
});

test('feed events build post stats for everyone and a taste for the signed-in viewer', async () => {
  const viewer = client();
  await viewer('POST', '/api/auth/register', { handle: 'viewer1', name: 'Зритель', password: 'secret12' });
  const events = [
    { id: 'pulse', type: 'view', dwell: 9000, expected: 4000 },
    { id: 'pulse', type: 'save' },
    { id: 'forest-light', type: 'view', dwell: 300, expected: 4000 },
    { id: 'missing', type: 'view', dwell: 5000 },
    { id: 'pulse', type: 'teleport' }
  ];
  const sent = await viewer('POST', '/api/feed/events', { events });
  assert.equal(sent.body.accepted, 3, 'unknown posts and event types are ignored');
  await client()('POST', '/api/feed/events', { events: [{ id: 'pulse', type: 'view', dwell: 2000, expected: 4000 }] });
  const boot = await viewer('GET', '/api/bootstrap');
  const pulse = boot.body.projects.find(project => project.id === 'pulse');
  assert.equal(pulse.stats.impressions, 2, 'guests count towards post stats');
  assert.equal(pulse.stats.completes, 1);
  assert.equal(boot.body.projects.find(project => project.id === 'forest-light').stats.skips, 1);
  assert.ok(boot.body.taste.weights['cat:tools'] > 0);
  assert.ok(boot.body.taste.weights['cat:games'] < 0);
  const reset = await viewer('DELETE', '/api/me/taste');
  assert.deepEqual(reset.body.taste.weights, {});
});

test('a post page keeps facts, links, theme and blocks; only the author edits it', async () => {
  const author = client();
  const other = client();
  await author('POST', '/api/auth/register', { handle: 'pageauthor', name: 'Автор', password: 'secret12' });
  await other('POST', '/api/auth/register', { handle: 'pageother', name: 'Другой', password: 'secret12' });
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: 'pageauthor', password: 'secret12' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40, 1)]);
  const upload = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'Content-Type': 'image/gif', Cookie: cookie }, body: gif }).then(response => response.json());
  assert.match(upload.url, /\.gif$/, 'GIFs are stored as GIFs, so they keep moving');
  const served = await fetch(`${base}${upload.url}`);
  assert.equal(served.headers.get('content-type'), 'image/gif');
  const body = {
    title: 'Ритм', summary: 'Раннер', category: 'games', stage: 'demo', platforms: ['web', 'ps9'], pricing: 'free', seeking: ['testers'], ai: true, madeWith: 'Godot, Claude Code',
    links: ['https://store.steampowered.com/app/1', 'javascript:alert(1)'], theme: { bg: '#241631', accent: 'red', font: 'display' },
    page: [{ type: 'heading', text: 'Привет', size: 'xl', color: '#ffd84d' }, { type: 'image', url: upload.url, caption: 'Геймплей' }, { type: 'script', text: 'x' }]
  };
  const created = await author('POST', '/api/projects', body);
  assert.equal(created.status, 200);
  const post = created.body.project;
  assert.deepEqual([post.stage, post.platforms, post.pricing, post.ai, post.madeWith], ['demo', ['web'], 'free', true, ['Godot', 'Claude Code']]);
  assert.deepEqual(post.links, ['https://store.steampowered.com/app/1']);
  assert.deepEqual(post.theme, { bg: '#241631', accent: '', font: 'display' });
  assert.deepEqual(post.page.map(block => block.type), ['heading', 'image']);
  assert.equal(post.scene, '', 'a post without photos gets the title cover');
  const foreign = await other('POST', '/api/projects', { ...body, page: [{ type: 'image', url: upload.url }] });
  assert.equal(foreign.status, 400, 'page blocks cannot use someone else’s files');
  const hijack = await other('PATCH', `/api/projects/${post.id}`, { title: 'Чужое', summary: 'x' });
  assert.equal(hijack.status, 403);
  const edited = await author('PATCH', `/api/projects/${post.id}`, { ...body, title: 'Ритм 2', theme: { bg: '#f5efe6', font: 'serif' }, page: [post.page[1], post.page[0]] });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.project.title, 'Ритм 2');
  assert.equal(edited.body.project.theme.font, 'serif');
  assert.deepEqual(edited.body.project.page.map(block => block.type), ['image', 'heading'], 'blocks keep the new order and existing files');
});

test('chat: stickers, pictures and one reaction per person', async () => {
  const ann = client();
  const bob = client();
  await ann('POST', '/api/auth/register', { handle: 'chatann', name: 'Аня', password: 'secret12' }, { 'X-Forwarded-For': '10.9.0.1' });
  await bob('POST', '/api/auth/register', { handle: 'chatbob', name: 'Боб', password: 'secret12' }, { 'X-Forwarded-For': '10.9.0.2' });
  assert.equal((await ann('POST', '/api/messages/chatbob', { sticker: 'nope' })).status, 400, 'unknown stickers and empty messages are refused');
  let threads = (await ann('POST', '/api/messages/chatbob', { sticker: 'gg' })).body.threads;
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.9.0.3' }, body: JSON.stringify({ handle: 'chatann', password: 'secret12' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  const picture = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'Content-Type': 'image/png', Cookie: cookie }, body: png }).then(response => response.json());
  assert.equal((await bob('POST', '/api/messages/chatann', { image: picture.url })).status, 400, 'cannot send someone else’s upload');
  threads = (await ann('POST', '/api/messages/chatbob', { image: picture.url, text: 'Скрин' })).body.threads;
  const messages = threads.find(thread => thread.handle === 'chatbob').messages;
  assert.deepEqual(messages.map(message => [message.sticker, message.image, message.text]), [['gg', '', ''], ['', picture.url, 'Скрин']]);
  const id = messages[0].id;
  assert.equal((await bob('POST', '/api/messages/chatann/react', { id, emoji: '💩' })).status, 400, 'only the offered reactions');
  await bob('POST', '/api/messages/chatann/react', { id, emoji: '❤️' });
  let seen = (await ann('GET', '/api/bootstrap')).body.threads.find(thread => thread.handle === 'chatbob').messages[0].reactions;
  assert.deepEqual(seen, { counts: { '❤️': 1 }, mine: '' });
  await bob('POST', '/api/messages/chatann/react', { id, emoji: '❤️' });
  seen = (await ann('GET', '/api/bootstrap')).body.threads.find(thread => thread.handle === 'chatbob').messages[0].reactions;
  assert.deepEqual(seen.counts, {}, 'the same reaction again takes it back');
  const stranger = client();
  await stranger('POST', '/api/auth/register', { handle: 'chatcarl', name: 'Карл', password: 'secret12' }, { 'X-Forwarded-For': '10.9.0.4' });
  assert.equal((await stranger('POST', '/api/messages/chatann/react', { id, emoji: '👍' })).status, 404, 'outsiders cannot react to a private chat');
});

test('AI task attachments: private files that only the task computer can fetch', async () => {
  const registered = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.9.0.5' }, body: JSON.stringify({ handle: 'fileowner', name: 'Файлы', password: 'secret12' }) });
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  const owner = (method, url, body) => fetch(`${base}${url}`, { method, headers: { Cookie: cookie, ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }) }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }).then(async response => ({ status: response.status, body: await response.json().catch(() => ({})) }));
  const upload = await fetch(`${base}/api/files`, { method: 'POST', headers: { 'Content-Type': 'audio/mpeg', 'X-File-Name': encodeURIComponent('голос заметка.mp3'), Cookie: cookie }, body: Buffer.concat([Buffer.from('ID3'), Buffer.alloc(40, 2)]) }).then(response => response.json());
  assert.match(upload.id, /^f-[\w-]+\.mp3$/);
  assert.equal(upload.kind, 'audio');
  assert.equal(upload.filename, 'голос заметка.mp3');
  assert.equal((await fetch(`${base}/uploads/${upload.id}`)).status, 404, 'attachments are not public');
  const clip = await fetch(`${base}/api/files`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'gameplay.mp4', Cookie: cookie }, body: Buffer.alloc(64) }).then(response => response.json());
  assert.equal(clip.kind, 'video', 'a video is recognised by its extension too');
  const { code } = (await owner('POST', '/api/devices/pair-code')).body;
  const claim = await fetch(`${base}/api/agent/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.9.0.6' }, body: JSON.stringify({ code, name: 'Mac', allow: 'edit' }) }).then(response => response.json());
  const hello = await fetch(`${base}/api/agent/hello`, { method: 'POST', headers: { Authorization: `Bearer ${claim.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: '0.3.0', engines: [{ id: 'demo', label: 'Демо', ok: true }], workspaces: [{ key: 'kf', name: 'app' }], allow: 'edit' }) }).then(response => response.json());
  const workspaceId = hello.workspaces.kf;
  const fetchFile = () => fetch(`${base}/api/agent/files/${upload.id}`, { headers: { Authorization: `Bearer ${claim.token}` } });
  assert.equal((await fetchFile()).status, 403, 'not attached to any task yet');
  assert.equal((await owner('POST', `/api/workspaces/${workspaceId}/tasks`, { prompt: 'Послушай', mode: 'read', attachments: ['f-missing.bin'] })).status, 400);
  const created = await owner('POST', `/api/workspaces/${workspaceId}/tasks`, { prompt: 'Послушай', mode: 'read', attachments: [upload.id] });
  assert.deepEqual(created.body.task.attachments, [{ id: upload.id, filename: 'голос заметка.mp3', size: 43, kind: 'audio' }]);
  const file = await fetchFile();
  assert.equal(file.status, 200);
  assert.equal((await file.arrayBuffer()).byteLength, 43);
  assert.equal((await fetch(`${base}/api/agent/files/${upload.id}`)).status, 401, 'needs the device token');
  assert.equal((await owner('GET', `/api/workspaces/${workspaceId}`)).body.workspace.device.version, '0.3.0');
});

test('e-mail codes: sign-up confirms the address, then the address signs in with a password or a code', async () => {
  const ip = { 'X-Forwarded-For': '10.9.1.1' };
  const dana = client();
  const start = await dana('POST', '/api/auth/email/start', { purpose: 'register', email: 'Dana@Example.com ', handle: 'dana', name: 'Дана', password: 'secret12' }, ip);
  assert.equal(start.status, 200);
  assert.equal(start.body.email, 'dana@example.com');
  assert.equal((await dana('POST', '/api/auth/email/start', { purpose: 'register', email: 'dana@example.com', handle: 'dana', name: 'Дана', password: 'secret12' }, ip)).status, 429, 'no new letter within 45 s');
  const code = await lastCode('dana@example.com');
  assert.match(code, /^\d{6}$/);
  const wrong = await dana('POST', '/api/auth/email/verify', { email: 'dana@example.com', code: code === '000000' ? '111111' : '000000' }, ip);
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /осталось попыток: 4/);
  assert.equal((await dana('POST', '/api/auth/email/verify', { email: 'dana@example.com', code }, ip)).status, 200);
  const boot = (await dana('GET', '/api/bootstrap')).body;
  assert.equal(boot.me.handle, 'dana');
  assert.equal(boot.account.email, 'dana@example.com');
  assert.equal(boot.users.find(user => user.handle === 'dana').email, undefined, 'the address is not public');
  assert.equal((await dana('POST', '/api/auth/email/verify', { email: 'dana@example.com', code }, ip)).status, 400, 'a code works once');
  assert.equal((await client()('POST', '/api/auth/email/start', { purpose: 'register', email: 'dana@example.com', handle: 'dana2', name: 'Д', password: 'secret12' }, ip)).status, 409);
  assert.equal((await client()('POST', '/api/auth/login', { handle: 'DANA@example.com', password: 'secret12' }, ip)).status, 200, 'the address works as a login');
  const later = client();
  assert.equal((await later('POST', '/api/auth/email/start', { purpose: 'login', email: 'nobody@example.com' }, ip)).status, 404);
  assert.equal((await later('POST', '/api/auth/email/start', { purpose: 'login', email: 'dana@example.com' }, ip)).status, 200);
  assert.equal((await later('POST', '/api/auth/email/verify', { email: 'dana@example.com', code: await lastCode('dana@example.com') }, ip)).status, 200);
  assert.equal((await later('GET', '/api/bootstrap')).body.me.handle, 'dana');
});

test('Google sign-in checks the state, creates the account once and finds it again', async () => {
  const startUrl = `${base}/api/auth/oauth/google/start`;
  const started = await fetch(startUrl, { redirect: 'manual' });
  assert.equal(started.status, 302);
  const target = new URL(started.headers.get('location'));
  assert.equal(target.pathname, '/google/authorize');
  assert.equal(target.searchParams.get('client_id'), 'gid');
  assert.equal(target.searchParams.get('redirect_uri'), `${base}/api/auth/oauth/google/callback`);
  const state = target.searchParams.get('state');
  const stateCookie = started.headers.get('set-cookie').split(';')[0];
  const forged = await fetch(`${base}/api/auth/oauth/google/callback?code=good-code&state=other`, { redirect: 'manual', headers: { Cookie: stateCookie } });
  assert.match(forged.headers.get('location'), /auth_error/, 'a state that does not match the cookie is refused');
  const noCookie = await fetch(`${base}/api/auth/oauth/google/callback?code=good-code&state=${state}`, { redirect: 'manual' });
  assert.match(noCookie.headers.get('location'), /auth_error/);
  const signIn = async () => {
    const first = await fetch(startUrl, { redirect: 'manual' });
    const firstState = new URL(first.headers.get('location')).searchParams.get('state');
    const back = await fetch(`${base}/api/auth/oauth/google/callback?code=good-code&state=${firstState}`, { redirect: 'manual', headers: { Cookie: first.headers.get('set-cookie').split(';')[0] } });
    assert.equal(back.headers.get('location'), '/#/me');
    const session = back.headers.getSetCookie().find(cookie => cookie.startsWith('ps_session='));
    return (await fetch(`${base}/api/bootstrap`, { headers: { Cookie: session.split(';')[0] } }).then(response => response.json()));
  };
  const once = await signIn();
  assert.equal(once.me.name, 'Иван Петров');
  assert.equal(once.me.handle, 'ivan_petrov');
  assert.equal(once.account.email, 'ivan.petrov@gmail.com');
  assert.deepEqual(once.account.providers, ['google']);
  const twice = await signIn();
  assert.equal(twice.me.id, once.me.id, 'the same Google account signs into the same profile');
  const badCode = await fetch(startUrl, { redirect: 'manual' });
  const badState = new URL(badCode.headers.get('location')).searchParams.get('state');
  const refused = await fetch(`${base}/api/auth/oauth/google/callback?code=stolen&state=${badState}`, { redirect: 'manual', headers: { Cookie: badCode.headers.get('set-cookie').split(';')[0] } });
  assert.match(refused.headers.get('location'), /auth_error/);
  assert.match((await fetch(`${base}/api/auth/oauth/github/start`, { redirect: 'manual' })).headers.get('location'), /auth_error/, 'providers without keys are off');
  assert.deepEqual((await client()('GET', '/api/bootstrap')).body.config.providers, [{ id: 'google', label: 'Google' }]);
});

test('promotion: paid in test mode, shown to others between posts, never to Plus subscribers', async () => {
  const owner = client();
  const viewer = client();
  const other = client();
  await owner('POST', '/api/auth/register', { handle: 'adowner', name: 'Рекламодатель', password: 'secret12' }, { 'X-Forwarded-For': '10.9.1.2' });
  await viewer('POST', '/api/auth/register', { handle: 'adviewer', name: 'Зритель', password: 'secret12' }, { 'X-Forwarded-For': '10.9.1.3' });
  await other('POST', '/api/auth/register', { handle: 'adother', name: 'Другой', password: 'secret12' }, { 'X-Forwarded-For': '10.9.1.4' });
  const project = (await owner('POST', '/api/projects', { title: 'Неон', summary: 'Гонки', category: 'games', images: [] })).body.project;
  assert.equal((await viewer('POST', '/api/promotions', { projectId: project.id, plan: 'week' })).status, 403, 'only the author promotes a post');
  assert.equal((await owner('POST', '/api/promotions', { projectId: project.id, plan: 'forever' })).status, 400);
  const bought = await owner('POST', '/api/promotions', { projectId: project.id, plan: 'week' });
  assert.equal(bought.status, 200);
  assert.equal(bought.body.payment.amount, 790);
  assert.equal(bought.body.payment.mode, 'test');
  assert.equal(bought.body.promotion.status, 'pending');
  const bought_ = list => list.filter(ad => !ad.id.startsWith('ad-demo-'));
  const before = (await viewer('GET', '/api/bootstrap')).body.ads;
  assert.deepEqual(before.map(ad => ad.projectId).sort(), ['between-shores', 'pulse'], 'two demo posts run as ads from the start');
  assert.deepEqual(bought_(before), [], 'nothing is shown before payment');
  assert.equal((await viewer('POST', `/api/payments/${bought.body.payment.id}/test`)).status, 404, 'nobody else can settle the payment');
  assert.equal((await owner('POST', `/api/payments/${bought.body.payment.id}/test`)).body.payment.status, 'succeeded');
  const ads = bought_((await viewer('GET', '/api/bootstrap')).body.ads);
  assert.deepEqual(ads.map(ad => ad.projectId), [project.id]);
  assert.equal((await owner('POST', '/api/promotions', { projectId: project.id, plan: 'day' })).status, 409, 'one campaign at a time');
  await viewer('POST', `/api/ads/${ads[0].id}/seen`);
  await viewer('POST', `/api/ads/${ads[0].id}/seen`);
  await other('POST', `/api/ads/${ads[0].id}/seen`);
  await owner('POST', `/api/ads/${ads[0].id}/seen`);
  await viewer('POST', `/api/ads/${ads[0].id}/click`);
  const stats = (await owner('GET', '/api/bootstrap')).body.promotions[0];
  assert.equal(stats.status, 'active');
  assert.equal(stats.shown, 2, 'each viewer counts once, the author not at all');
  assert.equal(stats.clicks, 1);
  const plus = await viewer('POST', '/api/plus');
  assert.equal(plus.body.payment.amount, 299);
  await viewer('POST', `/api/payments/${plus.body.payment.id}/test`);
  const after = (await viewer('GET', '/api/bootstrap')).body;
  assert.deepEqual(after.ads, [], 'Plus means no ads');
  assert.ok(after.account.plusUntil > Date.now() + 29 * 864e5);
  assert.equal(after.users.find(user => user.handle === 'adviewer').plus, true);
  const discounted = await viewer('POST', '/api/projects', { title: 'Мой', summary: 'Тест', category: 'apps', images: [] });
  assert.equal((await viewer('POST', '/api/promotions', { projectId: discounted.body.project.id, plan: 'week' })).body.payment.amount, 632, 'Plus takes 20% off');
});
