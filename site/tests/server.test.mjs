import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = 4600 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
let server;
let dataDir;

test.before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'prostim-test-'));
  server = spawn(process.execPath, [path.join(root, 'server/index.mjs')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, DATABASE_URL: '' }, stdio: 'pipe' });
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
