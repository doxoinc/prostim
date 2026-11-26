import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.mjs';
import { HttpError, fail, sha256, token, hashPassword, verifyPassword, pairingCode, parseCookies, clip, cleanText, safeHttpUrl, initialsOf, colorFor, limiter } from './util.mjs';
import { trustSummary } from '../src/trust.js';
import { demoProjects, initialTopics } from '../src/data.js';
import { cleanStats, cleanTaste, emptyTaste, recordSignal, recordStat, statSignals, tasteSignals } from '../src/recommend.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const staticRoot = path.join(root, 'src');
const agentFile = path.join(root, 'agent', 'prostim-agent.mjs');
const PORT = Number(process.env.PORT) || Number(process.argv[process.argv.indexOf('--port') + 1]) || 4173;
const HOST = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const SESSION_DAYS = 60;
const MODES = ['read', 'edit', 'full'];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const db = await openDatabase({ directory: DATA_DIR, url: process.env.DATABASE_URL });
const D = db.data;
seed();

/* Seed: official account, demo authors and their sample projects */

function seed() {
  if (!D.users.prostim) {
    D.users.prostim = { id: 'prostim', handle: 'prostim', name: 'про.стим', initials: 'ПС', color: '#9fcaff', bio: 'Официальный аккаунт сервиса', official: true, createdAt: Date.now() };
  }
  if (D.projects.length || Object.keys(D.users).length > 1) { db.save(); return; }
  const now = Date.now();
  for (const project of demoProjects) {
    if (!D.users[project.handle]) D.users[project.handle] = { id: project.handle, handle: project.handle, name: project.author, initials: project.initials, color: project.color, bio: '', demo: true, createdAt: now - 864e5 * 40 };
  }
  demoProjects.forEach((project, index) => {
    D.projects.push({
      id: project.id, ownerId: project.handle, title: project.title, summary: project.summary, description: project.description,
      category: project.category, url: '', scene: project.scene, slides: project.slides, images: [], tags: project.tags,
      createdAt: now - (index + 1) * 36e5 * 7, seedVotes: project.votes, votes: [], saves: [],
      comments: project.comments.map(comment => ({ id: randomUUID(), userId: null, name: comment.name, text: comment.text, time: comment.time, createdAt: now - 36e5 }))
    });
  });
  const authors = { 'про.стим': 'prostim', 'Алина': 'alinar', 'Дан': 'danm' };
  initialTopics.forEach((topic, index) => {
    D.topics.push({
      id: topic.id, userId: authors[topic.author] || 'prostim', title: topic.title, category: topic.category, pinned: Boolean(topic.pinned), createdAt: now - index * 864e5,
      replies: topic.replies.map(text => ({ id: randomUUID(), userId: 'prostim', text, createdAt: now - index * 864e5 + 6e5 }))
    });
  });
  db.save();
}

/* Views */

function userStats() {
  const stats = new Map(Object.keys(D.users).map(id => [id, { projects: 0, votesReceived: 0, followers: 0, following: 0, comments: 0, scores: [] }]));
  for (const project of D.projects) {
    const entry = stats.get(project.ownerId);
    if (!entry) continue;
    entry.projects += 1;
    entry.votesReceived += project.votes.length + (project.seedVotes || 0);
    entry.comments += project.comments.length;
  }
  for (const [follower, list] of Object.entries(D.follows)) {
    if (stats.has(follower)) stats.get(follower).following = list.length;
    for (const id of list) if (stats.has(id)) stats.get(id).followers += 1;
  }
  for (const rating of D.ratings) stats.get(rating.targetId)?.scores.push(rating.score);
  return stats;
}

function publicUser(user, stats = userStats()) {
  if (!user) return null;
  const entry = stats.get(user.id) || { projects: 0, votesReceived: 0, followers: 0, following: 0, comments: 0, scores: [] };
  return {
    id: user.id, handle: user.handle, name: user.name, initials: user.initials, color: user.color, avatar: user.avatar || '', bio: user.bio || '',
    createdAt: user.createdAt, demo: Boolean(user.demo), official: Boolean(user.official),
    projects: entry.projects, followers: entry.followers, following: entry.following, votesReceived: entry.votesReceived,
    ...trustSummary(entry)
  };
}

function personRef(userId, fallbackName = 'Гость') {
  const user = D.users[userId];
  return user ? { name: user.name, handle: user.handle, initials: user.initials, color: user.color, avatar: user.avatar || '' } : { name: fallbackName, handle: '', initials: initialsOf(fallbackName), color: '#cfd9c4', avatar: '' };
}

function projectMedia(project) {
  return project.media || (project.images || []).map(url => ({ type: 'image', url }));
}

function projectView(project, meId) {
  const owner = D.users[project.ownerId] || { name: 'Автор', handle: 'unknown', initials: '?', color: '#cfd9c4' };
  const voted = Boolean(meId && project.votes.includes(meId));
  return {
    id: project.id, title: project.title, summary: project.summary, description: project.description, category: project.category,
    url: project.url, video: project.video || '', scene: project.scene, media: projectMedia(project), images: project.images || [], tags: project.tags || [], createdAt: project.createdAt,
    slides: projectMedia(project).length || project.slides || 1,
    author: owner.name, handle: owner.handle, initials: owner.initials, color: owner.color, avatar: owner.avatar || '',
    votes: (project.seedVotes || 0) + project.votes.length - Number(voted),
    saves: project.saves.length,
    stats: cleanStats(D.feedStats[project.id]),
    comments: project.comments.map(comment => ({ ...personRef(comment.userId, comment.name), text: comment.text, time: comment.time || '', createdAt: comment.createdAt }))
  };
}

function topicView(topic) {
  const author = personRef(topic.userId);
  return {
    id: topic.id, title: topic.title, category: topic.category, pinned: topic.pinned, createdAt: topic.createdAt,
    author: author.name, handle: author.handle, color: author.color, avatar: author.avatar,
    replies: topic.replies.map(reply => ({ ...personRef(reply.userId), text: reply.text, createdAt: reply.createdAt }))
  };
}

function threadsFor(meId) {
  const byOther = new Map();
  for (const message of D.messages) {
    if (message.from !== meId && message.to !== meId) continue;
    const other = message.from === meId ? message.to : message.from;
    if (!byOther.has(other)) byOther.set(other, []);
    byOther.get(other).push(message);
  }
  const reads = D.reads[meId] || {};
  return [...byOther.entries()].filter(([other]) => D.users[other]).map(([other, list]) => {
    const user = D.users[other];
    return {
      id: user.handle, handle: user.handle, name: user.name, initials: user.initials, color: user.color, avatar: user.avatar || '', official: Boolean(user.official),
      unread: list.filter(message => message.to === meId && message.createdAt > (reads[other] || 0)).length,
      lastAt: list[list.length - 1].createdAt,
      messages: list.map(message => ({ from: message.from === meId ? 'me' : 'them', text: message.text, createdAt: message.createdAt }))
    };
  }).sort((left, right) => right.lastAt - left.lastAt);
}

function userByHandle(handle) {
  const key = String(handle || '').toLowerCase();
  return Object.values(D.users).find(user => user.handle === key) || null;
}

/* Workspaces, devices and access */

function roleFor(workspace, userId) {
  if (!workspace || !userId) return null;
  if (workspace.ownerId === userId) return 'owner';
  return workspace.shares?.find(share => share.userId === userId)?.role || null;
}

function workspaceAudience(workspace) {
  return [workspace.ownerId, ...(workspace.shares || []).map(share => share.userId)];
}

function taskSummary(task) {
  const author = D.users[task.userId];
  return { id: task.id, prompt: task.prompt, mode: task.mode, status: task.status, engine: task.engine, createdAt: task.createdAt, finishedAt: task.finishedAt || null, costUsd: task.costUsd ?? null, handle: author?.handle || '', author: author?.name || '' };
}

function workspaceView(workspace, userId, detailed = false) {
  const device = D.devices[workspace.deviceId];
  const owner = D.users[workspace.ownerId];
  const tasks = Object.values(D.tasks).filter(task => task.workspaceId === workspace.id).sort((left, right) => left.createdAt - right.createdAt);
  const view = {
    id: workspace.id, name: workspace.name, present: workspace.present !== false, branch: workspace.branch || '', dirty: workspace.dirty || 0, isGit: Boolean(workspace.isGit),
    role: roleFor(workspace, userId), ownerHandle: owner?.handle || '', ownerName: owner?.name || '',
    device: device ? { id: device.id, name: device.name, platform: device.platform, online: agentStreams.has(device.id), lastSeen: device.lastSeen || null, allow: device.allow || 'edit', engines: device.engines || [] } : null,
    lastTask: tasks.length ? taskSummary(tasks[tasks.length - 1]) : null,
    taskCount: tasks.length
  };
  if (detailed) {
    view.tasks = tasks.slice(-30).map(task => ({ ...taskSummary(task), events: task.events }));
    if (view.role === 'owner') view.shares = (workspace.shares || []).map(share => ({ ...personRef(share.userId), role: share.role }));
  }
  return view;
}

function requireWorkspace(id, user, minimum = 'view') {
  const workspace = D.workspaces[id];
  const role = roleFor(workspace, user?.id);
  if (!workspace || !role) fail(404, 'Проект не найден');
  const rank = { view: 0, run: 1, owner: 2 };
  if (rank[role] < rank[minimum]) fail(403, 'Недостаточно прав');
  return { workspace, role, device: D.devices[workspace.deviceId] };
}

/* Live channels: browsers and device agents over Server-Sent Events */

const browserStreams = new Map();
const agentStreams = new Map();
const pending = new Map();

function sse(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function pushTo(userIds, event, data) {
  for (const id of new Set(userIds)) for (const stream of browserStreams.get(id) || []) sse(stream, event, data);
}

function openStream(request, response) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  response.write('retry: 3000\n\n');
  const ping = setInterval(() => response.write(': ping\n\n'), 20000);
  request.on('close', () => clearInterval(ping));
}

function notifyDevice(device) {
  const audience = new Set([device.ownerId]);
  for (const workspace of Object.values(D.workspaces)) if (workspace.deviceId === device.id) workspaceAudience(workspace).forEach(id => audience.add(id));
  pushTo([...audience], 'workspaces', { deviceId: device.id, online: agentStreams.has(device.id) });
}

function callAgent(device, type, args = {}, timeout = 20000) {
  const stream = device && agentStreams.get(device.id);
  if (!stream) return Promise.reject(new HttpError(409, 'Компьютер не в сети. Запусти агент про.стим.'));
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new HttpError(504, 'Компьютер не ответил вовремя')); }, timeout);
    pending.set(id, { deviceId: device.id, resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    sse(stream, 'cmd', { id, type, ...args });
  });
}

function deliverTask(task) {
  const workspace = D.workspaces[task.workspaceId];
  const device = workspace && D.devices[workspace.deviceId];
  const stream = device && agentStreams.get(device.id);
  if (!stream) return false;
  sse(stream, 'cmd', { id: randomUUID(), type: 'task', taskId: task.id, workspaceKey: workspace.key, prompt: task.prompt, mode: task.mode, engine: task.engine, sessionId: task.resumeSessionId || null });
  return true;
}

function updateTask(task, patch, events = []) {
  Object.assign(task, patch);
  if (events.length) {
    events = events.slice(0, 200);
    for (const event of events) event.seq = task.nextSeq = (task.nextSeq || 0) + 1;
    task.events.push(...events);
    if (task.events.length > 700) task.events.splice(1, task.events.length - 700);
  }
  db.save();
  const workspace = D.workspaces[task.workspaceId];
  if (workspace) pushTo(workspaceAudience(workspace), 'task', { workspaceId: workspace.id, task: taskSummary(task), events });
}

function sanitizeEvent(event) {
  if (!event || typeof event !== 'object' || typeof event.kind !== 'string') return null;
  const result = {};
  for (const [key, value] of Object.entries(event).slice(0, 20)) {
    if (typeof value === 'string') result[key] = clip(value, key === 'text' || key === 'output' ? 12000 : 2000);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) result[key] = value;
    else if (Array.isArray(value)) result[key] = value.slice(0, 400).map(item => typeof item === 'object' && item ? Object.fromEntries(Object.entries(item).slice(0, 6).map(([name, inner]) => [name, typeof inner === 'string' ? clip(inner, 600) : inner])) : clip(item, 600));
  }
  result.t = Number(event.t) || Date.now();
  return result;
}

/* HTTP plumbing */

const routes = [];
function on(method, pattern, handler) {
  routes.push({ method, regex: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler });
}

async function readJson(request, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) fail(413, 'Слишком большой запрос');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    fail(400, 'Неверный формат данных');
  }
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '').split(',')[0].trim();
}

function isSecure(request) {
  return request.headers['x-forwarded-proto'] === 'https' || Boolean(request.socket.encrypted);
}

function sessionCookie(request, value, maxAge) {
  return `ps_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure(request) ? '; Secure' : ''}`;
}

function currentUser(request) {
  const raw = parseCookies(request.headers.cookie).ps_session;
  if (!raw) return null;
  const session = D.sessions[sha256(raw)];
  if (!session || session.expiresAt < Date.now()) return null;
  return D.users[session.userId] || null;
}

function currentDevice(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization || '');
  if (!match) return null;
  const hash = sha256(match[1].trim());
  return Object.values(D.devices).find(device => device.tokenHash === hash && !device.revoked) || null;
}

const needUser = user => user || fail(401, 'Нужно войти в аккаунт');
const authLimit = limiter(20, 10 * 60 * 1000);
const writeLimit = limiter(240, 60 * 1000);

/* Auth and profile */

async function startSession(request, user) {
  const raw = token();
  D.sessions[sha256(raw)] = { userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + SESSION_DAYS * 864e5 };
  for (const [key, session] of Object.entries(D.sessions)) if (session.expiresAt < Date.now()) delete D.sessions[key];
  db.save();
  return { 'Set-Cookie': sessionCookie(request, raw, SESSION_DAYS * 86400) };
}

on('POST', '/api/auth/register', async ({ request, body }) => {
  if (!authLimit(clientIp(request))) fail(429, 'Слишком много попыток, подожди немного');
  const handle = String(body.handle || '').trim().toLowerCase();
  const name = cleanText(body.name, 40);
  const password = String(body.password || '');
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) fail(400, 'Ник: 3–20 символов, латиница, цифры или _');
  if (['me', 'admin', 'api', 'root', 'support', 'prostim'].includes(handle) || userByHandle(handle)) fail(409, 'Этот ник уже занят');
  if (!name) fail(400, 'Укажи имя');
  if (password.length < 6 || password.length > 200) fail(400, 'Пароль: минимум 6 символов');
  const id = randomUUID();
  const user = { id, handle, name, initials: initialsOf(name), color: colorFor(handle), bio: '', passwordHash: await hashPassword(password), createdAt: Date.now() };
  D.users[id] = user;
  D.messages.push({ id: randomUUID(), from: 'prostim', to: id, text: 'Привет! Это про.стим. Покажи проект в ленте, подай игру в Steam или подключи свой компьютер в ИИ-мире — задачи для Claude Code и Codex можно ставить прямо с телефона.', createdAt: Date.now() });
  return { body: { ok: true }, headers: await startSession(request, user) };
});

on('POST', '/api/auth/login', async ({ request, body }) => {
  if (!authLimit(clientIp(request))) fail(429, 'Слишком много попыток, подожди немного');
  const user = userByHandle(body.handle);
  if (!user?.passwordHash || !(await verifyPassword(String(body.password || ''), user.passwordHash))) fail(401, 'Неверный ник или пароль');
  return { body: { ok: true }, headers: await startSession(request, user) };
});

on('POST', '/api/auth/logout', async ({ request }) => {
  const raw = parseCookies(request.headers.cookie).ps_session;
  if (raw) delete D.sessions[sha256(raw)];
  db.save();
  return { body: { ok: true }, headers: { 'Set-Cookie': sessionCookie(request, '', 0) } };
});

on('PATCH', '/api/me', async ({ user, body }) => {
  needUser(user);
  if (body.name !== undefined) {
    const name = cleanText(body.name, 40);
    if (!name) fail(400, 'Укажи имя');
    user.name = name;
    user.initials = initialsOf(name);
  }
  if (body.bio !== undefined) user.bio = cleanText(body.bio, 300);
  if (body.avatar !== undefined) user.avatar = body.avatar ? ownedUpload(body.avatar, user, 'image').url : '';
  db.save();
  return { me: publicUser(user) };
});

on('GET', '/api/bootstrap', async ({ user }) => {
  const stats = userStats();
  const meId = user?.id;
  return {
    me: publicUser(user, stats),
    users: Object.values(D.users).map(item => publicUser(item, stats)),
    projects: D.projects.map(project => projectView(project, meId)),
    topics: D.topics.map(topicView),
    threads: meId ? threadsFor(meId) : [],
    applications: meId ? D.applications.filter(item => item.userId === meId) : [],
    follows: meId ? (D.follows[meId] || []).map(id => D.users[id]?.handle).filter(Boolean) : [],
    votes: meId ? D.projects.filter(project => project.votes.includes(meId)).map(project => project.id) : [],
    saved: meId ? D.projects.filter(project => project.saves.includes(meId)).map(project => project.id) : [],
    taste: meId ? D.tastes[meId] || null : null,
    myRatings: meId ? Object.fromEntries(D.ratings.filter(rating => rating.raterId === meId).map(rating => [D.users[rating.targetId]?.handle, { score: rating.score, text: rating.text }])) : {},
    workspaces: meId ? Object.values(D.workspaces).filter(workspace => roleFor(workspace, meId)).map(workspace => workspaceView(workspace, meId)) : []
  };
});

/* Feed */

function decodeImage(dataUrl) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) fail(400, 'Картинка должна быть JPEG, PNG или WebP');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 2.5 * 1024 * 1024) fail(413, 'Картинка больше 2,5 МБ');
  const signatures = { jpeg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47] };
  const valid = match[1] === 'webp' ? bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' : signatures[match[1]].every((byte, index) => bytes[index] === byte);
  if (!valid) fail(400, 'Файл не похож на картинку');
  return { bytes, extension: match[1] === 'jpeg' ? 'jpg' : match[1] };
}

function ownedUpload(url, user, kind = '') {
  const name = /^\/uploads\/([\w.-]+)$/.exec(String(url || ''))?.[1];
  const meta = name && D.uploads[name];
  if (!meta || meta.userId !== user.id) fail(400, 'Файл не найден, загрузи его ещё раз');
  if (kind && meta.type !== kind) fail(400, 'Неверный тип файла');
  return { url: `/uploads/${name}`, type: meta.type };
}

function videoLink(value) {
  const url = safeHttpUrl(cleanText(value, 300));
  if (!url) return '';
  const host = new URL(url).hostname.replace(/^www\.|^m\./, '');
  return ['youtube.com', 'youtu.be', 'vimeo.com', 'rutube.ru', 'vk.com', 'vkvideo.ru', 'store.steampowered.com', 'twitch.tv'].includes(host) ? url : '';
}

const uploadLimits = { image: 4 * 1024 * 1024, video: 40 * 1024 * 1024 };
const uploadLimit = limiter(60, 60 * 60 * 1000);

function sniffMedia(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ['image', 'jpg'];
  if (bytes.subarray(0, 4).toString('hex') === '89504e47') return ['image', 'png'];
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return ['image', 'webp'];
  if (bytes.subarray(0, 4).toString('hex') === '1a45dfa3') return ['video', 'webm'];
  if (bytes.subarray(4, 8).toString() === 'ftyp') return ['video', /qt {2}/.test(bytes.subarray(8, 12).toString()) ? 'mov' : 'mp4'];
  return null;
}

// Raw upload: the body is the file itself. Only image/* and video/* content types are accepted,
// which a cross-site form cannot send without a CORS preflight.
on('POST', '/api/uploads', async ({ user, request }) => {
  needUser(user);
  const declared = String(request.headers['content-type'] || '');
  const kind = declared.startsWith('video/') ? 'video' : declared.startsWith('image/') ? 'image' : fail(415, 'Можно загружать только картинки и видео');
  if (!uploadLimit(user.id)) fail(429, 'Слишком много загрузок, подожди немного');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > uploadLimits[kind]) fail(413, kind === 'video' ? 'Видео больше 40 МБ — сожми его или дай ссылку на YouTube' : 'Картинка больше 4 МБ');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const sniffed = sniffMedia(bytes);
  if (!sniffed || sniffed[0] !== kind) fail(400, kind === 'video' ? 'Нужен MP4, MOV или WebM' : 'Нужна картинка JPEG, PNG или WebP');
  const name = `${sniffed[0][0]}-${randomUUID().slice(0, 18)}.${sniffed[1]}`;
  await db.putUpload(name, bytes);
  D.uploads[name] = { userId: user.id, type: sniffed[0], size: bytes.length, createdAt: Date.now() };
  db.save();
  return { url: `/uploads/${name}`, type: sniffed[0] };
});

on('POST', '/api/projects', async ({ user, request }) => {
  needUser(user);
  const body = await readJson(request, 12 * 1024 * 1024);
  const title = cleanText(body.title, 80);
  const summary = cleanText(body.summary, 160);
  if (!title || !summary) fail(400, 'Нужны название и короткое описание');
  const id = `p-${randomUUID().slice(0, 12)}`;
  const images = [];
  for (const [index, dataUrl] of (Array.isArray(body.images) ? body.images.slice(0, 4) : []).entries()) {
    const { bytes, extension } = decodeImage(dataUrl);
    const name = `${id}-${index}.${extension}`;
    await db.putUpload(name, bytes);
    images.push(`/uploads/${name}`);
  }
  const media = images.map(url => ({ type: 'image', url }));
  for (const item of Array.isArray(body.media) ? body.media.slice(0, 8) : []) {
    const upload = ownedUpload(item?.url, user);
    const poster = item?.poster && upload.type === 'video' ? ownedUpload(item.poster, user, 'image').url : '';
    media.push({ type: upload.type, url: upload.url, ...(poster ? { poster } : {}) });
  }
  const project = {
    id, ownerId: user.id, title, summary, description: cleanText(body.description, 2400),
    category: ['games', 'apps', 'tools'].includes(body.category) ? body.category : 'apps',
    url: safeHttpUrl(cleanText(body.url, 500)), scene: ['forest', 'coast', 'board', 'analytics'].includes(body.scene) ? body.scene : 'board',
    slides: 1, images: media.filter(item => item.type === 'image').map(item => item.url), media, video: videoLink(body.video), tags: (Array.isArray(body.tags) ? body.tags : []).map(tag => cleanText(tag, 24)).filter(Boolean).slice(0, 5),
    createdAt: Date.now(), seedVotes: 0, votes: [], saves: [], comments: []
  };
  if (!project.tags.length) project.tags = ['Новый проект'];
  D.projects.push(project);
  db.save();
  return { project: projectView(project, user.id) };
});

function requireProject(id) {
  return D.projects.find(project => project.id === id) || fail(404, 'Проект не найден');
}

on('DELETE', '/api/projects/:id', async ({ user, params }) => {
  needUser(user);
  const project = requireProject(params.id);
  if (project.ownerId !== user.id) fail(403, 'Удалить может только автор');
  D.projects.splice(D.projects.indexOf(project), 1);
  delete D.feedStats[project.id];
  db.save();
  return { ok: true };
});

on('POST', '/api/projects/:id/vote', async ({ user, params }) => {
  needUser(user);
  const project = requireProject(params.id);
  const voted = !project.votes.includes(user.id);
  project.votes = voted ? [...project.votes, user.id] : project.votes.filter(id => id !== user.id);
  db.save();
  return { voted };
});

on('POST', '/api/projects/:id/save', async ({ user, params }) => {
  needUser(user);
  const project = requireProject(params.id);
  const saved = !project.saves.includes(user.id);
  project.saves = saved ? [...project.saves, user.id] : project.saves.filter(id => id !== user.id);
  db.save();
  return { saved };
});

on('POST', '/api/projects/:id/comments', async ({ user, params, body }) => {
  needUser(user);
  const project = requireProject(params.id);
  const text = cleanText(body.text, 1200);
  if (!text) fail(400, 'Пустой комментарий');
  project.comments.push({ id: randomUUID(), userId: user.id, text, createdAt: Date.now() });
  db.save();
  if (project.ownerId !== user.id) pushTo([project.ownerId], 'notice', { text: `${user.name} прокомментировал «${project.title}»` });
  return { project: projectView(project, user.id) };
});

/* Feed attention: what people watch, skip and come back to */

const feedLimit = limiter(90, 60 * 1000);

function rankingProject(project) {
  return { id: project.id, category: project.category, tags: project.tags || [], handle: D.users[project.ownerId]?.handle || '', media: projectMedia(project) };
}

on('POST', '/api/feed/events', async ({ user, request, body }) => {
  if (!feedLimit(user?.id || clientIp(request))) fail(429, 'Слишком часто');
  const events = Array.isArray(body.events) ? body.events.slice(0, 40) : [];
  const byId = new Map(D.projects.map(project => [project.id, project]));
  const taste = user ? cleanTaste(D.tastes[user.id]) : null;
  let accepted = 0;
  for (const event of events) {
    const project = byId.get(String(event?.id || ''));
    const type = String(event?.type || '');
    if (!project || !(type === 'view' || Object.hasOwn(tasteSignals, type))) continue;
    const signal = { type, dwell: Math.max(0, Math.min(600000, Number(event.dwell) || 0)), expected: Math.max(1500, Math.min(60000, Number(event.expected) || 4000)) };
    if (statSignals.includes(type) && project.ownerId !== user?.id) D.feedStats[project.id] = recordStat(cleanStats(D.feedStats[project.id]), signal);
    if (taste) recordSignal(taste, rankingProject(project), signal);
    accepted += 1;
  }
  if (taste) D.tastes[user.id] = taste;
  if (accepted) db.save();
  return { accepted };
});

on('DELETE', '/api/me/taste', async ({ user }) => {
  needUser(user);
  D.tastes[user.id] = emptyTaste();
  db.save();
  return { taste: D.tastes[user.id] };
});

/* People: follows and ratings */

on('POST', '/api/users/:handle/follow', async ({ user, params }) => {
  needUser(user);
  const target = userByHandle(params.handle) || fail(404, 'Автор не найден');
  if (target.id === user.id) fail(400, 'Нельзя подписаться на себя');
  const list = D.follows[user.id] || [];
  const following = !list.includes(target.id);
  D.follows[user.id] = following ? [...list, target.id] : list.filter(id => id !== target.id);
  db.save();
  return { following, user: publicUser(target) };
});

on('POST', '/api/users/:handle/rate', async ({ user, params, body }) => {
  needUser(user);
  const target = userByHandle(params.handle) || fail(404, 'Автор не найден');
  if (target.id === user.id) fail(400, 'Нельзя оценить себя');
  if (target.official) fail(400, 'Официальный аккаунт не оценивается');
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) fail(400, 'Оценка от 1 до 5');
  const text = cleanText(body.text, 500);
  const existing = D.ratings.find(rating => rating.raterId === user.id && rating.targetId === target.id);
  if (existing) Object.assign(existing, { score, text, updatedAt: Date.now() });
  else D.ratings.push({ id: randomUUID(), raterId: user.id, targetId: target.id, score, text, createdAt: Date.now() });
  db.save();
  pushTo([target.id], 'notice', { text: `${user.name} оценил тебя: ${'★'.repeat(score)}` });
  return { user: publicUser(target), myRating: { score, text } };
});

on('DELETE', '/api/users/:handle/rate', async ({ user, params }) => {
  needUser(user);
  const target = userByHandle(params.handle) || fail(404, 'Автор не найден');
  D.ratings = D.ratings.filter(rating => !(rating.raterId === user.id && rating.targetId === target.id));
  db.save();
  return { user: publicUser(target) };
});

on('GET', '/api/users/:handle/reviews', async ({ params }) => {
  const target = userByHandle(params.handle) || fail(404, 'Автор не найден');
  return {
    reviews: D.ratings.filter(rating => rating.targetId === target.id).sort((left, right) => (right.updatedAt || right.createdAt) - (left.updatedAt || left.createdAt))
      .map(rating => ({ ...personRef(rating.raterId), score: rating.score, text: rating.text, createdAt: rating.updatedAt || rating.createdAt }))
  };
});

/* Steam: discussions and applications */

on('POST', '/api/topics', async ({ user, body }) => {
  needUser(user);
  const title = cleanText(body.title, 160);
  const text = cleanText(body.text, 2400);
  if (!title || !text) fail(400, 'Нужны заголовок и текст');
  const topic = { id: `t-${randomUUID().slice(0, 12)}`, userId: user.id, title, category: ['Разработка', 'Релизы', 'Паблишинг', 'Общее'].includes(body.category) ? body.category : 'Общее', pinned: false, createdAt: Date.now(), replies: [{ id: randomUUID(), userId: user.id, text, createdAt: Date.now() }] };
  D.topics.unshift(topic);
  db.save();
  return { topic: topicView(topic) };
});

on('POST', '/api/topics/:id/replies', async ({ user, params, body }) => {
  needUser(user);
  const topic = D.topics.find(item => item.id === params.id) || fail(404, 'Тема не найдена');
  const text = cleanText(body.text, 2000);
  if (!text) fail(400, 'Пустой ответ');
  topic.replies.push({ id: randomUUID(), userId: user.id, text, createdAt: Date.now() });
  db.save();
  return { topic: topicView(topic) };
});

on('POST', '/api/applications', async ({ user, body }) => {
  needUser(user);
  const application = {
    id: randomUUID(), userId: user.id, title: cleanText(body.title, 100), stage: cleanText(body.stage, 40) || 'Демо',
    url: safeHttpUrl(cleanText(body.url, 500)), description: cleanText(body.description, 2400), contact: cleanText(body.contact, 120),
    status: 'Отправлена', createdAt: Date.now()
  };
  if (!application.title || !application.description || !application.contact) fail(400, 'Заполни название, описание и контакт');
  D.applications.unshift(application);
  D.messages.push({ id: randomUUID(), from: 'prostim', to: user.id, text: `Заявка «${application.title}» отправлена издателю. Ответ придёт в этот чат.`, createdAt: Date.now() });
  db.save();
  pushTo([user.id], 'dm', {});
  return { application };
});

/* Direct messages */

on('POST', '/api/messages/:handle', async ({ user, params, body }) => {
  needUser(user);
  const target = userByHandle(params.handle) || fail(404, 'Пользователь не найден');
  if (target.id === user.id) fail(400, 'Нельзя написать себе');
  const text = cleanText(body.text, 2000);
  if (!text) fail(400, 'Пустое сообщение');
  D.messages.push({ id: randomUUID(), from: user.id, to: target.id, text, createdAt: Date.now() });
  D.reads[user.id] = { ...(D.reads[user.id] || {}), [target.id]: Date.now() };
  db.save();
  pushTo([target.id], 'dm', { from: user.handle });
  return { threads: threadsFor(user.id) };
});

on('POST', '/api/messages/:handle/read', async ({ user, params }) => {
  needUser(user);
  const target = userByHandle(params.handle) || fail(404, 'Пользователь не найден');
  D.reads[user.id] = { ...(D.reads[user.id] || {}), [target.id]: Date.now() };
  db.save();
  return { ok: true };
});

/* AI world: devices, workspaces, tasks */

on('POST', '/api/devices/pair-code', async ({ user }) => {
  needUser(user);
  for (const [code, entry] of Object.entries(D.pairCodes)) if (entry.expiresAt < Date.now() || entry.userId === user.id) delete D.pairCodes[code];
  const code = pairingCode();
  D.pairCodes[code] = { userId: user.id, expiresAt: Date.now() + 15 * 60 * 1000 };
  db.save();
  return { code, expiresAt: D.pairCodes[code].expiresAt };
});

on('GET', '/api/workspaces', async ({ user }) => {
  needUser(user);
  return { workspaces: Object.values(D.workspaces).filter(workspace => roleFor(workspace, user.id)).map(workspace => workspaceView(workspace, user.id)) };
});

on('GET', '/api/workspaces/:id', async ({ user, params }) => {
  needUser(user);
  const { workspace } = requireWorkspace(params.id, user);
  return { workspace: workspaceView(workspace, user.id, true) };
});

on('POST', '/api/workspaces/:id/tasks', async ({ user, params, body }) => {
  needUser(user);
  if (!writeLimit(user.id)) fail(429, 'Слишком много задач подряд');
  const { workspace, role, device } = requireWorkspace(params.id, user, 'run');
  const prompt = cleanText(body.prompt, 8000);
  if (!prompt) fail(400, 'Опиши задачу');
  const mode = MODES.includes(body.mode) ? body.mode : 'read';
  const ceiling = MODES.indexOf(device?.allow || 'edit');
  if (MODES.indexOf(mode) > ceiling) fail(403, 'Компьютер не разрешает этот режим. Владелец задаёт предел при запуске агента.');
  if (mode === 'full' && role !== 'owner') fail(403, 'Полный доступ доступен только владельцу');
  const engines = device?.engines?.filter(engine => engine.ok).map(engine => engine.id) || [];
  const engine = engines.includes(body.engine) ? body.engine : engines[0] || 'demo';
  let resumeSessionId = null;
  if (body.continue) {
    const previous = Object.values(D.tasks).filter(task => task.workspaceId === workspace.id && task.engine === engine && task.sessionId).sort((left, right) => right.createdAt - left.createdAt)[0];
    resumeSessionId = previous?.sessionId || null;
  }
  const task = { id: `k-${randomUUID().slice(0, 12)}`, workspaceId: workspace.id, userId: user.id, prompt, mode, engine, resumeSessionId, status: 'waiting', createdAt: Date.now(), events: [] };
  D.tasks[task.id] = task;
  const delivered = deliverTask(task);
  updateTask(task, { status: delivered ? 'sent' : 'waiting' });
  const ids = Object.values(D.tasks).filter(item => item.workspaceId === workspace.id).sort((left, right) => left.createdAt - right.createdAt).map(item => item.id);
  for (const old of ids.slice(0, Math.max(0, ids.length - 60))) delete D.tasks[old];
  return { task: { ...taskSummary(task), events: task.events } };
});

on('POST', '/api/tasks/:id/cancel', async ({ user, params }) => {
  needUser(user);
  const task = D.tasks[params.id] || fail(404, 'Задача не найдена');
  const { device, role } = requireWorkspace(task.workspaceId, user, 'run');
  if (role !== 'owner' && task.userId !== user.id) fail(403, 'Остановить может автор задачи или владелец');
  if (['waiting', 'sent'].includes(task.status) && !agentStreams.has(device?.id)) updateTask(task, { status: 'cancelled', finishedAt: Date.now() });
  else await callAgent(device, 'cancel', { taskId: task.id }, 8000).catch(() => updateTask(task, { status: 'cancelled', finishedAt: Date.now() }));
  return { task: taskSummary(task) };
});

on('GET', '/api/workspaces/:id/tree', async ({ user, params }) => {
  needUser(user);
  const { workspace, device } = requireWorkspace(params.id, user);
  return await callAgent(device, 'tree', { workspaceKey: workspace.key });
});

on('GET', '/api/workspaces/:id/file', async ({ user, params, query }) => {
  needUser(user);
  const { workspace, device } = requireWorkspace(params.id, user);
  return await callAgent(device, 'read', { workspaceKey: workspace.key, path: String(query.get('path') || '') });
});

on('PUT', '/api/workspaces/:id/file', async ({ user, params, request }) => {
  needUser(user);
  const { workspace, device } = requireWorkspace(params.id, user, 'run');
  if (MODES.indexOf(device?.allow || 'edit') < 1) fail(403, 'Компьютер открыт только для чтения');
  const body = await readJson(request, 1024 * 1024);
  return await callAgent(device, 'write', { workspaceKey: workspace.key, path: String(body.path || ''), content: String(body.content ?? ''), baseHash: String(body.baseHash || '') });
});

on('GET', '/api/workspaces/:id/git', async ({ user, params }) => {
  needUser(user);
  const { workspace, device } = requireWorkspace(params.id, user);
  return await callAgent(device, 'git', { workspaceKey: workspace.key }, 30000);
});

on('POST', '/api/workspaces/:id/shares', async ({ user, params, body }) => {
  needUser(user);
  const { workspace } = requireWorkspace(params.id, user, 'owner');
  const target = userByHandle(String(body.handle || '').replace(/^@/, '')) || fail(404, 'Пользователь с таким ником не найден');
  if (target.id === user.id) fail(400, 'Это ты');
  const role = body.role === 'run' ? 'run' : 'view';
  workspace.shares = [...(workspace.shares || []).filter(share => share.userId !== target.id), { userId: target.id, role }];
  db.save();
  pushTo([target.id], 'workspaces', {});
  pushTo([target.id], 'notice', { text: `${user.name} открыл тебе проект «${workspace.name}»` });
  return { workspace: workspaceView(workspace, user.id, true) };
});

on('DELETE', '/api/workspaces/:id/shares/:handle', async ({ user, params }) => {
  needUser(user);
  const { workspace } = requireWorkspace(params.id, user, 'owner');
  const target = userByHandle(params.handle);
  workspace.shares = (workspace.shares || []).filter(share => share.userId !== target?.id);
  db.save();
  if (target) pushTo([target.id], 'workspaces', {});
  return { workspace: workspaceView(workspace, user.id, true) };
});

on('DELETE', '/api/devices/:id', async ({ user, params }) => {
  needUser(user);
  const device = D.devices[params.id];
  if (!device || device.ownerId !== user.id) fail(404, 'Устройство не найдено');
  device.revoked = true;
  device.tokenHash = '';
  agentStreams.get(device.id)?.end();
  agentStreams.delete(device.id);
  for (const workspace of Object.values(D.workspaces)) if (workspace.deviceId === device.id) delete D.workspaces[workspace.id];
  db.save();
  notifyDevice(device);
  return { ok: true };
});

/* Device agent protocol */

on('POST', '/api/agent/claim', async ({ request, body }) => {
  if (!authLimit(clientIp(request))) fail(429, 'Слишком много попыток');
  const code = String(body.code || '').trim().toUpperCase();
  const entry = D.pairCodes[code];
  if (!entry || entry.expiresAt < Date.now()) fail(401, 'Код не найден или устарел. Открой «ИИ-мир → Подключить» и возьми новый.');
  delete D.pairCodes[code];
  const raw = token();
  const device = { id: `d-${randomUUID().slice(0, 12)}`, ownerId: entry.userId, name: cleanText(body.name, 60) || 'Компьютер', platform: cleanText(body.platform, 30), tokenHash: sha256(raw), allow: MODES.includes(body.allow) ? body.allow : 'edit', engines: [], createdAt: Date.now(), lastSeen: Date.now() };
  D.devices[device.id] = device;
  db.save();
  pushTo([entry.userId], 'paired', { deviceId: device.id, name: device.name });
  return { token: raw, deviceId: device.id, owner: D.users[entry.userId]?.handle };
});

on('GET', '/api/agent/stream', async ({ request, response, device }) => {
  if (!device) fail(401, 'Устройство не привязано');
  agentStreams.get(device.id)?.end();
  openStream(request, response);
  agentStreams.set(device.id, response);
  device.lastSeen = Date.now();
  notifyDevice(device);
  for (const task of Object.values(D.tasks).sort((left, right) => left.createdAt - right.createdAt)) {
    if (task.status === 'waiting' && D.workspaces[task.workspaceId]?.deviceId === device.id && deliverTask(task)) updateTask(task, { status: 'sent' });
  }
  request.on('close', () => {
    if (agentStreams.get(device.id) === response) {
      agentStreams.delete(device.id);
      device.lastSeen = Date.now();
      db.save();
      notifyDevice(device);
    }
  });
  return null;
});

on('POST', '/api/agent/hello', async ({ device, body }) => {
  if (!device) fail(401, 'Устройство не привязано');
  device.lastSeen = Date.now();
  device.allow = MODES.includes(body.allow) ? body.allow : device.allow;
  device.engines = (Array.isArray(body.engines) ? body.engines : []).slice(0, 4).map(engine => ({ id: cleanText(engine.id, 20), label: cleanText(engine.label, 60), version: cleanText(engine.version, 40), ok: Boolean(engine.ok), note: cleanText(engine.note, 200) }));
  if (body.name) device.name = cleanText(body.name, 60);
  const reported = Array.isArray(body.workspaces) ? body.workspaces.slice(0, 30) : [];
  const mapping = {};
  const changed = [];
  for (const item of reported) {
    const key = cleanText(item.key, 64);
    if (!key) continue;
    let workspace = Object.values(D.workspaces).find(entry => entry.deviceId === device.id && entry.key === key);
    if (!workspace) {
      workspace = { id: `w-${randomUUID().slice(0, 12)}`, deviceId: device.id, ownerId: device.ownerId, key, shares: [], createdAt: Date.now() };
      D.workspaces[workspace.id] = workspace;
    }
    const next = { name: cleanText(item.name, 80) || 'Проект', branch: cleanText(item.branch, 120), dirty: Number(item.dirty) || 0, isGit: Boolean(item.isGit), present: true };
    if (Object.entries(next).some(([name, value]) => workspace[name] !== value)) changed.push(workspace);
    Object.assign(workspace, next);
    mapping[key] = workspace.id;
  }
  for (const workspace of Object.values(D.workspaces)) {
    if (workspace.deviceId === device.id && !mapping[workspace.key] && workspace.present !== false) { workspace.present = false; changed.push(workspace); }
  }
  const running = new Set(Array.isArray(body.running) ? body.running : []);
  for (const task of Object.values(D.tasks)) {
    if (['sent', 'queued', 'running'].includes(task.status) && D.workspaces[task.workspaceId]?.deviceId === device.id && !running.has(task.id) && Date.now() - task.createdAt > 15000) {
      updateTask(task, { status: 'interrupted', finishedAt: Date.now() }, [{ kind: 'error', text: 'Агент перезапустился, задача прервана', t: Date.now() }]);
    }
  }
  db.save();
  if (changed.length || body.first) notifyDevice(device);
  return { workspaces: mapping, deviceId: device.id };
});

on('POST', '/api/agent/reply', async ({ device, request }) => {
  if (!device) fail(401, 'Устройство не привязано');
  const body = await readJson(request, 4 * 1024 * 1024);
  const entry = pending.get(String(body.id || ''));
  if (entry && entry.deviceId === device.id) {
    pending.delete(body.id);
    if (body.ok) entry.resolve(body.data && typeof body.data === 'object' ? body.data : {});
    else entry.reject(new HttpError(422, cleanText(body.error, 300) || 'Ошибка на компьютере'));
  }
  return { ok: true };
});

on('POST', '/api/agent/events', async ({ device, request }) => {
  if (!device) fail(401, 'Устройство не привязано');
  const body = await readJson(request, 2 * 1024 * 1024);
  const task = D.tasks[String(body.taskId || '')];
  if (!task || D.workspaces[task.workspaceId]?.deviceId !== device.id) return { ok: false };
  const events = (Array.isArray(body.events) ? body.events : []).map(sanitizeEvent).filter(Boolean);
  const patch = {};
  if (['queued', 'running', 'done', 'error', 'cancelled'].includes(body.status)) patch.status = body.status;
  if (['done', 'error', 'cancelled'].includes(body.status)) patch.finishedAt = Date.now();
  for (const event of events) {
    if (event.sessionId) patch.sessionId = event.sessionId;
    if (typeof event.costUsd === 'number') patch.costUsd = event.costUsd;
  }
  updateTask(task, patch, events);
  return { ok: true };
});

/* Static files */

async function serveFile(response, file, cache = 'no-cache') {
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache, 'Content-Length': info.size });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Файл не найден');
  }
}

function inside(base, relative) {
  const file = path.resolve(base, `.${relative}`);
  return file === base || file.startsWith(`${base}${path.sep}`) ? file : null;
}

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; media-src 'self' blob:; connect-src 'self' https://api.github.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};

const server = http.createServer(async (request, response) => {
  for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
  const url = new URL(request.url, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { pathname = '/'; }
  if (pathname.startsWith('/api/')) {
    const route = routes.find(item => item.method === request.method && item.regex.test(pathname));
    if (!route) return sendJson(response, 404, { error: 'Не найдено' });
    try {
      const isAgent = pathname.startsWith('/api/agent/');
      if (!isAgent && pathname !== '/api/uploads' && !['GET', 'HEAD'].includes(request.method) && !String(request.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Нужен JSON');
      const params = route.regex.exec(pathname).groups || {};
      const needsBody = ['POST', 'PATCH', 'DELETE'].includes(request.method) && !['/api/projects', '/api/uploads', '/api/agent/reply', '/api/agent/events'].includes(pathname);
      const body = needsBody ? await readJson(request) : {};
      const result = await route.handler({ request, response, params, query: url.searchParams, body, user: isAgent ? null : currentUser(request), device: isAgent ? currentDevice(request) : null });
      if (result === null) return;
      if (result.body && result.headers) sendJson(response, 200, result.body, result.headers);
      else sendJson(response, 200, result);
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error);
      if (!response.headersSent) sendJson(response, error.status || 500, { error: error instanceof HttpError ? error.message : 'Ошибка сервера' });
    }
    return;
  }
  if (pathname === '/healthz') return sendJson(response, 200, { ok: true });
  if (pathname === '/agent.mjs') return serveFile(response, agentFile);
  if (pathname.startsWith('/uploads/')) {
    const name = pathname.slice('/uploads/'.length);
    const upload = /^[\w.-]+$/.test(name) ? await db.getUpload(name).catch(() => null) : null;
    if (!upload) return sendJson(response, 404, { error: 'Файл не найден' });
    const total = upload.bytes.length;
    const headers = { 'Content-Type': upload.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(total - 1, Number(range[2])) : total - 1;
      if (start >= total || start > end) { response.writeHead(416, { 'Content-Range': `bytes */${total}` }); return response.end(); }
      response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 });
      return response.end(upload.bytes.subarray(start, end + 1));
    }
    response.writeHead(200, { ...headers, 'Content-Length': total });
    return response.end(upload.bytes);
  }
  const file = inside(staticRoot, pathname === '/' ? '/index.html' : pathname);
  if (!file) return sendJson(response, 403, { error: 'Нет доступа' });
  return serveFile(response, file);
});

on('GET', '/api/events', async ({ request, response, user }) => {
  needUser(user);
  openStream(request, response);
  if (!browserStreams.has(user.id)) browserStreams.set(user.id, new Set());
  browserStreams.get(user.id).add(response);
  sse(response, 'hello', { at: Date.now() });
  request.on('close', () => {
    browserStreams.get(user.id)?.delete(response);
    if (!browserStreams.get(user.id)?.size) browserStreams.delete(user.id);
  });
  return null;
});

server.listen(PORT, HOST, () => console.log(`про.стим: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await db.flush();
    process.exit(0);
  });
}
