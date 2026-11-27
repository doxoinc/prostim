import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.mjs';
import { HttpError, fail, sha256, token, hashPassword, verifyPassword, pairingCode, parseCookies, clip, cleanText, safeHttpUrl, initialsOf, colorFor, limiter } from './util.mjs';
import { trustSummary } from '../src/trust.js';
import { demoProjects, initialTopics } from '../src/data.js';
import { cleanStats, cleanTaste, emptyTaste, projectQuality, recordSignal, recordStat, statSignals, tasteSignals } from '../src/recommend.js';
import { cleanDemoUrl, cleanFocus, cleanPostFields, normalizeUrl } from '../src/page.js';
import { chatReactions, reactionSummary, stickerById } from '../src/chat.js';
import { codeLetter, createMailer } from './mail.mjs';
import { authorizeUrl, oauthLabel, oauthProfile, oauthProviders } from './oauth.mjs';
import { createYookassaPayment, paymentsMode, yookassaStatus } from './payments.mjs';
import { aiLimits, boostPlan, boostPrice, plusPlan } from '../src/ads.js';
import { cleanSteam, publisherShouldNotice, repoChecks, sparkPrices, sparkRules, taskFromComment, taskFromDigest } from '../src/ecosystem.js';
import { cleanFeedPrefs, commentDigest, reportReasons } from '../src/social.js';
import { cleanNotifyPrefs, createNotifier, notifyPrefs } from './notify.mjs';
import { vapidKeys } from './push.mjs';
import { embeddable, linkDraft, safeFetch } from './linkpreview.mjs';
import { aiAvailable, aiCommentSummary, aiPostDraft, aiSteamTexts } from './ai.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const staticRoot = path.join(root, 'src');
const agentFile = path.join(root, 'agent', 'prostim-agent.mjs');
const PORT = Number(process.env.PORT) || Number(process.argv[process.argv.indexOf('--port') + 1]) || 4173;
const HOST = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const SESSION_DAYS = 60;
const MODES = ['read', 'edit', 'full'];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const db = await openDatabase({ directory: DATA_DIR, url: process.env.DATABASE_URL });
const mailer = createMailer(process.env, DATA_DIR);
// With a real mailbox every new account confirms its e-mail; REQUIRE_EMAIL=0 or 1 overrides that.
const REQUIRE_EMAIL = process.env.REQUIRE_EMAIL ? process.env.REQUIRE_EMAIL === '1' : mailer.real;
const D = db.data;
seed();
migrate();

// Keys and lists added after the first pilot data was written.
function migrate() {
  for (const key of ['notifications', 'pushSubs', 'blocks', 'feedPrefs', 'secrets']) D[key] ||= {};
  D.reports ||= [];
  for (const project of D.projects) {
    for (const comment of project.comments) comment.id ||= randomUUID();
    project.updates ||= [];
    project.watchers ||= [];
    project.reposts ||= [];
    project.steam = cleanSteam(project.steam);
  }
  vapidKeys(process.env, D.secrets);
  db.save();
}

const notifier = createNotifier({
  D, env: process.env,
  save: () => db.save(),
  live: (userIds, event, data) => pushTo(userIds, event, data),
  keys: () => vapidKeys(process.env, D.secrets),
  get subject() { return process.env.PUSH_SUBJECT || D.secrets.pushSubject || 'mailto:noreply@example.com'; },
  nameOf: userId => D.users[userId]?.name || 'Кто-то',
  projectTitle: projectId => D.projects.find(project => project.id === projectId)?.title || 'проект'
});

/* Blocks: either side of a block stops seeing and reaching the other */

function privacyOf(user) {
  const saved = user?.privacy || {};
  return {
    messages: ['all', 'following', 'nobody'].includes(saved.messages) ? saved.messages : 'all',
    comments: ['all', 'following'].includes(saved.comments) ? saved.comments : 'all',
    reposts: saved.reposts !== false
  };
}

const follows = (userId, otherId) => (D.follows[userId] || []).includes(otherId);

const blockedBy = (userId, otherId) => Boolean(userId && otherId) && (D.blocks[userId] || []).includes(otherId);
const blockedEither = (left, right) => blockedBy(left, right) || blockedBy(right, left);

function visibleTo(project, meId) {
  if (project.ownerId === meId) return true;
  return !project.flagged && !blockedEither(meId, project.ownerId);
}

/* Seed: official account, demo authors and their sample projects */

function seed() {
  if (!D.users.prostim) {
    D.users.prostim = { id: 'prostim', handle: 'prostim', name: 'про.стим', initials: 'ПС', color: '#9fcaff', bio: 'Официальный аккаунт сервиса', official: true, createdAt: Date.now() };
  }
  if (D.projects.length || Object.keys(D.users).length > 1) { addDemoPages(); seedDemoAds(); db.save(); return; }
  const now = Date.now();
  for (const project of demoProjects) {
    if (!D.users[project.handle]) D.users[project.handle] = { id: project.handle, handle: project.handle, name: project.author, initials: project.initials, color: project.color, bio: '', demo: true, createdAt: now - 864e5 * 40 };
  }
  demoProjects.forEach((project, index) => {
    D.projects.push({
      id: project.id, ownerId: project.handle, title: project.title, summary: project.summary, description: project.description,
      category: project.category, url: '', scene: project.scene, slides: project.slides, images: [], tags: project.tags,
      createdAt: now - (index + 1) * 36e5 * 7, seedVotes: project.votes, votes: [], saves: [],
      comments: project.comments.map(comment => ({ id: randomUUID(), userId: null, name: comment.name, text: comment.text, time: comment.time, createdAt: now - 36e5 })),
      ...cleanPostFields(project)
    });
  });
  const authors = { 'про.стим': 'prostim', 'Алина': 'alinar', 'Дан': 'danm' };
  initialTopics.forEach((topic, index) => {
    D.topics.push({
      id: topic.id, userId: authors[topic.author] || 'prostim', title: topic.title, category: topic.category, pinned: Boolean(topic.pinned), createdAt: now - index * 864e5,
      replies: topic.replies.map(text => ({ id: randomUUID(), userId: 'prostim', text, createdAt: now - index * 864e5 + 6e5 }))
    });
  });
  seedDemoAds();
  db.save();
}

// Two demo posts run as ads, so the feed shows how promotion looks before anyone has bought it.
// DEMO_ADS=0 takes them out.
function seedDemoAds() {
  D.promotions ||= [];
  if (process.env.DEMO_ADS === '0') { D.promotions = D.promotions.filter(item => !item.demo); return; }
  const now = Date.now();
  for (const projectId of ['between-shores', 'pulse']) {
    const project = D.projects.find(item => item.id === projectId);
    if (!project || D.promotions.some(item => item.demo && item.projectId === projectId)) continue;
    D.promotions.push({ id: `ad-demo-${projectId}`, projectId, ownerId: project.ownerId, plan: 'month', days: 3650, impressions: 1e9, shown: 0, clicks: 0, status: 'active', demo: true, createdAt: now, startsAt: now, endsAt: now + 3650 * 864e5 });
  }
}

// Demo posts seeded before posts had pages get the page, facts and colours from data.js once.
function addDemoPages() {
  for (const demo of demoProjects) {
    const project = D.projects.find(item => item.id === demo.id && item.ownerId === demo.handle);
    if (project && !project.theme) Object.assign(project, cleanPostFields(demo));
  }
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
    createdAt: user.createdAt, demo: Boolean(user.demo), official: Boolean(user.official), plus: hasPlus(user),
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
    ...cleanPostFields(project, block => ({ url: block.url, type: block.type })),
    slides: projectMedia(project).length || project.slides || 1,
    author: owner.name, handle: owner.handle, initials: owner.initials, color: owner.color, avatar: owner.avatar || '',
    votes: (project.seedVotes || 0) + project.votes.length - Number(voted),
    saves: project.saves.length,
    stats: cleanStats(D.feedStats[project.id]),
    demoBlocked: Boolean(project.demoBlocked),
    lastUpdateAt: project.lastUpdateAt || 0,
    updates: (project.updates || []).map(update => ({ id: update.id, title: update.title, text: update.text || '', version: update.version || '', image: update.image || '', createdAt: update.createdAt })),
    watchers: (project.watchers || []).length,
    reposts: (project.reposts || []).length,
    reposters: (project.reposts || []).filter(id => id === meId || privacyOf(D.users[id]).reposts).slice(-30).map(id => D.users[id]?.handle).filter(Boolean),
    flagged: project.ownerId === meId && Boolean(project.flagged),
    steam: { status: project.steam?.status || 'none', releaseAt: project.steam?.releaseAt || 0, ...(project.ownerId === meId ? { checklist: project.steam?.checklist || {} } : {}) },
    ...(project.ownerId === meId ? { workspaceId: project.workspaceId || '', repo: project.repo || null, publisherNoticed: project.publisherNoticed || 0, applicationId: project.applicationId || '' } : {}),
    comments: project.comments.filter(comment => !comment.hidden && !blockedEither(meId, comment.userId)).map(comment => ({
      id: comment.id, ...personRef(comment.userId, comment.name), text: comment.text || '', time: comment.time || '', createdAt: comment.createdAt,
      likes: (comment.likes || []).length, liked: Boolean(meId && (comment.likes || []).includes(meId)), replyTo: comment.replyTo || '',
      voice: comment.voice || '', duration: comment.duration || 0, pinned: project.pinnedComment === comment.id, mine: Boolean(meId && comment.userId === meId),
      byAuthor: comment.userId ? comment.userId === project.ownerId : comment.name === owner.name, mention: D.users[comment.mentionId]?.handle || '',
      accepted: Boolean(comment.accepted), taskId: project.ownerId === meId ? comment.taskId || '' : '', tasked: Boolean(comment.taskId)
    }))
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
      blocked: blockedBy(meId, other), blockedMe: blockedBy(other, meId),
      messages: list.map(message => ({ id: message.id, from: message.from === meId ? 'me' : 'them', text: message.text, image: message.image || '', sticker: message.sticker || '', project: message.project || '', reactions: reactionSummary(message.reactions, meId), createdAt: message.createdAt }))
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
  return { id: task.id, prompt: task.prompt, attachments: task.attachments || [], mode: task.mode, status: task.status, engine: task.engine, createdAt: task.createdAt, finishedAt: task.finishedAt || null, costUsd: task.costUsd ?? null, handle: author?.handle || '', author: author?.name || '' };
}

function workspaceView(workspace, userId, detailed = false) {
  const device = D.devices[workspace.deviceId];
  const owner = D.users[workspace.ownerId];
  const tasks = Object.values(D.tasks).filter(task => task.workspaceId === workspace.id).sort((left, right) => left.createdAt - right.createdAt);
  const view = {
    id: workspace.id, name: workspace.name, present: workspace.present !== false, branch: workspace.branch || '', dirty: workspace.dirty || 0, isGit: Boolean(workspace.isGit),
    role: roleFor(workspace, userId), ownerHandle: owner?.handle || '', ownerName: owner?.name || '',
    device: device ? { id: device.id, name: device.name, version: device.version || '', platform: device.platform, online: agentStreams.has(device.id), lastSeen: device.lastSeen || null, allow: device.allow || 'edit', engines: device.engines || [] } : null,
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
  sse(stream, 'cmd', { id: randomUUID(), type: 'task', taskId: task.id, workspaceKey: workspace.key, prompt: task.prompt, mode: task.mode, engine: task.engine, sessionId: task.resumeSessionId || null, attachments: task.attachments || [] });
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
const authLimit = limiter(Number(process.env.AUTH_LIMIT) || 20, 10 * 60 * 1000); // sign-ins per address per 10 minutes
const writeLimit = limiter(240, 60 * 1000);

/* Auth and profile */

async function startSession(request, user) {
  const raw = token();
  D.sessions[sha256(raw)] = { userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + SESSION_DAYS * 864e5 };
  for (const [key, session] of Object.entries(D.sessions)) if (session.expiresAt < Date.now()) delete D.sessions[key];
  db.save();
  return { 'Set-Cookie': sessionCookie(request, raw, SESSION_DAYS * 86400) };
}

const reservedHandles = ['me', 'admin', 'api', 'root', 'support', 'prostim'];

function newAccountFields(body) {
  const handle = String(body.handle || '').trim().toLowerCase().replace(/^@/, '');
  const name = cleanText(body.name, 40);
  const password = String(body.password || '');
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) fail(400, 'Ник: 3–20 символов, латиница, цифры или _');
  if (reservedHandles.includes(handle) || userByHandle(handle)) fail(409, 'Этот ник уже занят');
  if (!name) fail(400, 'Укажи имя');
  if (password.length < 6 || password.length > 200) fail(400, 'Пароль: минимум 6 символов');
  return { handle, name, password };
}

function createUser({ handle, name, passwordHash = '', email = '', oauth = null }) {
  const id = randomUUID();
  const user = { id, handle, name, initials: initialsOf(name), color: colorFor(handle), bio: '', passwordHash, createdAt: Date.now(), onboarding: true };
  if (email) { user.email = email; user.emailVerified = true; }
  if (oauth) user.oauth = oauth;
  D.users[id] = user;
  D.messages.push({ id: randomUUID(), from: 'prostim', to: id, text: 'Привет! Это про.стим. Покажи проект в ленте, подай игру в Steam или подключи свой компьютер в ИИ-мире — задачи для Claude Code и Codex можно ставить прямо с телефона.', createdAt: Date.now() });
  return user;
}

const normalEmail = value => String(value || '').trim().toLowerCase();
const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
const userByEmail = email => (email ? Object.values(D.users).find(user => user.email === email) : null) || null;

on('POST', '/api/auth/register', async ({ request, body }) => {
  if (!authLimit(clientIp(request))) fail(429, 'Слишком много попыток, подожди немного');
  if (REQUIRE_EMAIL) fail(400, 'Подтверди почту: на неё придёт код');
  const fields = newAccountFields(body);
  const user = createUser({ handle: fields.handle, name: fields.name, passwordHash: await hashPassword(fields.password) });
  return { body: { ok: true }, headers: await startSession(request, user) };
});

on('POST', '/api/auth/login', async ({ request, body }) => {
  if (!authLimit(clientIp(request))) fail(429, 'Слишком много попыток, подожди немного');
  const login = String(body.handle || '').trim().replace(/^@/, '');
  const user = login.includes('@') ? userByEmail(normalEmail(login)) : userByHandle(login);
  if (!user?.passwordHash || !(await verifyPassword(String(body.password || ''), user.passwordHash))) fail(401, user && !user.passwordHash ? 'У этого аккаунта нет пароля: войди через почту или соцсеть' : 'Неверный ник, почта или пароль');
  return { body: { ok: true }, headers: await startSession(request, user) };
});

/* E-mail codes: confirm the address at sign-up, sign in without a password, attach an address later */

const CODE_TTL = 10 * 60 * 1000;
const CODE_RESEND = 45 * 1000;
const codeKey = email => sha256(`code:${email}`);

on('POST', '/api/auth/email/start', async ({ request, body, user }) => {
  if (!authLimit(clientIp(request))) fail(429, 'Слишком много попыток, подожди немного');
  if (!mailer.configured) fail(503, 'Письма пока не отправляются — зарегистрируйся по нику и паролю');
  const purpose = ['register', 'login', 'link'].includes(body.purpose) ? body.purpose : 'register';
  const email = normalEmail(body.email);
  if (!validEmail(email)) fail(400, 'Проверь адрес почты');
  const owner = userByEmail(email);
  let pending = null;
  if (purpose === 'register') {
    if (owner) fail(409, 'Эта почта уже привязана к аккаунту — войди по ней');
    const fields = newAccountFields(body);
    pending = { handle: fields.handle, name: fields.name, passwordHash: await hashPassword(fields.password) };
  } else if (purpose === 'login') {
    if (!owner) fail(404, 'Аккаунта с этой почтой нет — зарегистрируйся');
  } else {
    needUser(user);
    if (owner && owner.id !== user.id) fail(409, 'Эта почта уже привязана к другому аккаунту');
    pending = { userId: user.id };
  }
  const key = codeKey(email);
  const previous = D.emailCodes[key];
  if (previous && Date.now() - previous.sentAt < CODE_RESEND) fail(429, `Код уже отправлен. Новый можно запросить через ${Math.ceil((CODE_RESEND - (Date.now() - previous.sentAt)) / 1000)} с`);
  for (const [entryKey, entry] of Object.entries(D.emailCodes)) if (entry.expiresAt < Date.now()) delete D.emailCodes[entryKey];
  const code = String(randomInt(0, 1e6)).padStart(6, '0');
  try {
    await mailer.send({ to: email, ...codeLetter(code, purpose) });
  } catch (error) {
    console.error('Письмо не отправлено:', error.message);
    fail(502, 'Не получилось отправить письмо. Попробуй ещё раз чуть позже');
  }
  D.emailCodes[key] = { email, purpose, codeHash: sha256(`${email}:${code}`), pending, tries: 0, sentAt: Date.now(), expiresAt: Date.now() + CODE_TTL };
  db.save();
  return { ok: true, email, resendIn: CODE_RESEND / 1000 };
});

on('POST', '/api/auth/email/verify', async ({ request, body, user }) => {
  if (!authLimit(clientIp(request))) fail(429, 'Слишком много попыток, подожди немного');
  const email = normalEmail(body.email);
  const key = codeKey(email);
  const entry = D.emailCodes[key];
  if (!entry || entry.expiresAt < Date.now()) { delete D.emailCodes[key]; fail(400, 'Код устарел — запроси новый'); }
  entry.tries += 1;
  if (entry.codeHash !== sha256(`${email}:${String(body.code || '').replace(/\D/g, '')}`)) {
    if (entry.tries >= 5) { delete D.emailCodes[key]; db.save(); fail(429, 'Слишком много неверных попыток — запроси новый код'); }
    db.save();
    fail(400, `Неверный код, осталось попыток: ${5 - entry.tries}`);
  }
  delete D.emailCodes[key];
  if (entry.purpose === 'register') {
    if (userByEmail(email)) fail(409, 'Эта почта уже привязана к аккаунту — войди по ней');
    if (userByHandle(entry.pending.handle)) fail(409, 'Этот ник уже заняли, пока ты вводил код — выбери другой');
    const created = createUser({ ...entry.pending, email });
    return { body: { ok: true, created: true }, headers: await startSession(request, created) };
  }
  if (entry.purpose === 'login') {
    const owner = userByEmail(email);
    if (!owner) fail(404, 'Аккаунта с этой почтой нет');
    return { body: { ok: true }, headers: await startSession(request, owner) };
  }
  needUser(user);
  if (entry.pending?.userId !== user.id) fail(403, 'Код выписан для другого аккаунта');
  user.email = email;
  user.emailVerified = true;
  db.save();
  return { ok: true, email };
});

/* Google, Yandex, GitHub */

function siteOrigin(request) {
  return (process.env.PUBLIC_URL || `${isSecure(request) ? 'https' : 'http'}://${request.headers.host}`).replace(/\/$/, '');
}

function redirect(response, location, cookies = []) {
  response.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...(cookies.length ? { 'Set-Cookie': cookies } : {}) });
  response.end();
  return null;
}

const oauthCookie = (request, value, maxAge) => `ps_oauth=${value}; Path=/api/auth/oauth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure(request) ? '; Secure' : ''}`;
const authError = message => `/?auth_error=${encodeURIComponent(message)}#/me`;

function freeHandle(...candidates) {
  for (const candidate of candidates) {
    const base = String(candidate || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 16);
    if (base.length < 3) continue;
    if (!reservedHandles.includes(base) && !userByHandle(base)) return base;
    for (let index = 2; index < 1000; index += 1) if (!userByHandle(`${base}${index}`)) return `${base}${index}`;
  }
  return `user_${randomUUID().slice(0, 8)}`;
}

on('GET', '/api/auth/oauth/:provider/start', async ({ request, response, params }) => {
  if (!oauthProviders().includes(params.provider)) return redirect(response, authError('Этот способ входа пока не подключён'));
  const state = token(18);
  const url = authorizeUrl(params.provider, { redirectUri: `${siteOrigin(request)}/api/auth/oauth/${params.provider}/callback`, state });
  return redirect(response, url, [oauthCookie(request, `${state}.${params.provider}`, 600)]);
});

on('GET', '/api/auth/oauth/:provider/callback', async ({ request, response, params, query, user }) => {
  const provider = params.provider;
  const clear = oauthCookie(request, '', 0);
  const [state, expected] = String(parseCookies(request.headers.cookie).ps_oauth || '').split('.');
  if (!oauthProviders().includes(provider) || !state || expected !== provider || query.get('state') !== state) return redirect(response, authError('Вход не удался: начни заново'), [clear]);
  if (query.get('error') || !query.get('code')) return redirect(response, authError(`Вход через ${oauthLabel(provider)} отменён`), [clear]);
  let profile;
  try {
    profile = await oauthProfile(provider, { code: query.get('code'), redirectUri: `${siteOrigin(request)}/api/auth/oauth/${provider}/callback` });
  } catch (error) {
    console.error(error.message);
    return redirect(response, authError(`Вход через ${oauthLabel(provider)} не удался, попробуй ещё раз`), [clear]);
  }
  const email = profile.emailVerified && validEmail(profile.email) ? profile.email : '';
  let account = Object.values(D.users).find(item => item.oauth?.[provider] === profile.id) || userByEmail(email) || user;
  if (account) {
    account.oauth = { ...(account.oauth || {}), [provider]: profile.id };
    if (email && !account.email) { account.email = email; account.emailVerified = true; }
  } else {
    const name = cleanText(profile.name, 40) || profile.login || 'Без имени';
    account = createUser({ handle: freeHandle(profile.login, email.split('@')[0], name), name, email, oauth: { [provider]: profile.id } });
  }
  const session = await startSession(request, account);
  return redirect(response, '/#/me', [clear, session['Set-Cookie']]);
});

on('POST', '/api/auth/logout', async ({ request }) => {
  const raw = parseCookies(request.headers.cookie).ps_session;
  if (raw) delete D.sessions[sha256(raw)];
  db.save();
  return { body: { ok: true }, headers: { 'Set-Cookie': sessionCookie(request, '', 0) } };
});

/* Paid reach: promoted posts shown as ads in the feed, and the Plus subscription */

function hasPlus(user) {
  return Boolean(user?.plus?.until > Date.now());
}

function promotionLive(item, now = Date.now()) {
  if (item.status !== 'active') return false;
  if (item.endsAt < now || item.shown >= item.impressions || !D.projects.some(project => project.id === item.projectId)) { item.status = 'done'; return false; }
  return true;
}

function adsFor(user) {
  if (hasPlus(user)) return [];
  const now = Date.now();
  return D.promotions.filter(item => promotionLive(item, now)).map(item => ({ id: item.id, projectId: item.projectId }));
}

function promotionView(item) {
  promotionLive(item);
  return { id: item.id, projectId: item.projectId, plan: item.plan, status: item.status, impressions: item.impressions, shown: item.shown, clicks: item.clicks, startsAt: item.startsAt || 0, endsAt: item.endsAt || 0, paymentId: item.paymentId, createdAt: item.createdAt };
}

function paymentView(payment) {
  return { id: payment.id, kind: payment.kind, amount: payment.amount, status: payment.status, mode: payment.mode, description: payment.description, confirmationUrl: payment.confirmationUrl || '' };
}

// Money arrived: the post starts showing, or Plus is extended by a month on top of what is left.
function activatePayment(payment) {
  if (payment.status === 'succeeded') return;
  payment.status = 'succeeded';
  payment.paidAt = Date.now();
  const now = Date.now();
  if (payment.kind === 'promotion') {
    const promotion = D.promotions.find(item => item.id === payment.ref);
    if (promotion && promotion.status === 'pending') Object.assign(promotion, { status: 'active', startsAt: now, endsAt: now + promotion.days * 864e5 });
  } else if (payment.kind === 'plus') {
    const user = D.users[payment.userId];
    if (user) user.plus = { until: Math.max(now, user.plus?.until || 0) + plusPlan.days * 864e5, since: user.plus?.since || now };
  }
  db.save();
  pushTo([payment.userId], 'payment', { id: payment.id, status: payment.status });
}

async function startPayment(request, user, { kind, amount, description, ref }) {
  const mode = paymentsMode();
  if (!mode) fail(503, 'Оплата пока не подключена');
  const payment = { id: `pay-${randomUUID().slice(0, 13)}`, userId: user.id, kind, amount, description, ref, mode, status: 'pending', createdAt: Date.now() };
  if (mode === 'yookassa') {
    try {
      Object.assign(payment, await createYookassaPayment(payment, `${siteOrigin(request)}/?payment=${payment.id}#/me`));
    } catch (error) {
      console.error('ЮKassa:', error.message);
      fail(502, 'Платёжный сервис не ответил, попробуй ещё раз');
    }
  }
  D.payments[payment.id] = payment;
  db.save();
  return payment;
}

async function refreshPayment(payment) {
  if (payment.mode !== 'yookassa' || payment.status !== 'pending' || !payment.providerId) return payment;
  const remote = await yookassaStatus(payment.providerId).catch(() => null);
  if (remote?.paid && remote.amount >= payment.amount) activatePayment(payment);
  else if (remote?.status === 'canceled') {
    payment.status = 'canceled';
    const promotion = payment.kind === 'promotion' ? D.promotions.find(item => item.id === payment.ref) : null;
    if (promotion?.status === 'pending') promotion.status = 'canceled';
    db.save();
  }
  return payment;
}

on('POST', '/api/promotions', async ({ request, user, body }) => {
  needUser(user);
  const project = D.projects.find(item => item.id === body.projectId);
  if (!project) fail(404, 'Проект не найден');
  if (project.ownerId !== user.id) fail(403, 'Продвигать можно только свои проекты');
  const plan = boostPlan(body.plan);
  if (!plan) fail(400, 'Выбери пакет');
  if (D.promotions.some(item => item.projectId === project.id && promotionLive(item))) fail(409, 'Этот проект уже продвигается');
  for (const item of D.promotions) if (item.projectId === project.id && item.status === 'pending') item.status = 'canceled';
  const promotion = { id: `ad-${randomUUID().slice(0, 12)}`, projectId: project.id, ownerId: user.id, plan: plan.id, days: plan.days, impressions: plan.impressions, shown: 0, clicks: 0, status: 'pending', createdAt: Date.now() };
  if (body.pay === 'plus' || body.pay === 'sparks') {
    if (plan.id !== 'day') fail(400, 'Так можно взять только день продвижения');
    if (body.pay === 'plus') {
      if (!plusCreditLeft(user)) fail(403, hasPlus(user) ? 'Бесплатный день в этом месяце уже использован' : 'Бесплатный день — часть Плюса');
      user.plus.credit = monthKey();
    } else {
      if ((user.sparks || 0) < sparkPrices.boostDay) fail(403, `Нужно ${sparkPrices.boostDay} искр`);
      spendSparks(user, sparkPrices.boostDay, 'Продвижение за искры');
    }
    const now = Date.now();
    Object.assign(promotion, { status: 'active', gift: body.pay, startsAt: now, endsAt: now + 864e5 });
    D.promotions.push(promotion);
    db.save();
    return { promotion: promotionView(promotion), payment: null };
  }
  D.promotions.push(promotion);
  const payment = await startPayment(request, user, { kind: 'promotion', amount: boostPrice(plan, hasPlus(user)), description: `Продвижение «${clip(project.title, 60)}» · ${plan.title}`, ref: promotion.id });
  promotion.paymentId = payment.id;
  db.save();
  return { promotion: promotionView(promotion), payment: paymentView(payment) };
});

const monthKey = (time = Date.now()) => new Date(time).toISOString().slice(0, 7);
const plusCreditLeft = user => hasPlus(user) && user.plus.credit !== monthKey();

on('POST', '/api/plus/sparks', async ({ user }) => {
  needUser(user);
  if ((user.sparks || 0) < sparkPrices.plusWeek) fail(403, `Нужно ${sparkPrices.plusWeek} искр`);
  spendSparks(user, sparkPrices.plusWeek, 'Неделя Плюса за искры');
  const now = Date.now();
  user.plus = { ...(user.plus || {}), until: Math.max(now, user.plus?.until || 0) + 7 * 864e5, since: user.plus?.since || now };
  db.save();
  return { plusUntil: user.plus.until, sparks: user.sparks };
});

on('POST', '/api/plus', async ({ request, user }) => {
  needUser(user);
  const payment = await startPayment(request, user, { kind: 'plus', amount: plusPlan.price, description: `${plusPlan.title} · ${plusPlan.days} дней`, ref: plusPlan.id });
  return { payment: paymentView(payment) };
});

on('GET', '/api/payments/:id', async ({ user, params }) => {
  needUser(user);
  const payment = D.payments[params.id];
  if (!payment || payment.userId !== user.id) fail(404, 'Платёж не найден');
  return { payment: paymentView(await refreshPayment(payment)) };
});

// Test mode only: stands in for the bank page.
on('POST', '/api/payments/:id/test', async ({ user, params }) => {
  needUser(user);
  const payment = D.payments[params.id];
  if (!payment || payment.userId !== user.id) fail(404, 'Платёж не найден');
  if (payment.mode !== 'test') fail(400, 'Это настоящий платёж — оплати его на странице банка');
  if (payment.status === 'pending') activatePayment(payment);
  return { payment: paymentView(payment) };
});

// ЮKassa notification. Its body is only a hint: the status is asked from ЮKassa directly.
on('POST', '/api/payments/yookassa', async ({ body }) => {
  const providerId = String(body?.object?.id || '');
  const payment = providerId ? Object.values(D.payments).find(item => item.providerId === providerId) : null;
  if (payment) await refreshPayment(payment);
  return { ok: true };
});

// Impressions and taps on ads, counted once per viewer per promotion and half hour.
const adEvents = new Map();
on('POST', '/api/ads/:id/:event', async ({ request, user, params }) => {
  if (!['seen', 'click'].includes(params.event)) fail(404, 'Не найдено');
  const promotion = D.promotions.find(item => item.id === params.id);
  if (!promotion || !promotionLive(promotion)) return { ok: true };
  if (user?.id === promotion.ownerId) return { ok: true };
  const key = `${params.event}:${promotion.id}:${user?.id || clientIp(request)}`;
  if (Date.now() - (adEvents.get(key) || 0) < 30 * 60 * 1000) return { ok: true };
  adEvents.set(key, Date.now());
  if (adEvents.size > 50000) adEvents.clear();
  if (params.event === 'seen') promotion.shown += 1; else promotion.clicks += 1;
  promotionLive(promotion);
  db.save();
  return { ok: true };
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
  if (body.notify && typeof body.notify === 'object') user.notify = cleanNotifyPrefs(body.notify, notifyPrefs(user));
  if (body.privacy && typeof body.privacy === 'object') user.privacy = privacyOf({ privacy: { ...privacyOf(user), ...body.privacy } });
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
    projects: D.projects.filter(project => visibleTo(project, meId)).map(project => projectView(project, meId)),
    topics: D.topics.map(topicView),
    threads: meId ? threadsFor(meId) : [],
    applications: meId ? D.applications.filter(item => item.userId === meId) : [],
    follows: meId ? (D.follows[meId] || []).map(id => D.users[id]?.handle).filter(Boolean) : [],
    votes: meId ? D.projects.filter(project => project.votes.includes(meId)).map(project => project.id) : [],
    saved: meId ? D.projects.filter(project => project.saves.includes(meId)).map(project => project.id) : [],
    taste: meId ? D.tastes[meId] || null : null,
    myRatings: meId ? Object.fromEntries(D.ratings.filter(rating => rating.raterId === meId).map(rating => [D.users[rating.targetId]?.handle, { score: rating.score, text: rating.text }])) : {},
    workspaces: meId ? Object.values(D.workspaces).filter(workspace => roleFor(workspace, meId)).map(workspace => workspaceView(workspace, meId)) : [],
    account: user ? { email: user.email || '', providers: Object.keys(user.oauth || {}), hasPassword: Boolean(user.passwordHash), plusUntil: hasPlus(user) ? user.plus.until : 0, notify: notifyPrefs(user), pushDevices: notifier.devices(user.id), privacy: privacyOf(user), onboarding: user.onboarding === true, sparks: user.sparks || 0, sparkLog: user.sparkLog || [], plusCredit: plusCreditLeft(user), limits: aiLimits[hasPlus(user) ? 'plus' : 'free'] } : null,
    activity: meId ? { unread: notifier.unread(meId) } : { unread: 0 },
    watching: meId ? D.projects.filter(project => (project.watchers || []).includes(meId)).map(project => project.id) : [],
    reposted: meId ? D.projects.filter(project => (project.reposts || []).includes(meId)).map(project => project.id) : [],
    blocked: meId ? (D.blocks[meId] || []).map(id => D.users[id]?.handle).filter(Boolean) : [],
    feedPrefs: meId ? cleanFeedPrefs(D.feedPrefs[meId]) : null,
    ads: adsFor(user),
    promotions: meId ? D.promotions.filter(item => item.ownerId === meId && item.status !== 'canceled').map(promotionView) : [],
    config: { email: mailer.configured, requireEmail: REQUIRE_EMAIL, providers: oauthProviders().map(id => ({ id, label: oauthLabel(id) })), payments: paymentsMode(), push: vapidKeys(process.env, D.secrets).publicKey, ai: aiAvailable(process.env) }
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

const uploadLimits = { image: 4 * 1024 * 1024, gif: 8 * 1024 * 1024, video: 40 * 1024 * 1024, audio: 3 * 1024 * 1024 };
const uploadLimit = limiter(60, 60 * 60 * 1000);

function sniffMedia(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ['image', 'jpg'];
  if (bytes.subarray(0, 4).toString('hex') === '89504e47') return ['image', 'png'];
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return ['image', 'webp'];
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) return ['image', 'gif'];
  if (bytes.subarray(0, 4).toString('hex') === '1a45dfa3') return ['video', 'webm'];
  if (bytes.subarray(4, 8).toString() === 'ftyp') return ['video', /qt {2}/.test(bytes.subarray(8, 12).toString()) ? 'mov' : 'mp4'];
  return null;
}

// Voice comments: what MediaRecorder writes (WebM/Opus in Chrome and Firefox, MP4/AAC in Safari).
function sniffAudio(bytes) {
  if (bytes.subarray(0, 4).toString('hex') === '1a45dfa3') return ['audio', 'weba'];
  if (bytes.subarray(4, 8).toString() === 'ftyp') return ['audio', 'm4a'];
  if (bytes.subarray(0, 4).toString() === 'OggS') return ['audio', 'ogg'];
  if (bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return ['audio', 'mp3'];
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE') return ['audio', 'wav'];
  return null;
}

// Raw upload: the body is the file itself. Only image/* and video/* content types are accepted,
// which a cross-site form cannot send without a CORS preflight.
on('POST', '/api/uploads', async ({ user, request }) => {
  needUser(user);
  const declared = String(request.headers['content-type'] || '');
  const kind = declared.startsWith('video/') ? 'video' : declared.startsWith('image/') ? 'image' : declared.startsWith('audio/') ? 'audio' : fail(415, 'Можно загружать только картинки, видео и голосовые');
  if (!uploadLimit(user.id)) fail(429, 'Слишком много загрузок, подожди немного');
  const limit = declared.startsWith('image/gif') ? uploadLimits.gif : uploadLimits[kind];
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) fail(413, kind === 'video' ? 'Видео больше 40 МБ — сожми его или дай ссылку на YouTube' : kind === 'audio' ? 'Голосовое длиннее двух минут' : limit === uploadLimits.gif ? 'GIF больше 8 МБ' : 'Картинка больше 4 МБ');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const sniffed = kind === 'audio' ? sniffAudio(bytes) : sniffMedia(bytes);
  if (!sniffed || sniffed[0] !== kind) fail(400, kind === 'video' ? 'Нужен MP4, MOV или WebM' : kind === 'audio' ? 'Голосовое не распознано' : 'Нужна картинка JPEG, PNG, WebP или GIF');
  if (sniffed[1] === 'gif' ? size > uploadLimits.gif : size > uploadLimits[kind]) fail(413, 'Файл слишком большой');
  const name = `${sniffed[0][0]}-${randomUUID().slice(0, 18)}.${sniffed[1]}`;
  await db.putUpload(name, bytes);
  D.uploads[name] = { userId: user.id, type: sniffed[0], size: bytes.length, createdAt: Date.now() };
  db.save();
  return { url: `/uploads/${name}`, type: sniffed[0] };
});

// Attachments for AI tasks: any file up to 25 MB, private to its owner and to the computer that runs the task.
const FILE_LIMIT = 25 * 1024 * 1024; // without Plus; aiLimits in src/ads.js has both
const audioExtensions = /\.(mp3|m4a|wav|ogg|oga|aac|flac|opus|webm)$/i;
const videoExtensions = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;

function fileKind(bytes, declared, filename) {
  const sniffed = sniffMedia(bytes)?.[0];
  if (sniffed === 'image' || sniffed === 'video') return sniffed;
  if (bytes.subarray(0, 6).toString() === 'GIF87a' || bytes.subarray(0, 6).toString() === 'GIF89a') return 'image';
  if (declared.startsWith('video/') || (!declared.startsWith('audio/') && videoExtensions.test(filename))) return 'video';
  if (declared.startsWith('audio/') || bytes.subarray(0, 3).toString() === 'ID3' || bytes.subarray(0, 4).toString() === 'OggS' || bytes.subarray(8, 12).toString() === 'WAVE' || audioExtensions.test(filename)) return 'audio';
  return 'file';
}

on('POST', '/api/files', async ({ user, request }) => {
  needUser(user);
  const fileLimit = aiLimits[hasPlus(user) ? 'plus' : 'free'].fileMb * 1024 * 1024;
  if (!uploadLimit(user.id)) fail(429, 'Слишком много загрузок, подожди немного');
  let filename = 'file';
  try { filename = decodeURIComponent(String(request.headers['x-file-name'] || 'file')); } catch { filename = 'file'; }
  filename = cleanText(filename.replace(/[\\/]/g, '_'), 120) || 'file';
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > fileLimit) fail(413, `Файл больше ${fileLimit / 1024 / 1024} МБ${hasPlus(user) ? '' : ' — с Плюсом можно до 100 МБ'}`);
    chunks.push(chunk);
  }
  if (!size) fail(400, 'Пустой файл');
  const bytes = Buffer.concat(chunks);
  const extension = (/\.([a-z0-9]{1,8})$/i.exec(filename)?.[1] || 'bin').toLowerCase();
  const name = `f-${randomUUID().slice(0, 18)}.${extension}`;
  const kind = fileKind(bytes, String(request.headers['content-type'] || ''), filename);
  await db.putUpload(name, bytes);
  D.uploads[name] = { userId: user.id, type: 'file', kind, filename, size, createdAt: Date.now() };
  db.save();
  return { id: name, filename, size, kind };
});

// The computer picks up a task's attachments here before running it.
on('GET', '/api/agent/files/:name', async ({ device, params, response }) => {
  if (!device) fail(401, 'Устройство не привязано');
  const meta = D.uploads[params.name];
  if (!meta || meta.type !== 'file') fail(404, 'Файл не найден');
  const allowed = Object.values(D.tasks).some(task => task.attachments?.some(item => item.id === params.name) && D.workspaces[task.workspaceId]?.deviceId === device.id);
  if (!allowed) fail(403, 'Этот файл не относится к задачам этого компьютера');
  const upload = await db.getUpload(params.name);
  if (!upload) fail(404, 'Файл не найден');
  response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': upload.bytes.length, 'Cache-Control': 'no-store' });
  response.end(upload.bytes);
  return null;
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
  const media = [...images.map(url => ({ type: 'image', url })), ...postMedia(body.media, user)];
  const fields = cleanPostFields(body, block => ownedUpload(block.url, user));
  const project = {
    id, ownerId: user.id, title, summary, description: cleanText(body.description, 2400),
    category: ['games', 'apps', 'tools'].includes(body.category) ? body.category : 'apps',
    url: fields.links[0] || safeHttpUrl(cleanText(body.url, 500)), scene: legacyScenes.includes(body.scene) ? body.scene : '',
    slides: 1, images: media.filter(item => item.type === 'image').map(item => item.url), media, video: videoLink(body.video), tags: postTags(body.tags),
    createdAt: Date.now(), seedVotes: 0, votes: [], saves: [], comments: [], updates: [], watchers: [], reposts: [], ...fields
  };
  D.projects.push(project);
  db.save();
  checkDemo(project, request);
  for (const [followerId, list] of Object.entries(D.follows)) {
    if (list.includes(user.id)) notifier.notify(followerId, { type: 'post', actorId: user.id, projectId: project.id, url: `/#/project/${project.id}` });
  }
  return { project: projectView(project, user.id) };
});

const legacyScenes = ['forest', 'coast', 'board', 'analytics'];

function postTags(value) {
  const tags = (Array.isArray(value) ? value : []).map(tag => cleanText(tag, 24)).filter(Boolean).slice(0, 5);
  return tags.length ? tags : ['Новый проект'];
}

// Slides: files this user uploaded, plus (when editing) files the post already shows.
// focus: the point of the picture (percent from the left and top) that stays in view when it is cropped.
function postMedia(list, user, current = []) {
  const media = [];
  for (const item of Array.isArray(list) ? list.slice(0, 8) : []) {
    const focus = cleanFocus(item?.focus);
    const kept = current.find(existing => existing.url === item?.url);
    if (kept) { const { focus: old, ...rest } = kept; media.push({ ...rest, ...(focus ? { focus } : {}) }); continue; }
    const upload = ownedUpload(item?.url, user);
    const poster = item?.poster && upload.type === 'video' ? ownedUpload(item.poster, user, 'image').url : '';
    media.push({ type: upload.type, url: upload.url, ...(poster ? { poster } : {}), ...(focus ? { focus } : {}) });
  }
  return media;
}

on('PATCH', '/api/projects/:id', async ({ user, params, request }) => {
  needUser(user);
  const project = requireProject(params.id);
  if (project.ownerId !== user.id) fail(403, 'Изменить может только автор');
  const body = await readJson(request, 512 * 1024);
  const title = cleanText(body.title, 80);
  const summary = cleanText(body.summary, 160);
  if (!title || !summary) fail(400, 'Нужны название и короткое описание');
  const current = projectMedia(project);
  const previousDemo = project.demo || '';
  const media = postMedia(body.media, user, current);
  const pageFiles = new Set(Array.isArray(project.page) ? project.page.map(block => block?.url).filter(Boolean) : []);
  const fields = cleanPostFields(body, block => pageFiles.has(block.url) ? { url: block.url, type: block.type } : ownedUpload(block.url, user));
  Object.assign(project, {
    title, summary, category: ['games', 'apps', 'tools'].includes(body.category) ? body.category : project.category,
    url: fields.links[0] || '', media, images: media.filter(item => item.type === 'image').map(item => item.url), video: videoLink(body.video), tags: postTags(body.tags),
    updatedAt: Date.now(), ...fields
  });
  if (fields.demo !== previousDemo) { delete project.demoBlocked; checkDemo(project, request); }
  db.save();
  return { project: projectView(project, user.id) };
});

// A demo is shown inside the post; if its site forbids being framed, the post opens it in a new tab.
function checkDemo(project, request) {
  if (!project.demo) return;
  embeddable(project.demo, process.env, siteOrigin(request)).then(ok => {
    if (ok === false) { project.demoBlocked = true; db.save(); }
  }).catch(() => {});
}

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
  if (voted) notifier.notify(project.ownerId, { type: 'like', actorId: user.id, projectId: project.id, url: `/#/project/${project.id}` });
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

const commentLimit = limiter(30, 60 * 1000);

function requireComment(project, id) {
  return project.comments.find(comment => comment.id === id && !comment.hidden) || fail(404, 'Комментарий не найден');
}

on('POST', '/api/projects/:id/comments', async ({ user, params, body }) => {
  needUser(user);
  const project = requireProject(params.id);
  if (!visibleTo(project, user.id)) fail(404, 'Проект не найден');
  if (blockedBy(project.ownerId, user.id)) fail(403, 'Автор ограничил комментарии для тебя');
  if (project.ownerId !== user.id && privacyOf(D.users[project.ownerId]).comments === 'following' && !follows(project.ownerId, user.id)) fail(403, 'Автор принимает комментарии только от тех, на кого подписан');
  if (!commentLimit(user.id)) fail(429, 'Слишком часто, подожди немного');
  const text = cleanText(body.text, 1200);
  const voice = body.voice ? ownedUpload(body.voice, user, 'audio').url : '';
  if (!text && !voice) fail(400, 'Пустой комментарий');
  const parent = body.replyTo ? requireComment(project, String(body.replyTo)) : null;
  const root = parent?.replyTo ? project.comments.find(comment => comment.id === parent.replyTo) || parent : parent;
  const mentionId = parent && parent.id !== root?.id && parent.userId !== user.id ? parent.userId : '';
  const comment = { id: randomUUID(), userId: user.id, text, createdAt: Date.now(), likes: [], ...(root ? { replyTo: root.id } : {}), ...(mentionId ? { mentionId } : {}), ...(voice ? { voice, duration: Math.max(1, Math.min(120, Math.round(Number(body.duration) || 0))) } : {}) };
  project.comments.push(comment);
  db.save();
  const url = `/#/project/${project.id}`;
  const snippet = text || 'Голосовой комментарий';
  if (parent?.userId && parent.userId !== user.id) notifier.notify(parent.userId, { type: 'reply', actorId: user.id, projectId: project.id, snippet, url });
  if (project.ownerId !== parent?.userId) notifier.notify(project.ownerId, { type: 'comment', actorId: user.id, projectId: project.id, snippet, url });
  return { project: projectView(project, user.id), comment: comment.id };
});

on('POST', '/api/projects/:id/comments/:cid/like', async ({ user, params }) => {
  needUser(user);
  const project = requireProject(params.id);
  const comment = requireComment(project, params.cid);
  comment.likes ||= [];
  const liked = !comment.likes.includes(user.id);
  comment.likes = liked ? [...comment.likes, user.id] : comment.likes.filter(id => id !== user.id);
  db.save();
  if (liked && comment.userId) notifier.notify(comment.userId, { type: 'comment-like', actorId: user.id, projectId: project.id, snippet: comment.text || 'голосовой', url: `/#/project/${project.id}` });
  return { liked, likes: comment.likes.length };
});

on('POST', '/api/projects/:id/comments/:cid/pin', async ({ user, params }) => {
  needUser(user);
  const project = requireProject(params.id);
  if (project.ownerId !== user.id) fail(403, 'Закреплять может только автор проекта');
  const comment = requireComment(project, params.cid);
  const pinned = project.pinnedComment !== comment.id;
  project.pinnedComment = pinned ? comment.id : '';
  db.save();
  if (pinned && comment.userId) {
    if (comment.userId !== user.id) awardSparks(comment.userId, 'pinned', comment.id);
    notifier.notify(comment.userId, { type: 'pin', actorId: user.id, projectId: project.id, snippet: comment.text || '', url: `/#/project/${project.id}` });
  }
  return { project: projectView(project, user.id) };
});

on('DELETE', '/api/projects/:id/comments/:cid', async ({ user, params }) => {
  needUser(user);
  const project = requireProject(params.id);
  const comment = requireComment(project, params.cid);
  if (comment.userId !== user.id && project.ownerId !== user.id) fail(403, 'Удалить может автор комментария или проекта');
  project.comments = project.comments.filter(item => item.id !== comment.id && item.replyTo !== comment.id);
  if (project.pinnedComment === comment.id) project.pinnedComment = '';
  db.save();
  return { project: projectView(project, user.id) };
});

// "О чём пишут": Claude retells the thread when ANTHROPIC_API_KEY is set, otherwise a plain digest.
// Kept until the thread grows.
on('GET', '/api/projects/:id/comments/summary', async ({ user, params }) => {
  const project = requireProject(params.id);
  const comments = project.comments.filter(comment => !comment.hidden).map(comment => ({ ...comment, name: personRef(comment.userId, comment.name).name }));
  const cached = project.digest;
  if (cached && cached.count === comments.length && (cached.source === 'ai' || !aiAvailable(process.env))) return cached;
  let digest = null;
  if (aiAvailable(process.env) && comments.filter(comment => comment.text).length >= 3) {
    const result = await aiCommentSummary(process.env, project, comments.filter(comment => comment.text));
    if (result) digest = { ...result, source: 'ai' };
  }
  digest ||= { ...commentDigest(comments), source: 'auto' };
  project.digest = { ...digest, count: comments.length, at: Date.now() };
  db.save();
  return project.digest;
});

/* Sparks: authors reward people who help them */

function awardSparks(userId, rule, ref) {
  const user = D.users[userId];
  const amount = sparkRules[rule]?.amount;
  if (!user || !amount) return false;
  user.sparkRefs ||= [];
  const key = `${rule}:${ref}`;
  if (user.sparkRefs.includes(key)) return false;
  user.sparkRefs = [...user.sparkRefs, key].slice(-300);
  user.sparks = (user.sparks || 0) + amount;
  user.sparkLog = [{ amount, label: sparkRules[rule].label, at: Date.now() }, ...(user.sparkLog || [])].slice(0, 30);
  return true;
}

function spendSparks(user, amount, label) {
  user.sparks = (user.sparks || 0) - amount;
  user.sparkLog = [{ amount: -amount, label, at: Date.now() }, ...(user.sparkLog || [])].slice(0, 30);
}

const rewardLimit = limiter(15, 24 * 3600 * 1000);

// The author accepts a report: the person who wrote it gets sparks.
on('POST', '/api/projects/:id/comments/:cid/accept', async ({ user, params }) => {
  needUser(user);
  const project = requireProject(params.id);
  if (project.ownerId !== user.id) fail(403, 'Принимать отчёты может только автор');
  const comment = requireComment(project, params.cid);
  if (comment.userId === user.id) fail(400, 'Свой комментарий принимать не нужно');
  if (!comment.accepted && !rewardLimit(user.id)) fail(429, 'На сегодня хватит наград');
  comment.accepted = !comment.accepted;
  if (comment.accepted && comment.userId && awardSparks(comment.userId, 'accepted', comment.id)) {
    notifier.notify(comment.userId, { type: 'accepted', actorId: user.id, projectId: project.id, snippet: comment.text || '', url: `/#/project/${project.id}` });
  }
  db.save();
  return { project: projectView(project, user.id) };
});

/* One project across the feed, ИИ-мир and Steam */

function requireOwnProject(id, user) {
  const project = requireProject(id);
  if (project.ownerId !== user.id) fail(403, 'Это может только автор проекта');
  return project;
}

function linkedWorkspace(project, user) {
  if (!project.workspaceId || !D.workspaces[project.workspaceId]) fail(409, 'Сначала свяжи проект с папкой в ИИ-мире');
  return requireWorkspace(project.workspaceId, user, 'run');
}

on('POST', '/api/projects/:id/link', async ({ user, params, body }) => {
  needUser(user);
  const project = requireOwnProject(params.id, user);
  const id = String(body.workspaceId || '');
  if (id) {
    const workspace = D.workspaces[id] || fail(404, 'Папка не найдена');
    if (roleFor(workspace, user.id) !== 'owner') fail(403, 'Связать можно только свою папку');
  }
  project.workspaceId = id;
  if (!id) delete project.repo;
  db.save();
  return { project: projectView(project, user.id) };
});

// A player's comment, or the whole discussion, becomes a task for the AI on the author's computer.
on('POST', '/api/projects/:id/comments/:cid/task', async ({ user, params, body }) => {
  needUser(user);
  const project = requireOwnProject(params.id, user);
  const comment = requireComment(project, params.cid);
  const { workspace } = linkedWorkspace(project, user);
  const name = personRef(comment.userId, comment.name);
  const prompt = cleanText(body.prompt, 8000) || taskFromComment(project, { ...comment, handle: name.handle, name: name.name });
  const task = createTask(user, workspace.id, { prompt, mode: body.mode === 'read' ? 'read' : 'edit' });
  comment.taskId = task.id;
  if (comment.userId && comment.userId !== user.id && awardSparks(comment.userId, 'tasked', comment.id)) {
    notifier.notify(comment.userId, { type: 'tasked', actorId: user.id, projectId: project.id, snippet: comment.text || '', url: `/#/project/${project.id}` });
  }
  db.save();
  return { task, workspaceId: workspace.id, project: projectView(project, user.id) };
});

on('POST', '/api/projects/:id/digest-task', async ({ user, params, body }) => {
  needUser(user);
  const project = requireOwnProject(params.id, user);
  const { workspace } = linkedWorkspace(project, user);
  const comments = project.comments.filter(comment => !comment.hidden && comment.userId !== user.id);
  if (!comments.length) fail(400, 'Пока нечего разбирать');
  const digest = project.digest || commentDigest(comments);
  const task = createTask(user, workspace.id, { prompt: taskFromDigest(project, digest, comments), mode: body.mode === 'edit' ? 'edit' : 'read' });
  db.save();
  return { task, workspaceId: workspace.id };
});

// What the repository already has for a Steam release, from the file list on the author's computer.
on('POST', '/api/projects/:id/repo-check', async ({ user, params }) => {
  needUser(user);
  const project = requireOwnProject(params.id, user);
  const { workspace, device } = linkedWorkspace(project, user);
  const tree = await callAgent(device, 'tree', { workspaceKey: workspace.key });
  project.repo = { ...repoChecks(tree?.entries), at: Date.now() };
  db.save();
  return { project: projectView(project, user.id) };
});

// Texts for the Steam page: Claude writes them from the post and the README when a key is set,
// otherwise they are put together from what the post already says.
on('POST', '/api/projects/:id/steam-texts', async ({ user, params }) => {
  needUser(user);
  const project = requireOwnProject(params.id, user);
  let readme = '';
  if (project.workspaceId && D.workspaces[project.workspaceId]) {
    try {
      const { workspace, device } = requireWorkspace(project.workspaceId, user);
      for (const path of ['README.md', 'readme.md', 'README.ru.md', 'README.txt', 'README']) {
        try {
          const file = await callAgent(device, 'read', { workspaceKey: workspace.key, path }, 8000);
          if (file?.content) { readme = file.content; break; }
        } catch { if (!agentStreams.has(device?.id)) break; }
      }
    } catch {}
  }
  const pageText = (project.page || []).map(block => [block.text, ...(block.items || [])].filter(Boolean).join('\n')).join('\n\n');
  const written = await aiSteamTexts(process.env, { ...project, text: `${project.description || ''}\n${pageText}` }, readme);
  if (written) return { ...written, source: 'ai', readme: Boolean(readme) };
  const paragraphs = [project.description, ...(project.page || []).filter(block => block.type === 'text').map(block => block.text)].filter(Boolean).slice(0, 4);
  const features = (project.page || []).filter(block => block.type === 'list').flatMap(block => block.items).slice(0, 8);
  return { short: clip(project.summary, 300), about: paragraphs.length ? paragraphs : [project.summary], features, tags: (project.tags || []).filter(tag => tag !== 'Новый проект'), source: 'post', readme: Boolean(readme) };
});

// The Steam status of a project. "Скоро" and "Вышла" tell the people who follow it; the release day
// comes with a free day of promotion.
on('POST', '/api/projects/:id/steam', async ({ user, params, body }) => {
  needUser(user);
  const project = requireOwnProject(params.id, user);
  const before = project.steam?.status || 'none';
  project.steam = cleanSteam(body, project.steam);
  const status = project.steam.status;
  if (status !== before && (status === 'coming' || status === 'released')) {
    const snippet = status === 'released' ? 'вышла в Steam' : 'скоро в Steam — добавь в желаемое';
    for (const id of project.watchers || []) notifier.notify(id, { type: 'steam', actorId: user.id, projectId: project.id, snippet, url: `/#/project/${project.id}` });
  }
  if (status === 'released' && !project.releaseBoost) {
    const now = Date.now();
    project.releaseBoost = now;
    if (!D.promotions.some(item => item.projectId === project.id && promotionLive(item))) {
      D.promotions.push({ id: `ad-${randomUUID().slice(0, 12)}`, projectId: project.id, ownerId: user.id, plan: 'day', days: 1, impressions: 300, shown: 0, clicks: 0, status: 'active', gift: 'release', createdAt: now, startsAt: now, endsAt: now + 864e5 });
    }
  }
  db.save();
  return { project: projectView(project, user.id), releaseBoost: status === 'released' && project.releaseBoost && Date.now() - project.releaseBoost < 5000 };
});

/* Project updates: a devlog in episodes, and people who follow one project */

on('POST', '/api/projects/:id/updates', async ({ user, params, body }) => {
  needUser(user);
  const project = requireProject(params.id);
  if (project.ownerId !== user.id) fail(403, 'Обновления пишет только автор');
  const title = cleanText(body.title, 100);
  if (!title) fail(400, 'Нужен заголовок обновления');
  const image = body.image ? ownedUpload(body.image, user, 'image').url : '';
  const taskId = typeof body.taskId === 'string' && D.tasks[body.taskId]?.workspaceId === project.workspaceId ? body.taskId : '';
  const update = { id: randomUUID().slice(0, 12), title, text: cleanText(body.text, 2000), version: cleanText(body.version, 24), ...(image ? { image } : {}), ...(taskId ? { taskId } : {}), createdAt: Date.now() };
  project.updates = [update, ...(project.updates || [])].slice(0, 50);
  project.lastUpdateAt = update.createdAt;
  db.save();
  for (const id of project.watchers || []) notifier.notify(id, { type: 'update', actorId: user.id, projectId: project.id, snippet: update.version ? `${update.version} · ${title}` : title, url: `/#/project/${project.id}` });
  return { project: projectView(project, user.id) };
});

on('DELETE', '/api/projects/:id/updates/:uid', async ({ user, params }) => {
  needUser(user);
  const project = requireProject(params.id);
  if (project.ownerId !== user.id) fail(403, 'Удалить может только автор');
  project.updates = (project.updates || []).filter(update => update.id !== params.uid);
  project.lastUpdateAt = project.updates[0]?.createdAt || 0;
  db.save();
  return { project: projectView(project, user.id) };
});

on('POST', '/api/projects/:id/watch', async ({ user, params }) => {
  needUser(user);
  const project = requireProject(params.id);
  if (project.ownerId === user.id) fail(400, 'Это твой проект');
  project.watchers ||= [];
  const watching = !project.watchers.includes(user.id);
  project.watchers = watching ? [...project.watchers, user.id] : project.watchers.filter(id => id !== user.id);
  db.save();
  return { watching, watchers: project.watchers.length };
});

on('POST', '/api/projects/:id/repost', async ({ user, params }) => {
  needUser(user);
  const project = requireProject(params.id);
  if (!visibleTo(project, user.id)) fail(404, 'Проект не найден');
  if (project.ownerId === user.id) fail(400, 'Свой проект репостить не нужно — он и так у тебя');
  project.reposts ||= [];
  const reposted = !project.reposts.includes(user.id);
  project.reposts = reposted ? [...project.reposts, user.id] : project.reposts.filter(id => id !== user.id);
  db.save();
  if (reposted) notifier.notify(project.ownerId, { type: 'repost', actorId: user.id, projectId: project.id, url: `/#/project/${project.id}` });
  return { reposted, project: projectView(project, user.id) };
});

/* Safety: reports and blocks */

const REPORT_HIDE = Math.max(2, Number(process.env.REPORT_HIDE) || 5);
const reportLimit = limiter(20, 60 * 60 * 1000);

on('POST', '/api/reports', async ({ user, body }) => {
  needUser(user);
  if (!reportLimit(user.id)) fail(429, 'Слишком много жалоб подряд');
  const kind = ['project', 'comment', 'user', 'message'].includes(body.kind) ? body.kind : fail(400, 'Непонятно, на что жалоба');
  const reason = reportReasons.some(([key]) => key === body.reason) ? body.reason : fail(400, 'Выбери причину');
  let targetId = '';
  let projectId = '';
  let offenderId = '';
  if (kind === 'project') { const project = requireProject(String(body.id)); targetId = project.id; projectId = project.id; offenderId = project.ownerId; }
  else if (kind === 'comment') { const project = requireProject(String(body.project)); const comment = requireComment(project, String(body.id)); targetId = comment.id; projectId = project.id; offenderId = comment.userId || ''; }
  else if (kind === 'user') { const target = userByHandle(String(body.id)) || fail(404, 'Пользователь не найден'); targetId = target.id; offenderId = target.id; }
  else { const message = D.messages.find(item => item.id === String(body.id) && item.to === user.id) || fail(404, 'Сообщение не найдено'); targetId = message.id; offenderId = message.from; }
  if (offenderId === user.id) fail(400, 'На себя пожаловаться нельзя');
  if (D.reports.some(item => item.reporterId === user.id && item.kind === kind && item.targetId === targetId)) return { ok: true, duplicate: true };
  const report = { id: randomUUID(), kind, targetId, projectId, offenderId, reporterId: user.id, reason, note: cleanText(body.note, 500), at: Date.now(), status: 'open' };
  D.reports.push(report);
  const reporters = new Set(D.reports.filter(item => item.kind === kind && item.targetId === targetId).map(item => item.reporterId)).size;
  let hidden = false;
  if (kind === 'project' && reporters >= REPORT_HIDE) { requireProject(projectId).flagged = true; hidden = true; }
  if (kind === 'comment' && reporters >= Math.max(2, REPORT_HIDE - 2)) { requireComment(requireProject(projectId), targetId).hidden = true; hidden = true; }
  db.save();
  if (process.env.REPORTS_EMAIL && mailer.real) {
    const label = reportReasons.find(([key]) => key === reason)[1];
    mailer.send({ to: process.env.REPORTS_EMAIL, subject: `Жалоба: ${label}`, text: `Жалоба на ${kind} ${targetId}${projectId ? ` (проект ${projectId})` : ''}\nПричина: ${label}\n${report.note}\nОт: @${user.handle}\nВсего жалоб на это: ${reporters}${hidden ? ' — скрыто автоматически' : ''}` }).catch(() => {});
  }
  return { ok: true, hidden };
});

on('POST', '/api/users/:handle/block', async ({ user, params }) => {
  needUser(user);
  const target = userByHandle(params.handle) || fail(404, 'Пользователь не найден');
  if (target.id === user.id || target.official) fail(400, 'Этот аккаунт нельзя заблокировать');
  const list = D.blocks[user.id] || [];
  const blocked = !list.includes(target.id);
  D.blocks[user.id] = blocked ? [...list, target.id] : list.filter(id => id !== target.id);
  if (blocked) {
    D.follows[user.id] = (D.follows[user.id] || []).filter(id => id !== target.id);
    D.follows[target.id] = (D.follows[target.id] || []).filter(id => id !== user.id);
  }
  db.save();
  return { blocked };
});

// First run after sign-up: what the person is into, so the feed does not start from zero.
// The picks become a starting taste that real watching then corrects; chosen authors are followed.
on('POST', '/api/me/onboarding', async ({ user, body }) => {
  needUser(user);
  user.onboarding = false;
  if (body.skip) { db.save(); return { ok: true }; }
  const taste = cleanTaste(D.tastes[user.id]);
  const list = (value, limit) => (Array.isArray(value) ? value : []).map(item => cleanText(item, 40).toLocaleLowerCase('ru')).filter(Boolean).slice(0, limit);
  const categories = list(body.categories, 3).filter(item => ['games', 'apps', 'tools'].includes(item));
  const goals = list(body.goals, 5).filter(item => ['play', 'make', 'team', 'publish', 'apps'].includes(item));
  for (const category of categories) taste.weights[`cat:${category}`] = Math.max(taste.weights[`cat:${category}`] || 0, 4);
  for (const tag of list(body.tags, 20)) taste.weights[`tag:${tag}`] = Math.max(taste.weights[`tag:${tag}`] || 0, 3);
  if (goals.includes('make')) taste.weights['cat:tools'] = Math.max(taste.weights['cat:tools'] || 0, 2);
  if (goals.includes('apps')) taste.weights['cat:apps'] = Math.max(taste.weights['cat:apps'] || 0, 2);
  taste.signals = Math.max(taste.signals, 6);
  taste.updatedAt = Date.now();
  D.tastes[user.id] = taste;
  user.goals = goals;
  for (const handle of list(body.follows, 30)) {
    const target = userByHandle(handle);
    if (!target || target.id === user.id || target.official || follows(user.id, target.id) || blockedEither(user.id, target.id)) continue;
    D.follows[user.id] = [...(D.follows[user.id] || []), target.id];
    notifier.notify(target.id, { type: 'follow', actorId: user.id, url: `/#/u/${user.handle}` });
  }
  db.save();
  return { ok: true, taste };
});

on('POST', '/api/me/feed-prefs', async ({ user, body }) => {
  needUser(user);
  D.feedPrefs[user.id] = cleanFeedPrefs(body);
  db.save();
  return { feedPrefs: D.feedPrefs[user.id] };
});

/* Notifications: the in-app list and web push */

on('GET', '/api/notifications', async ({ user }) => {
  needUser(user);
  return { items: notifier.list(user.id), unread: notifier.unread(user.id) };
});

on('POST', '/api/notifications/read', async ({ user }) => {
  needUser(user);
  notifier.markRead(user.id);
  return { unread: 0 };
});

on('POST', '/api/push/subscribe', async ({ request, user, body }) => {
  needUser(user);
  const origin = siteOrigin(request);
  if (!D.secrets.pushSubject && origin.startsWith('https://')) { D.secrets.pushSubject = origin; db.save(); }
  const result = notifier.subscribe(user, body);
  if (result.error) fail(400, result.error);
  return result;
});

on('POST', '/api/push/unsubscribe', async ({ user, body }) => {
  needUser(user);
  return notifier.unsubscribe(user, String(body.endpoint || ''));
});

on('POST', '/api/push/test', async ({ user }) => {
  needUser(user);
  return notifier.test(user);
});

/* Post from a link: a draft from Steam, GitHub, itch.io, stores and sites */

const previewLimit = limiter(30, 10 * 60 * 1000);

on('POST', '/api/link-preview', async ({ user, body }) => {
  needUser(user);
  if (!previewLimit(user.id)) fail(429, 'Слишком часто, подожди немного');
  const url = normalizeUrl(cleanText(body.url, 500)) || fail(400, 'Вставь ссылку на страницу проекта');
  let draft;
  try { draft = await linkDraft(url, process.env); } catch (error) { fail(422, `Не получилось прочитать страницу: ${error.message}`); }
  const polished = await aiPostDraft(process.env, draft);
  const { text, ...result } = draft;
  if (polished) Object.assign(result, { summary: polished.summary || result.summary, page: polished.page.length ? polished.page : result.page, tags: polished.tags.length ? polished.tags : result.tags, ai: true });
  return { draft: result };
});

// Pictures of a draft come from other sites: the server copies them, so the post keeps working.
on('POST', '/api/uploads/remote', async ({ user, body }) => {
  needUser(user);
  if (!uploadLimit(user.id)) fail(429, 'Слишком много загрузок, подожди немного');
  const url = safeHttpUrl(cleanText(body.url, 1000)) || fail(400, 'Нет ссылки на картинку');
  let file;
  try { file = await safeFetch(url, { env: process.env, accept: 'image/*', maxBytes: uploadLimits.gif, timeout: 10000 }); } catch (error) { fail(422, `Картинка не загрузилась: ${error.message}`); }
  const sniffed = sniffMedia(file.bytes);
  if (!sniffed || sniffed[0] !== 'image') fail(415, 'По ссылке не картинка');
  if (sniffed[1] !== 'gif' && file.bytes.length > uploadLimits.image) fail(413, 'Картинка больше 4 МБ');
  const name = `i-${randomUUID().slice(0, 18)}.${sniffed[1]}`;
  await db.putUpload(name, file.bytes);
  D.uploads[name] = { userId: user.id, type: 'image', size: file.bytes.length, createdAt: Date.now() };
  db.save();
  return { url: `/uploads/${name}`, type: 'image' };
});

on('POST', '/api/demo-check', async ({ request, user, body }) => {
  needUser(user);
  const url = cleanDemoUrl(body.url) || fail(400, 'Нужна ссылка https:// на веб-версию');
  return { url, embeddable: await embeddable(url, process.env, siteOrigin(request)) };
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
  for (const project of new Set(events.map(event => byId.get(String(event?.id || ''))).filter(Boolean))) {
    const quality = projectQuality({ votes: project.votes.length + (project.seedVotes || 0), saves: project.saves.length, comments: project.comments.length }, D.feedStats[project.id]);
    if (publisherShouldNotice(project, quality, { watchers: (project.watchers || []).length, saves: project.saves.length })) {
      project.publisherNoticed = Date.now();
      notifier.notify(project.ownerId, { type: 'publisher', actorId: 'prostim', projectId: project.id, url: `/#/project/${project.id}` });
    }
  }
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
  if (following && blockedEither(user.id, target.id)) fail(403, 'Подписка недоступна: один из вас заблокировал другого');
  D.follows[user.id] = following ? [...list, target.id] : list.filter(id => id !== target.id);
  db.save();
  if (following) notifier.notify(target.id, { type: 'follow', actorId: user.id, url: `/#/u/${user.handle}` });
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
  const project = body.projectId ? D.projects.find(item => item.id === String(body.projectId) && item.ownerId === user.id) : null;
  if (project) {
    application.projectId = project.id;
    project.applicationId = application.id;
    if (['none', 'preparing'].includes(project.steam?.status || 'none')) project.steam = cleanSteam({ status: 'applied' }, project.steam);
  }
  if (hasPlus(user)) Object.assign(application, { priority: true, documentReview: true });
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
  if (blockedBy(target.id, user.id)) fail(403, 'Этот человек ограничил сообщения');
  if (blockedBy(user.id, target.id)) fail(403, 'Ты заблокировал этого человека — разблокируй его в профиле');
  const accepts = privacyOf(target).messages;
  const wroteFirst = D.messages.some(message => message.from === target.id && message.to === user.id);
  if (!target.official && !wroteFirst && (accepts === 'nobody' || (accepts === 'following' && !follows(target.id, user.id)))) {
    fail(403, accepts === 'nobody' ? 'Этот человек не принимает сообщения' : 'Этот человек принимает сообщения только от тех, на кого подписан');
  }
  const text = cleanText(body.text, 2000);
  const sticker = stickerById(body.sticker)?.id || '';
  const image = body.image ? ownedUpload(body.image, user, 'image').url : '';
  const shared = body.project ? D.projects.find(project => project.id === String(body.project) && visibleTo(project, user.id)) || fail(404, 'Проект не найден') : null;
  if (!text && !sticker && !image && !shared) fail(400, 'Пустое сообщение');
  D.messages.push({ id: randomUUID(), from: user.id, to: target.id, text, ...(image ? { image } : {}), ...(sticker ? { sticker } : {}), ...(shared ? { project: shared.id } : {}), createdAt: Date.now() });
  D.reads[user.id] = { ...(D.reads[user.id] || {}), [target.id]: Date.now() };
  db.save();
  pushTo([target.id], 'dm', { from: user.handle });
  notifier.notify(target.id, { type: 'message', actorId: user.id, snippet: text || (sticker ? 'Стикер' : image ? 'Картинка' : `Проект «${shared.title}»`), url: `/#/inbox/${user.handle}` });
  return { threads: threadsFor(user.id) };
});

// One reaction per person per message; the same emoji again takes it back.
on('POST', '/api/messages/:handle/react', async ({ user, params, body }) => {
  needUser(user);
  const target = userByHandle(params.handle) || fail(404, 'Пользователь не найден');
  const message = D.messages.find(item => item.id === body.id && ((item.from === user.id && item.to === target.id) || (item.from === target.id && item.to === user.id))) || fail(404, 'Сообщение не найдено');
  const emoji = chatReactions.includes(body.emoji) ? body.emoji : fail(400, 'Такой реакции нет');
  message.reactions ||= {};
  if (message.reactions[user.id] === emoji) delete message.reactions[user.id]; else message.reactions[user.id] = emoji;
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
  const limit = aiLimits[hasPlus(user) ? 'plus' : 'free'].devices;
  const owned = Object.values(D.devices).filter(device => device.ownerId === user.id).length;
  if (owned >= limit) fail(403, hasPlus(user) ? `Подключено ${owned} компьютеров — это предел. Отключи один в ИИ-мире.` : `Без Плюса можно подключить ${limit} компьютера. С Плюсом — до ${aiLimits.plus.devices}.`);
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
  return { task: createTask(user, params.id, body) };
});

function createTask(user, workspaceId, body) {
  const { workspace, role, device } = requireWorkspace(workspaceId, user, 'run');
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
  const attachments = (Array.isArray(body.attachments) ? body.attachments.slice(0, 8) : []).map(id => {
    const meta = D.uploads[String(id)];
    if (!meta || meta.type !== 'file' || meta.userId !== user.id) fail(400, 'Вложение не найдено, загрузи его ещё раз');
    return { id: String(id), filename: meta.filename, size: meta.size, kind: meta.kind };
  });
  const task = { id: `k-${randomUUID().slice(0, 12)}`, workspaceId: workspace.id, userId: user.id, prompt, attachments, mode, engine, resumeSessionId, status: 'waiting', createdAt: Date.now(), events: [] };
  D.tasks[task.id] = task;
  const delivered = deliverTask(task);
  updateTask(task, { status: delivered ? 'sent' : 'waiting' });
  const ids = Object.values(D.tasks).filter(item => item.workspaceId === workspace.id).sort((left, right) => left.createdAt - right.createdAt).map(item => item.id);
  const keep = aiLimits[hasPlus(D.users[workspace.ownerId]) ? 'plus' : 'free'].history;
  for (const old of ids.slice(0, Math.max(0, ids.length - keep))) delete D.tasks[old];
  return { ...taskSummary(task), events: task.events };
}

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
  device.version = cleanText(body.version, 20);
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
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; media-src 'self' blob: data:; connect-src 'self' https://api.github.com; frame-src https:; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
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
      if (!isAgent && !['/api/uploads', '/api/files'].includes(pathname) && !['GET', 'HEAD'].includes(request.method) && !String(request.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Нужен JSON');
      const params = route.regex.exec(pathname).groups || {};
      const needsBody = ['POST', 'PATCH', 'DELETE'].includes(request.method) && !['/api/projects', '/api/uploads', '/api/files', '/api/agent/reply', '/api/agent/events'].includes(pathname) && !(request.method === 'PATCH' && /^\/api\/projects\/[^/]+$/.test(pathname));
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
    const upload = /^[\w.-]+$/.test(name) && !name.startsWith('f-') ? await db.getUpload(name).catch(() => null) : null;
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
