import { demoProjects, demoFiles, initialTopics, steamDocuments, steamSteps, readinessItems, demoThreads, studio, publisherServices, payoutFlow, payoutFacts, roadmap, steamFaq, PUBLISHER_FEE, publisherPerks, studioGames } from './data.js';
import { icon, logoMark } from './icons.js';
import { STORAGE_KEY, escapeHtml, safeUrl, toggleMembership, loadState, filterProjects } from './state.js';
import { trustLevels, levelTier, levelTiers, helpLevels, helpPoints, helpAreas, commentHelp } from './trust.js';
import { chatReactions, chatEmoji, chatStickers, stickerById } from './chat.js';
import { AD_EVERY, boostPlans, boostPrice, plusPlan, plusCompare, placeAds, PLUS_DISCOUNT, profileBanners, profileAccents, MOTION_VIDEO_LIMIT } from './ads.js';
import { renderRun, runMeta, isActive, modeNames, modeHints, statusNames, unifiedDiffHtml } from './timeline.js';
import { steamStatuses, steamReadiness, taskFromComment, taskFromFeedback, updateFromTask, sparkRules, sparkPrices, playtestAccess, playtestDraft, playtestSlots, playtestBounties, PLAYTEST_STEPS } from './ecosystem.js';
import { emptyTaste, emptyStats, cleanTaste, cleanStats, recordSignal, recordStat, rankFeed, projectQuality, expectedDwell, topInterests, tasteConfidence, statSignals, hiddenByPrefs } from './recommend.js';
import { cleanFeedPrefs, emptyFeedPrefs, withFeedPref, searchProjects, reportReasons, sortComments, commentSorts, feedbackKinds, reviewTags, commentLabels } from './social.js';
import { postStages, postPlatforms, postPricing, postSeeking, pageFonts, pageSizes, pageWeights, pageBackgrounds, pageColors, pageBlockTypes, PAGE_BLOCK_LIMIT, POST_LINK_LIMIT, linkKind, normalizeUrl, cleanDemoUrl, imageRatios, focusStyle, cleanTheme, cleanPostFields, themeVars, themeClass, fontFamiliesFor, blockClass, blockStyle, pageHtml } from './page.js';

const main = document.querySelector('main');
const topbar = document.querySelector('#topbar');
const dock = document.querySelector('#dock');
const modal = document.querySelector('#modal');
const toastElement = document.querySelector('#toast');
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } };
}
let state = loadState(storage);

// iPhone Safari zooms into small text fields and keeps the zoom, which pushes the app past the screen edges.
// A maximum scale stops that automatic zoom; pinch-to-zoom still works on iOS.
const viewportMeta = document.querySelector?.('meta[name="viewport"]');
if (viewportMeta && /iP(hone|ad|od)/.test(globalThis.navigator?.userAgent || '') && !viewportMeta.content.includes('maximum-scale')) viewportMeta.content += ', maximum-scale=1';
state.projects = state.projects.map(project => ({ ...project, ...cleanPostFields(project) }));
let online = false;
let remote = null;
let me = null;
let search = '';
let feedCategory = 'all';
let dialogContext = null;
let toastTimer;
const slides = new Map();
let source = { name: 'Мой проект', type: 'demo', label: 'Демо-проект' };
let files = demoFiles.map(file => ({ ...file }));
let selectedFile = files[0];
let messages = [];
let demoTasks = ['Собрать идеи для проекта', 'Подготовить первую страницу', 'Показать результат друзьям'];
let completeTasks = [];
let writingFile = false;
let promptDraft = '';
let connectionVersion = 0;
let feedScrollTop = 0;
let feedObserver = null;
let activity = { items: [], loaded: false, loading: false }; // the notification list, loaded when opened
let installPrompt = null; // Chrome's "install app" offer, kept for the button in settings
let localFeedPrefs = null;
let prefQuery = '';
let replyTarget = null; // { projectId, id, name } while answering a comment
const hiddenLocally = new Set(); // posts ("id") and comments ("c:id") reported in this session
let adObserver = null; // marks an ad the moment its first pixels scroll in
let projectOpenedFromApp = false;
let lastService = 'feed';
let renderedView = '';
let workspacePane = 'assistant';
let openStep = steamSteps[0].id;
let authMode = 'register';
let publishMedia = [];
let postDraft = null;
const loadedFonts = new Set();
const legacyScenes = ['forest', 'coast', 'board', 'analytics'];
let feedMuted = true;
let avatarDraft = null;
let liveEvents = null;
const reviewsCache = new Map();
const calculator = { price: 15, copiesIndex: 5 };
const copySteps = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
let lastTap = { time: 0, id: '' };
let tapTimer;
let pointerStart = null;
const TASTE_KEY = 'prostim-taste-v1';
let localTaste = emptyTaste();
let localStats = {};
let feedOrder = null;
const slideFrom = new Map(); // project id → slide it is leaving, for the dot that shrinks
let feedSeed = Math.floor(Math.random() * 1e6);
let pinnedProjectId = '';
let activeView = null;
let feedEvents = [];
let feedFlushTimer;
let tasteSaveTimer;
let feedRefreshing = false;
let pullState = null;
let wheelPull = { amount: 0, armed: false, last: 0, timer: null };
const reasonLabels = { update: ['bell', 'Обновление'], new: ['sparkle', 'Новое'], taste: ['flame', 'Для тебя'], follow: ['users', 'Подписки'], popular: ['up', 'Популярное'], again: ['refresh', 'Снова'], discover: ['search', 'Открытие'], mine: ['user', 'Твой проект'], ad: ['megaphone', 'Реклама'] };
try {
  const savedTaste = JSON.parse(storage.getItem(TASTE_KEY) || '{}');
  localTaste = cleanTaste(savedTaste.taste);
  localStats = Object.fromEntries(Object.entries(savedTaste.stats || {}).map(([id, value]) => [id, cleanStats(value)]));
} catch {}
const ai = { attachments: {}, workspaces: [], details: new Map(), trees: new Map(), git: new Map(), errors: new Map(), loading: new Set(), file: null, pair: null, pairAllow: 'edit', pairOs: /Win/.test(globalThis.navigator?.userAgent || '') ? 'win' : 'unix', paired: null, draft: '', mode: 'edit', engine: {}, continueChat: true, expanded: new Set(), treeFilter: '', sending: false };

const photos = {
  forest: 'https://images.squarespace-cdn.com/content/v1/616632df4479e534656ecf49/294a683d-1d98-44ae-8cf9-1ad265169dea/marita-kavelashvili-ugnrXk1129g-unsplash.jpg',
  coast: 'https://images.unsplash.com/photo-1681316152147-e8dffd56404c?fm=jpg&q=80&w=1800'
};
const categoryNames = { games: 'Игры', apps: 'Приложения', tools: 'Инструменты' };
const categoryIcons = { games: 'gamepad', apps: 'grid', tools: 'code' };
const services = [['feed', 'Лента'], ['steam', 'Steam'], ['ai', 'ИИ-мир']];
const sectionTitles = { feed: 'Лента', steam: 'Steam', ai: 'ИИ-мир', search: 'Обзор', inbox: 'Входящие', activity: 'Уведомления', me: 'Профиль', settings: 'Настройки', u: 'Автор' };
const localMe = { handle: 'me', name: 'Вы', author: 'Вы', initials: 'Я', color: '#e5e1d8' };
const number = new Intl.NumberFormat('ru-RU');
const money = value => `$${number.format(Math.round(value))}`;
const canReachServer = typeof fetch === 'function' && /^https?:$/.test(globalThis.location?.protocol || '');

/* Server access */

async function apiCall(method, path, body) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data.error || `Ошибка ${response.status}`);
    error.status = response.status;
    if (response.status === 401 && me) { me = null; render(); }
    throw error;
  }
  return data;
}

function applyBootstrap(data) {
  remote = data;
  me = data.me;
  remote.userMap = new Map(data.users.map(user => [user.handle, user]));
  remote.taste = cleanTaste(data.taste);
  state.votes = data.votes;
  state.saved = data.saved;
  state.follows = data.follows;
  ai.workspaces = data.workspaces || [];
  remote.feedPrefs = cleanFeedPrefs(data.feedPrefs);
  remote.activity ||= { unread: 0 };
}

async function loadBootstrap() {
  applyBootstrap(await apiCall('GET', '/api/bootstrap'));
}

async function reloadAll({ rerender = true } = {}) {
  if (!online) return;
  try {
    await flushFeedEvents();
    await loadBootstrap();
    connectEvents();
    if (rerender) renderKeepingInput();
  } catch {}
}

function connectEvents() {
  liveEvents?.close();
  liveEvents = null;
  if (!online || !me || typeof EventSource !== 'function') return;
  liveEvents = new EventSource('/api/events');
  const parse = event => { try { return JSON.parse(event.data); } catch { return {}; } };
  liveEvents.addEventListener('task', event => onTaskEvent(parse(event)));
  liveEvents.addEventListener('workspaces', () => refreshWorkspaces());
  liveEvents.addEventListener('paired', event => { ai.paired = parse(event); toast(`Компьютер «${ai.paired.name}» подключён`); refreshWorkspaces(); });
  liveEvents.addEventListener('dm', () => reloadAll());
  liveEvents.addEventListener('notice', event => toast(parse(event).text || ''));
  liveEvents.addEventListener('notify', event => onNotify(parse(event)));
}

function needLogin(reason = '') {
  if (!online || me) return false;
  openAuth('register', reason);
  return true;
}

/* Small helpers */

function myHandle() {
  return online ? me?.handle || '' : 'me';
}

function isMine(handle) {
  return Boolean(handle) && handle === myHandle();
}

function userByHandle(handle) {
  return remote?.userMap?.get(handle) || null;
}

function updateUser(user) {
  if (!user || !remote) return;
  remote.userMap.set(user.handle, user);
  const index = remote.users.findIndex(item => item.handle === user.handle);
  if (index >= 0) remote.users[index] = user; else remote.users.push(user);
  if (me?.handle === user.handle) me = user;
}

function projects() {
  if (online) return remote.projects;
  return [...state.projects, ...demoProjects];
}

function projectById(id) {
  return projects().find(project => project.id === id);
}

function replaceProject(project) {
  const index = remote.projects.findIndex(item => item.id === project.id);
  if (index >= 0) remote.projects[index] = project; else remote.projects.unshift(project);
}

function persist() {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    if (!online) toast('Сохранится только до закрытия вкладки');
  }
}

function toast(text) {
  if (!text) return;
  clearTimeout(toastTimer);
  const host = modal.open ? modal : document.body;
  if (toastElement.parentNode !== host) host.appendChild?.(toastElement);
  toastElement.textContent = text;
  toastElement.classList.add('visible');
  toastTimer = setTimeout(() => toastElement.classList.remove('visible'), 3200);
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(part => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  const [section = '', page = '', extra = '', more = ''] = parts;
  return { section: section || 'feed', page, extra, more };
}

function go(hash) {
  if (modal.open) modal.close();
  dialogContext = null;
  if (route().section === 'project' && history.replaceState) {
    projectOpenedFromApp = false;
    history.replaceState(null, '', hash);
    render(false);
  } else location.hash = hash;
}

function isCompact() {
  return Boolean(window.matchMedia?.('(max-width: 1100px)').matches);
}

function uploadUrl(value) {
  return /^\/uploads\/[\w.-]+$/.test(value || '') ? value : '';
}

function avatar(person, className = '') {
  const color = /^#[0-9a-f]{6}$/i.test(person?.color || '') ? person.color : '#cfd9c4';
  const motion = person?.look?.motion;
  const motionUrl = uploadUrl(motion?.url);
  const big = /\b(xl|xxl|pcard-ava)\b/.test(className);
  if (motionUrl && motion.type === 'video' && big) return `<span class="avatar ${className} photo motion" style="--avatar:${color}"><video src="${motionUrl}" autoplay muted loop playsinline preload="metadata" aria-hidden="true"></video></span>`;
  const photo = motionUrl && motion.type === 'image' ? motionUrl : uploadUrl(person?.avatar);
  return `<span class="avatar ${className} ${photo ? 'photo' : ''}" style="--avatar:${color}">${photo ? `<img src="${photo}" alt="" loading="lazy">` : escapeHtml(person?.initials || (person?.name || 'Я').slice(0, 1))}</span>`;
}

// The Plus mark next to a name, like a verified tick.
function plusBadge(person, big = false) {
  if (!person?.plus) return '';
  return big ? `<button class="plus-badge big" data-action="plus" title="Плюс" aria-label="Аккаунт с Плюсом">${icon('crown')}</button>` : `<i class="plus-badge" title="Плюс" aria-label="Плюс">${icon('crown')}</i>`;
}

// Rating gauge around an avatar: a full circle of rounded segments, like a speedometer.
// Lit segments show the average rating out of 5, the colour shows the level (levelTiers in trust.js),
// and the rating itself sits under the avatar: 4,0 · 4,7 · 1,2.
const gaugeArcs = new Map();

function gaugePaths(count) {
  if (gaugeArcs.has(count)) return gaugeArcs.get(count); // kept for the level legend
  const radius = 46;
  const step = 360 / count;
  const gap = step * 0.5;
  const point = angle => `${(50 + radius * Math.cos(angle * Math.PI / 180)).toFixed(2)} ${(50 + radius * Math.sin(angle * Math.PI / 180)).toFixed(2)}`;
  // Starts at the bottom, under the rating, and goes clockwise.
  const paths = Array.from({ length: count }, (_, index) => `M${point(90 + index * step + gap / 2)}A${radius} ${radius} 0 0 1 ${point(90 + (index + 1) * step - gap / 2)}`);
  gaugeArcs.set(count, paths);
  return paths;
}

function ratingText(value) {
  return Number(value).toFixed(1).replace('.', ',');
}

// The rating as a thin ring around the avatar: a faint full track and a lit arc that starts at the bottom,
// under the rating, and runs clockwise as far as the average goes. One smooth stroke, so it reads as a
// gauge and not as the petals of a flower. The top level paints the arc as a rainbow.
function gaugeSvg(who, tier, count = 12) {
  const rated = Number(who?.ratingCount) > 0;
  const share = rated ? Math.max(0, Math.min(5, Number(who.ratingAverage) || 0)) / 5 : 0;
  const radius = 46;
  const length = 2 * Math.PI * radius;
  let arc = '';
  if (share && tier.legend) {
    const pieces = Math.max(1, Math.round(share * count * 4));
    const step = 360 / (count * 4);
    const point = angle => `${(50 + radius * Math.cos(angle * Math.PI / 180)).toFixed(2)} ${(50 + radius * Math.sin(angle * Math.PI / 180)).toFixed(2)}`;
    arc = Array.from({ length: pieces }, (_, index) => `<path class="lit" d="M${point(90 + index * step)}A${radius} ${radius} 0 0 1 ${point(90 + (index + 1) * step + 0.4)}" style="stroke:hsl(${Math.round(index * 360 / (count * 4))} 90% 72%)"/>`).join('');
  } else if (share) {
    arc = `<circle class="lit" cx="50" cy="50" r="${radius}" stroke-dasharray="${(share * length).toFixed(1)} ${length.toFixed(1)}" transform="rotate(90 50 50)"/>`;
  }
  return `<svg class="gauge" viewBox="0 0 100 100" aria-hidden="true" data-share="${share.toFixed(2)}"><circle class="track" cx="50" cy="50" r="${radius}"/>${arc}</svg>`;
}

function ringClass(tier, extra = '') {
  return ['lvl', extra, tier.aura ? 'aura' : '', tier.strong ? 'strong' : '', tier.legend ? 'legend' : ''].filter(Boolean).join(' ');
}

function ringAvatar(person, className = '', who = person, withScore = false) {
  const level = Number(who?.level);
  if (!level) return avatar(person, className);
  const tier = levelTier(level);
  const rated = Number(who.ratingCount) > 0;
  const title = `Уровень ${level}${rated ? ` · оценка ${ratingText(who.ratingAverage)}` : ''}`;
  return `<span class="${ringClass(tier)}" style="--ring:${tier.color}" title="${title}">${avatar(who?.look && !person.look ? { ...person, look: who.look } : person, className)}${gaugeSvg(who, tier)}${tier.strong ? '<i class="lvl-orbit" aria-hidden="true"></i>' : ''}${withScore && rated ? `<i class="lvl-score">${ratingText(who.ratingAverage)}</i>` : ''}</span>`;
}

function stars(value) {
  const full = Math.round(Number(value) || 0);
  return `<span class="stars" aria-hidden="true">${[1, 2, 3, 4, 5].map(index => `<i class="${index <= full ? 'on' : ''}">★</i>`).join('')}</span>`;
}

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = (Date.now() - timestamp) / 1000;
  if (seconds < 60) return 'сейчас';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} дн назад`;
  return new Date(timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function clockTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function voteCount(project) {
  return (Number(project.votes) || 0) + Number(state.votes.includes(project.id));
}

function projectComments(project) {
  return online ? project.comments : [...project.comments, ...(state.comments[project.id] || [])];
}

function commentCount(project) {
  return projectComments(project).length;
}

function emptyState(iconName, title, action = '', text = '') {
  return `<div class="empty">${icon(iconName)}<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}

function subnav(section, items, active) {
  return `<nav class="subnav" aria-label="Разделы">${items.map(([id, label]) => `<a href="#/${section}${id ? `/${id}` : ''}" class="${id === active ? 'active' : ''}" ${id === active ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function trustBadge(person, compact = false) {
  if (!person || person.official || !online) return person?.official ? `<span class="trust-pill official">${icon('check')} Официальный</span>` : '';
  const level = trustLevels[person.trust] || trustLevels.new;
  if (compact) return person.ratingCount ? `<span class="trust-mini trust-${escapeHtml(person.trust)}">★ ${String(person.ratingAverage).replace('.', ',')}</span>` : '';
  return `<button class="trust-pill trust-${escapeHtml(person.trust)}" data-action="trust-info" data-handle="${escapeHtml(person.handle)}">${person.ratingCount ? `${stars(person.ratingAverage)}<b>${String(person.ratingAverage).replace('.', ',')}</b><small>${person.ratingCount} · ${level.label}</small>` : `<b>${level.label}</b><small>нет оценок</small>`}</button>`;
}

function renderKeepingInput() {
  const values = [];
  for (const element of main.querySelectorAll?.('input[name], textarea[name]') || []) if (element.type !== 'file' && element.type !== 'radio' && element.type !== 'checkbox') values.push([element.name, element.value]);
  const focused = document.activeElement?.name;
  render();
  for (const [name, value] of values) {
    const element = main.querySelector?.(`[name="${name}"]`);
    if (element && 'value' in element && !element.value && value) element.value = value;
  }
  if (focused) main.querySelector?.(`[name="${focused}"]`)?.focus?.();
}

/* Messages */

function authorThread(project) {
  return { id: project.handle, handle: project.handle, name: project.author, initials: project.initials, color: project.color, unread: 0, messages: [] };
}

function threads() {
  if (online) return (remote.threads || []).map(thread => ({ ...thread, all: thread.messages.map(message => ({ ...message, time: clockTime(message.createdAt) })) }));
  const list = demoThreads.map(thread => ({ ...thread }));
  for (const id of Object.keys(state.dms)) {
    if (list.some(thread => thread.id === id)) continue;
    const author = projects().find(project => project.handle === id && id !== 'me');
    if (author) list.push(authorThread(author));
  }
  return list.map(thread => ({ ...thread, all: [...thread.messages, ...(state.dms[thread.id] || []).map(message => ({ ...message, from: 'me' }))] }));
}

function threadById(id) {
  const found = threads().find(thread => thread.id === id);
  if (found) return found;
  if (online) {
    const user = userByHandle(id);
    return user && !isMine(id) ? { id: user.handle, handle: user.handle, name: user.name, initials: user.initials, color: user.color, unread: 0, all: [] } : null;
  }
  const author = projects().find(project => project.handle === id && id !== 'me');
  return author ? { ...authorThread(author), all: [] } : null;
}

function threadUnread(thread) {
  return online ? thread.unread > 0 : Boolean(thread.unread) && !state.read.includes(thread.id);
}

function unreadCount() {
  if (online) return (remote?.threads || []).filter(thread => thread.unread > 0).length;
  return demoThreads.filter(thread => thread.unread && !state.read.includes(thread.id)).length;
}

/* Rendering */

function render(force = true) {
  const current = route();
  if (current.section === 'project' && renderedView) {
    if (projectById(current.page)) openProject(current.page);
    return;
  }
  const section = current.section === 'project' ? 'feed' : current.section;
  const view = Object.hasOwn(sectionTitles, section) ? section : 'feed';
  if (services.some(([id]) => id === view)) lastService = view;
  if (view === 'feed' && current.section === 'feed') {
    const next = Object.hasOwn(categoryNames, current.page) ? current.page : 'all';
    if (next !== feedCategory) { feedCategory = next; feedScrollTop = 0; }
  }
  if (view === 'inbox' && current.page) markRead(current.page);
  document.body.dataset.section = view;
  document.body.dataset.view = view === 'feed' ? 'feed' : 'page';
  document.title = `${sectionTitles[view]} · про.стим`;
  renderChrome(view, current);
  const key = view === 'feed' ? `feed:${feedCategory}` : `${view}/${current.page}/${current.extra}/${current.more}`;
  if (force || key !== renderedView) {
    const changedPage = key !== renderedView;
    if (view === 'steam') main.innerHTML = renderSteam(current.page);
    else if (view === 'ai') main.innerHTML = renderAi(current);
    else if (view === 'search') main.innerHTML = renderSearch();
    else if (view === 'inbox') main.innerHTML = renderInbox(current.page);
    else if (view === 'activity') main.innerHTML = renderActivity();
    else if (view === 'settings') main.innerHTML = renderSettings();
    else if (view === 'me') main.innerHTML = online && !me ? renderAuthPage() : renderProfile(myHandle(), current.page);
    else if (view === 'u') main.innerHTML = isMine(current.page) ? renderProfile(myHandle(), current.extra) : renderProfile(current.page, current.extra);
    else main.innerHTML = renderFeed();
    renderedView = key;
    afterRender(view, changedPage, current);
  }
  if (current.section === 'project' && projectById(current.page)) openProject(current.page);
}

function markRead(id) {
  if (online) {
    const thread = remote?.threads?.find(item => item.id === id);
    if (thread?.unread) {
      thread.unread = 0;
      apiCall('POST', `/api/messages/${encodeURIComponent(id)}/read`).catch(() => {});
    }
  } else if (!state.read.includes(id)) {
    state.read = [...state.read, id];
    persist();
  }
}

function renderChrome(view, current) {
  const isService = services.some(([id]) => id === view);
  if (isService) {
    topbar.innerHTML = `<nav class="services" aria-label="Сервисы">${services.map(([id, label]) => id === 'feed' && view === 'feed'
      ? `<a href="#/feed" class="active" aria-current="page" data-action="feed-modes" aria-haspopup="menu" aria-expanded="false" title="Что показывать: ${feedModeLabel()}"><i class="mode-dot ${feedMode === 'foryou' ? '' : 'custom'}" aria-hidden="true"></i>${label}</a>`
      : `<a href="#/${id}" class="${id === view ? 'active' : ''}" ${id === view ? 'aria-current="page"' : ''}>${label}</a>`).join('')}<i class="services-bar" aria-hidden="true"></i></nav>${view === 'feed' ? feedModeMenuHtml() : ''}${bellHtml()}`;
    placeServicesBar();
  } else {
    const thread = view === 'inbox' && current.page ? threadById(current.page) : null;
    const title = thread ? thread.name : view === 'u' ? `@${current.page}` : view === 'me' && online && !me ? 'Вход' : sectionTitles[view];
    const back = thread || view === 'u' || view === 'settings';
    const gear = `<a class="top-bell" href="#/settings" aria-label="Настройки">${icon('gear')}</a>`;
    const end = view === 'activity' ? (online && me ? `<button class="top-bell" data-action="notify-settings" aria-label="Настройки уведомлений">${icon('gear')}</button>` : '')
      : view === 'me' && (!online || me) ? `<span class="top-actions">${bellHtml()}${gear}</span>` : view === 'settings' ? '' : bellHtml();
    topbar.innerHTML = `${back ? `<button class="top-back" data-action="back" aria-label="Назад">${icon('chevronLeft')}</button>` : ''}<span class="top-title">${escapeHtml(title)}</span>${end}`;
  }
  const unread = unreadCount();
  const profileLabel = online && !me ? 'Войти' : 'Профиль';
  const items = [
    ['home', `#/${lastService}`, 'Главная', 'home', isService],
    ['search', '#/search', 'Обзор', 'search', view === 'search'],
    ['publish'],
    ['inbox', '#/inbox', 'Входящие', 'inbox', view === 'inbox', unread],
    ['me', '#/me', profileLabel, 'user', view === 'me']
  ];
  dock.innerHTML = `<a class="dock-brand" href="#/feed" aria-label="про.стим — лента"><span class="brand-mark">${logoMark}</span><span class="label">про.стим</span></a>${items.map(([id, href, label, iconName, active, badge]) => id === 'publish'
    ? `<button class="dock-item dock-publish" data-action="publish" aria-label="Опубликовать проект">${icon('plus')}<span class="label">Опубликовать</span></button>`
    : `<a class="dock-item ${active ? 'active' : ''}" href="${href}" ${active ? 'aria-current="page"' : ''} ${id === 'home' ? 'data-action="home"' : ''}>${id === 'me' && me ? ringAvatar(me, 'dock-avatar') : icon(iconName)}<span class="label">${label}</span>${badge ? `<i class="badge" aria-label="Непрочитанных: ${badge}">${badge}</i>` : ''}</a>`).join('')}<div class="dock-foot">${online ? (me ? `@${escapeHtml(me.handle)}` : 'Гость') : 'Локальный режим'} · Молдова</div>`;
}

let servicesBarX = null;

function placeServicesBar() {
  const nav = topbar.querySelector?.('.services');
  const bar = nav?.querySelector?.('.services-bar');
  const active = nav?.querySelector?.('a.active');
  if (!bar?.style || !active) return;
  const x = active.offsetLeft + active.offsetWidth / 2;
  if (servicesBarX !== null && servicesBarX !== x) {
    bar.style.transition = 'none';
    bar.style.transform = `translateX(${servicesBarX}px)`;
    void bar.offsetWidth;
    bar.style.transition = '';
  }
  bar.style.transform = `translateX(${x}px)`;
  servicesBarX = x;
}

const routeOrder = { feed: 0, steam: 1, ai: 2, search: 3, inbox: 4, activity: 4.5, me: 5, settings: 5.5, u: 6 };

// New content slides in from the side we are moving to; inside a section it just fades up.
function animateRoute(before, after) {
  if (!before || before.key === after.key || typeof document.createElement !== 'function') return;
  const target = after.view === 'feed' ? document.querySelector('#feed') : main.firstElementChild;
  if (!target?.classList) return;
  const dir = before.view === after.view ? 0 : Math.sign((routeOrder[after.view] ?? 3) - (routeOrder[before.view] ?? 3));
  // Pages with pinned composers only fade: a moving parent would drag fixed elements along for a moment.
  const name = target.querySelector?.('.chat-composer, .workspace, .composer') ? 'route-fade' : 'route-in';
  target.style.setProperty('--dir', String(dir));
  target.classList.remove('route-in', 'route-fade');
  void target.offsetWidth;
  target.classList.add(name);
  target.addEventListener('animationend', () => target.classList.remove(name), { once: true });
}

// Big numbers count up the first time they scroll into view.
function countUp(root = main) {
  if (typeof IntersectionObserver !== 'function') return;
  const numbers = root.querySelectorAll?.('[data-count]:not([data-counted])') || [];
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const element = entry.target;
      // Hold the final width so nothing around the number jumps while it counts.
      element.style.minWidth = `${element.offsetWidth}px`;
      const end = Number(element.dataset.count) || 0;
      const suffix = element.textContent.replace(/[\d\s]/g, '');
      const start = performance.now();
      const step = now => {
        const t = Math.min(1, (now - start) / 1100);
        element.textContent = `${Math.round(end * (1 - (1 - t) ** 3))}${suffix}`;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.4 });
  numbers.forEach(element => { element.dataset.counted = '1'; observer.observe(element); });
}

function afterRender(view, changedPage, current) {
  endView();
  feedObserver?.disconnect();
  feedObserver = null;
  adObserver?.disconnect();
  adObserver = null;
  if (view === 'ai') afterAiRender(current, changedPage);
  if (view === 'steam') countUp();
  if (view === 'u' && current.extra === 'reviews') loadReviews(current.page);
  if (view === 'me' && current.page === 'reviews' && me) loadReviews(me.handle);
  if (view === 'activity') loadActivity();
  syncAmbient(view);
  if (view !== 'feed') {
    revealBlocks(view);
    if (changedPage && !(view === 'ai' && current.page === 'w' && !current.more)) { if (view === 'inbox' && route().page) scrollChatEnd(); else window.scrollTo?.(0, 0); }
    return;
  }
  const feed = document.querySelector('#feed');
  if (!feed) return;
  sizeFeed(feed);
  watchFeedSize(feed);
  feed.scrollTop = feedScrollTop;
  feed.addEventListener('scroll', () => {
    feedScrollTop = feed.scrollTop;
    // Decorative animations pause while the feed moves, so scrolling keeps the full frame rate.
    document.body.classList.add('scrolling');
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => document.body.classList.remove('scrolling'), 180);
  }, { passive: true });
  feed.addEventListener('wheel', onFeedWheel, { passive: true });
  if (typeof IntersectionObserver === 'function' && feed.querySelectorAll) {
    feed.classList.add('io');
    markNextAds(feed);
    adObserver = new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.classList.toggle('near', entry.isIntersecting);
    }, { root: feed, threshold: 0 });
    feedObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.classList.toggle('in-view', entry.isIntersecting);
        syncFeedVideo(entry.target);
        if (entry.isIntersecting) {
          if (entry.target.dataset?.ad) reportAd(entry.target.dataset.ad, 'seen');
          beginView(entry.target);
          extendFeedNear(entry.target);
          preloadAhead(entry.target);
        } else if (activeView?.item === entry.target) endView();
      }
    }, { root: feed, threshold: 0.55 });
    observeFeedItems(feed);
  }
}

let scrollIdleTimer;

// Cards get a whole-pixel height: with a fractional one, snapping leaves a 1 px seam of the next card.
// A ResizeObserver keeps it right when styles arrive late or Safari's toolbar changes the viewport.
let feedResizeObserver = null;

function sizeFeed(feed = document.querySelector('#feed')) {
  if (!feed?.style || !feed.getBoundingClientRect || getComputedStyle(feed).position !== 'fixed') return;
  const height = Math.ceil(feed.getBoundingClientRect().height);
  const before = parseFloat(feed.style.getPropertyValue('--item-h')) || 0;
  if (!(height > 0) || before === height) return;
  // Keep the same card in place: without this a new height leaves the feed between two cards.
  const index = before ? Math.round(feed.scrollTop / before) : -1;
  feed.style.setProperty('--item-h', `${height}px`);
  if (index >= 0) { feed.scrollTop = index * height; feedScrollTop = feed.scrollTop; }
}

function watchFeedSize(feed) {
  feedResizeObserver?.disconnect();
  if (typeof ResizeObserver !== 'function') return;
  feedResizeObserver = new ResizeObserver(() => sizeFeed(feed));
  feedResizeObserver.observe(feed);
}

function observeFeedItems(feed) {
  feed.querySelectorAll('.feed-item:not([data-observed])').forEach(item => {
    item.dataset.observed = '1';
    feedObserver?.observe(item);
    if (item.classList.contains('is-ad')) adObserver?.observe(item);
  });
}

/* Scenes: covers drawn from HTML and CSS, or uploaded screenshots */

function projectMedia(project) {
  const list = project.media || (project.images || []).map(url => ({ type: 'image', url }));
  return list.filter(item => uploadUrl(item.url) && ['image', 'video'].includes(item.type)).slice(0, 8);
}

function projectImages(project) {
  return projectMedia(project).filter(item => item.type === 'image').map(item => item.url);
}

function syncFeedVideo(item) {
  const video = item?.querySelector?.('video[data-feed-video]');
  if (!video) return;
  if (!video.dataset.tracked) {
    video.dataset.tracked = '1';
    let lastTime = 0;
    video.addEventListener('timeupdate', () => {
      const view = activeView;
      if (view && video.currentTime + 0.5 < lastTime && lastTime > 1 && view.item.contains?.(video) && view.rewatches < 2) {
        view.rewatches += 1;
        trackSignal(projectById(view.id), 'rewatch');
      }
      lastTime = video.currentTime;
    });
  }
  video.muted = feedMuted;
  if (item.classList.contains('in-view') && !modal.open && !dataSaver) video.play?.().catch(() => {}); else video.pause?.();
}

// Every picture of a post keeps its chosen point in view, in the feed, on the page and in thumbnails.
function mediaHtml(item, title, mode) {
  const html = rawMediaHtml(item, title, mode);
  const style = mode === 'player' ? '' : focusStyle(item.focus);
  return style ? html.replace(/<(img|video) /, `<$1 style="${style}" `) : html;
}

function rawMediaHtml(item, title, mode) {
  if (item.type === 'video') {
    const poster = uploadUrl(item.poster);
    if (mode === 'still') return poster ? `<div class="scene photo upload"><img src="${poster}" alt="${escapeHtml(title)}" loading="lazy" draggable="false"><span class="play-mark">${icon('play')}</span></div>` : `<div class="scene photo upload"><video src="${item.url}#t=0.5" muted playsinline preload="metadata"></video><span class="play-mark">${icon('play')}</span></div>`;
    if (mode === 'player') return `<div class="scene photo upload player"><video src="${item.url}" ${poster ? `poster="${poster}"` : ''} controls playsinline preload="metadata"></video></div>`;
    if (mode === 'preview') return `<div class="scene photo upload">${poster ? `<img src="${poster}" alt="${escapeHtml(title)}" draggable="false">` : `<video src="${item.url}#t=0.1" muted playsinline preload="metadata"></video>`}<span class="play-mark">${icon('play')}</span></div>`;
    return `<div class="scene photo upload video"><video src="${item.url}" ${poster ? `poster="${poster}"` : ''} muted loop playsinline preload="metadata" data-feed-video></video><button class="sound-btn" data-action="toggle-sound" aria-label="${feedMuted ? 'Включить звук' : 'Выключить звук'}">${feedMuted ? '🔇' : '🔊'}</button></div>`;
  }
  return `<div class="scene photo upload"><img src="${item.url}" alt="${escapeHtml(title || 'Скриншот проекта')}" loading="lazy" draggable="false"></div>`;
}

// A post without photos gets a poster: its title in the page font on the page colour.
function coverArt(project) {
  const theme = cleanTheme(project.theme);
  ensureFonts(fontFamiliesFor(project));
  const stage = labelOf(postStages, project.stage);
  return `<div class="scene cover-art ${themeClass({ ...theme, bg: theme.bg || '#1d2a14' })}" style="${themeVars({ ...theme, bg: theme.bg || '#1d2a14' })}"><span class="cover-art-glow"></span><div class="cover-art-inner"><span class="cover-art-icon">${icon(categoryIcons[project.category] || 'sparkle')}</span><b class="cover-art-title">${escapeHtml(project.title || 'Название проекта')}</b>${stage ? `<span class="cover-art-stage">${stage}</span>` : ''}</div></div>`;
}

function labelOf(options, key) {
  return options.find(([value]) => value === key)?.[1] || '';
}

function ensureFonts(keys) {
  for (const key of keys) {
    const family = pageFonts[key]?.family;
    if (!family || loadedFonts.has(key) || typeof document.createElement !== 'function' || !document.head?.appendChild) continue;
    loadedFonts.add(key);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
    document.head.appendChild(link);
  }
}

function slideKinds(project) {
  const media = projectMedia(project);
  if (media.length) return media.map(item => item.type);
  const count = Math.max(1, Math.min(3, Number(project.slides) || 1));
  return count === 3 ? ['cover', 'alt', 'feature'] : count === 2 ? ['cover', 'feature'] : ['cover'];
}

function scene(project, slide = 0, mode = 'feed') {
  const media = projectMedia(project);
  if (media.length) return mediaHtml(media[Math.min(slide, media.length - 1)], project.title || '', mode);
  if (!legacyScenes.includes(project.scene)) return coverArt(project);
  const kind = slideKinds(project)[slide] || 'cover';
  const type = project.scene;
  if (kind === 'feature') {
    return `<div class="scene feature ${type}"><div class="feature-inner"><span class="feature-icon">${icon(categoryIcons[project.category] || 'sparkle')}</span>${(project.tags || []).slice(0, 4).map(tag => `<span class="feature-chip">${escapeHtml(tag)}</span>`).join('')}</div></div>`;
  }
  if (type === 'forest' || type === 'coast') {
    return `<div class="scene photo ${type} ${kind === 'alt' ? 'alt' : ''}"><img src="${photos[type]}" alt="${type === 'forest' ? 'Лес в тумане' : 'Горное побережье'}" ${project.id === 'forest-light' ? '' : 'loading="lazy"'} referrerpolicy="no-referrer" draggable="false"></div>`;
  }
  if (type === 'analytics') {
    const bars = [18, 28, 22, 45, 32, 50, 41, 61, 55, 76, 68, 89, 73, 98];
    return `<div class="scene analytics"><div class="mock dash"><div class="mock-bar"><b>pulse</b><span class="live"><i></i>онлайн</span></div><div class="dash-metrics"><div><small>Посетители</small><strong>2 846</strong><em>↗ 12,8%</em></div><div><small>Просмотры</small><strong>8 421</strong><em>↗ 8,4%</em></div></div><div class="dash-chart">${bars.map((height, index) => `<i style="height:${height}%;transition-delay:${index * 35}ms"></i>`).join('')}</div></div></div>`;
  }
  if (kind === 'alt') {
    const rows = [[true, 78], [true, 62], [false, 84], [false, 55], [true, 70]];
    return `<div class="scene board"><div class="mock"><div class="mock-bar"><b>контур</b><span class="mock-progress"><i></i></span></div>${rows.map(([done, width]) => `<div class="todo-row ${done ? 'done' : ''}"><i>${done ? icon('check') : ''}</i><span class="sk" style="width:${width}%"></span></div>`).join('')}</div></div>`;
  }
  const columns = [['Идеи', '#c9e07f', 3], ['В работе', '#f0c97f', 2], ['Готово', '#8fcfa5', 2]];
  return `<div class="scene board"><div class="mock"><div class="mock-bar"><b>контур</b><i></i><i></i><i></i></div><div class="kanban">${columns.map(([name, color, count]) => `<div class="kan-col"><span><i style="background:${color}"></i>${name}</span>${Array.from({ length: count }, (_, index) => `<div class="kan-card"><em style="background:${color}"></em><span class="sk"></span><span class="sk" style="width:${[60, 45, 70][index]}%"></span></div>`).join('')}</div>`).join('')}</div></div></div>`;
}

/* Feed */

function currentTaste() {
  return online && me ? (remote.taste ||= emptyTaste()) : localTaste;
}

function statsFor(project) {
  return online ? project.stats : localStats[project.id];
}

function savesCount(project) {
  return online ? Number(project.saves) || 0 : Number(state.saved.includes(project.id));
}

function rankOptions(seed, pinned = '') {
  return { taste: currentTaste(), stats: Object.fromEntries(projects().map(project => [project.id, statsFor(project)])), seed, follows: state.follows, me: myHandle(), pinned, prefs: feedPrefs(), reposts: repostMap(), watching: watchingList() };
}

function feedPool() {
  const visible = projects().filter(visibleInFeed);
  const list = filterProjects(visible, { category: feedCategory });
  return { list: list.length ? list : visible, empty: !list.length };
}

function buildFeedOrder() {
  const { list, empty } = feedPool();
  const adState = { since: 0, next: 0 };
  let entries;
  if (feedMode === 'following') {
    const mine = followingEntries(list);
    const rest = rankFeed(list.filter(project => !mine.some(entry => entry.id === project.id)), rankOptions(feedSeed)).map(feedEntry);
    entries = mine.length ? [...mine, { sep: 'following-end' }, ...rest] : [{ sep: 'following-empty' }, ...rest];
  } else {
    const ranked = rankFeed(list, { ...rankOptions(feedSeed, pinnedProjectId), mode: feedMode });
    entries = [...(empty ? [{ sep: 'empty' }] : []), ...ranked.map(feedEntry)];
  }
  feedOrder = { key: feedKey(), rounds: 1, done: false, adState, entries: placeAds(entries, feedAds(), adState) };
}

// Promoted posts the server picked for this viewer (none for Plus subscribers). Now and then про.стим
// takes one of these slots to offer its own subscription.
function feedAds() {
  if (!online) return [];
  const ads = (remote?.ads || []).filter(ad => projectById(ad.projectId));
  return hasPlusNow() ? ads : [...ads, { id: 'plus', projectId: '' }];
}

function plusFeedItem() {
  const perks = plusPlan.perks.slice(0, 3).map(perk => `<li>${icon('check')}${escapeHtml(perk)}</li>`).join('');
  return `<section class="feed-item is-ad plus-ad" data-ad="plus" aria-label="Реклама про.стим: ${plusPlan.title}"><article class="card"><button class="ad-skip" data-action="ad-skip">Пропустить ${icon('skip')}</button><div class="card-media plus-promo"><div class="plus-promo-art" aria-hidden="true"><i></i><i></i><i></i><span class="plus-promo-mark">${icon('crown')}</span></div><div class="card-shade"></div><div class="card-info"><span class="reason-chip ad">${icon('megaphone')}Реклама про.стим</span><h2 class="plus-promo-title">${plusPlan.title}</h2><ul class="plus-promo-perks">${perks}</ul><button class="btn btn-grad plus-promo-cta" data-action="plus">${remote?.account?.plusTrial ? `Попробовать бесплатно · ${plusPlan.trialHours} часа` : `Первый месяц · ${remote?.account?.plusPrice || plusPlan.price} ₽`}</button></div></div></article></section>`;
}

// The card before an ad gets a pearly wave along its bottom edge and a «skip» pill, so the ad never
// comes as a surprise and can be jumped over in one tap.
function markNextAds(feed = document.querySelector('#feed')) {
  feed?.querySelectorAll?.('.feed-item.is-ad').forEach(ad => {
    const frame = ad.querySelector?.('.card-media');
    if (frame && !frame.querySelector?.('.ad-frame')) frame.insertAdjacentHTML?.('beforeend', adFrameHtml());
    const before = ad.previousElementSibling;
    if (!before?.classList?.contains('feed-item') || before.classList.contains('is-ad')) return;
    before.classList.add('next-ad');
    const media = before.querySelector?.('.card-media');
    if (media && !media.querySelector?.('.ad-glow')) media.insertAdjacentHTML?.('beforeend', adGlowHtml());
  });
}

// An ad is recognisable by its light, not only by its label: the whole edge of the screen glows in the
// same colours as the hint before it. The line draws itself from the top centre as soon as the ad starts
// to scroll in, the halo breathes, and a spark runs back and forth around the frame.
function adFrameHtml() {
  return '<div class="ad-frame" aria-hidden="true"><span class="frame-line"></span><span class="frame-soft"><b></b></span><span class="frame-comet"><b></b></span></div>';
}

// Like the edge light of the new Siri, but only along the bottom: the screen glows from below
// a moment before an ad, with a pill to skip it.
function adGlowHtml() {
  return `<div class="ad-glow" aria-hidden="true"><span class="glow-line"></span><span class="glow-soft"><b></b></span></div><button class="ad-next" data-action="ad-skip" aria-label="Дальше реклама — пропустить">${icon('megaphone')}<span>Дальше реклама</span><b>Пропустить ${icon('skip')}</b></button>`;
}

const adReported = new Set();
function reportAd(id, event) {
  const key = `${event}:${id}`;
  if (!online || !id || id === 'plus' || adReported.has(key) || typeof fetch !== 'function') return;
  adReported.add(key);
  fetch(`/api/ads/${encodeURIComponent(id)}/${event}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
}

function skipAd(from) {
  const feed = document.querySelector('#feed');
  const item = from?.closest?.('.feed-item');
  if (!feed || !item) return;
  const ad = item.classList.contains('is-ad') ? item : item.nextElementSibling;
  // The ad may be the last card loaded so far: grow the feed first, then jump past it.
  if (ad && !ad.nextElementSibling) extendFeedNear(ad);
  const next = ad?.classList?.contains('is-ad') ? ad.nextElementSibling : item.nextElementSibling;
  if (next) feed.scrollTo?.({ top: next.offsetTop, behavior: 'smooth' });
}

// The feed never ends: after the new posts a card says so, and then round after round of what is there,
// with what was just seen pushed back. Ads keep their rhythm across rounds.
function extendFeedNear(item) {
  const feed = document.querySelector('#feed');
  const items = feed?.querySelectorAll?.('.feed-item');
  if (!items?.length || !feedOrder || feedOrder.done) return;
  if (Array.prototype.indexOf.call(items, item) < items.length - 2) return;
  const { list } = feedPool();
  let added;
  if (!list.length) {
    added = [{ sep: 'final' }];
    feedOrder.done = true;
  } else {
    feedOrder.rounds += 1;
    // Everything already in the feed counts as seen now, even if it is still on screen or just ahead.
    const taste = currentTaste();
    const shown = { ...taste, seen: { ...taste.seen } };
    const now = Date.now();
    feedOrder.entries.forEach(entry => { if (entry.id && !shown.seen[entry.id]) shown.seen[entry.id] = { n: 1, last: now, done: 0 }; });
    added = rankFeed(list, { ...rankOptions(feedSeed + feedOrder.rounds), taste: shown, mode: feedMode === 'discover' ? 'discover' : 'foryou' }).map(entry => ({ id: entry.project.id, reason: feedMode === 'discover' ? entry.reason : 'again' }));
    const lastId = [...feedOrder.entries].reverse().find(entry => entry.id)?.id;
    if (added.length > 1 && added[0].id === lastId) [added[0], added[1]] = [added[1], added[0]];
    if (feedOrder.rounds === 2) added.unshift({ sep: 'end' });
    added = placeAds(added, feedAds(), feedOrder.adState ||= { since: 0, next: 0 });
  }
  feedOrder.entries.push(...added);
  feed.insertAdjacentHTML?.('beforeend', added.map(feedEntryHtml).join(''));
  markNextAds(feed);
  observeFeedItems(feed);
}

function feedEndHtml(kind) {
  if (kind === 'following-empty') return `<section class="feed-item feed-end"><div class="end-card"><span class="end-icon muted">${icon('users')}</span><h2>В подписках пока пусто</h2><p>Подпишись на авторов или нажми «Следить» на проекте — их новинки и обновления будут здесь. Ниже — рекомендации.</p><div class="end-actions"><a class="btn btn-ghost" href="#/search">Найти авторов</a><button class="btn btn-primary" data-action="feed-mode" data-mode="foryou">Для тебя</button></div><span class="end-hint">${icon('chevronDown')}</span></div></section>`;
  if (kind === 'following-end') return `<section class="feed-item feed-end"><div class="end-card"><span class="end-icon">${icon('check')}</span><h2>Ты всё посмотрел в подписках</h2><p>Дальше — рекомендации для тебя</p><div class="end-actions"><button class="btn btn-ghost" data-action="feed-mode" data-mode="discover">${icon('search')} Открытия</button></div><span class="end-hint">${icon('chevronDown')}</span></div></section>`;
  if (kind === 'empty') return `<section class="feed-item feed-end"><div class="end-card"><span class="end-icon muted">${icon(categoryIcons[feedCategory] || 'search')}</span><h2>Здесь пока пусто</h2><p>Ниже — проекты из других разделов</p><div class="end-actions"><a class="btn btn-ghost" href="#/feed">Вся лента</a><button class="btn btn-primary" data-action="publish">${icon('plus')} Опубликовать</button></div><span class="end-hint">${icon('chevronDown')}</span></div></section>`;
  const final = kind === 'final';
  return `<section class="feed-item feed-end"><div class="end-card"><span class="end-icon">${icon('check')}</span><h2>${final ? 'На сегодня всё' : 'Новое закончилось'}</h2><p>${final ? 'Загляни позже или покажи свой проект' : 'Дальше — лучшее из того, что ты видел'}</p><div class="end-actions"><button class="btn btn-primary" data-action="feed-refresh">${icon('refresh')} Обновить</button><button class="btn btn-ghost" data-action="publish">${icon('plus')} Свой проект</button></div>${final ? '' : `<span class="end-hint">${icon('chevronDown')}</span>`}</div></section>`;
}

function feedEntryHtml(entry) {
  if (entry.sep) return feedEndHtml(entry.sep);
  if (entry.ad === 'plus') return plusFeedItem();
  const project = projectById(entry.id);
  return project && visibleInFeed(project) ? feedItem(project, entry.reason, entry.ad) : '';
}

function renderFeed() {
  if (!feedOrder || feedOrder.key !== feedKey()) buildFeedOrder();
  const items = feedOrder.entries.map(feedEntryHtml).join('') || `<section class="feed-item">${emptyState('search', 'Здесь пока пусто', `<button class="btn btn-primary" data-action="publish">${icon('plus')} Опубликовать первым</button>`)}</section>`;
  const chip = feedCategory === 'all' ? '' : `<a class="filter-chip" href="#/feed" aria-label="Сбросить фильтр «${categoryNames[feedCategory]}»">${icon(categoryIcons[feedCategory])}${categoryNames[feedCategory]}${icon('close')}</a>`;
  return `<h1 class="sr-only">Лента проектов</h1><div class="ptr" aria-hidden="true"><span><i class="ptr-mark">${logoMark}</i>${icon('refresh')}</span></div><div class="feed" id="feed">${items}</div>${chip}<div class="feed-nav"><button data-action="feed-step" data-direction="-1" aria-label="Предыдущий проект">${icon('chevronUp')}</button><button data-action="feed-refresh" aria-label="Обновить ленту">${icon('refresh')}</button><button data-action="feed-step" data-direction="1" aria-label="Следующий проект">${icon('chevronDown')}</button></div>`;
}

function feedItem(project, reason = '', ad = '') {
  const id = escapeHtml(project.id);
  const skip = ad ? `<button class="ad-skip" data-action="ad-skip">Пропустить ${icon('skip')}</button>` : '';
  return `<section class="feed-item${ad ? ' is-ad' : ''}" data-project="${id}"${ad ? ` data-ad="${escapeHtml(ad)}"` : ''} aria-label="${ad ? 'Реклама: ' : ''}${escapeHtml(project.title)}"><article class="card">${skip}<div class="card-media" data-action="media" data-id="${id}" data-reason="${escapeHtml(reason)}">${mediaInner(project, reason)}</div><div class="rail" data-rail="${id}">${railInner(project)}</div></article></section>`;
}

function reasonChip(reason) {
  if (String(reason).startsWith('repost:')) return `<span class="reason-chip repost">${icon('repost')}Репост @${escapeHtml(reason.slice(7))}</span>`;
  const label = reasonLabels[reason];
  return label ? `<span class="reason-chip ${reason}">${icon(label[0])}${label[1]}</span>` : '';
}

/* Attention: how long each post holds the screen, and what people do with it */

function saveTaste() {
  clearTimeout(tasteSaveTimer);
  tasteSaveTimer = setTimeout(() => {
    try { storage.setItem(TASTE_KEY, JSON.stringify({ taste: localTaste, stats: localStats })); } catch {}
  }, 400);
}

function queueFeedEvent(event) {
  feedEvents.push(event);
  clearTimeout(feedFlushTimer);
  if (feedEvents.length >= 30) flushFeedEvents();
  else feedFlushTimer = setTimeout(flushFeedEvents, 5000);
}

function flushFeedEvents(keepalive = false) {
  clearTimeout(feedFlushTimer);
  if (!online || !feedEvents.length || typeof fetch !== 'function') return Promise.resolve();
  const events = feedEvents.splice(0, 40);
  return fetch('/api/feed/events', { method: 'POST', credentials: 'same-origin', keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) }).catch(() => {});
}

function trackSignal(project, type, extra = {}) {
  if (!project) return;
  const signal = { type, ...extra };
  recordSignal(currentTaste(), project, signal);
  const counted = statSignals.includes(type) && !isMine(project.handle) && project.id;
  if (online) {
    if (counted && project.stats) recordStat(project.stats, signal);
    if (project.id) queueFeedEvent({ id: project.id, type, dwell: Math.round(extra.dwell || 0), expected: Math.round(extra.expected || 0) });
  } else if (counted) localStats[project.id] = recordStat(localStats[project.id] || emptyStats(), signal);
  if (!online || !me) saveTaste();
}

function beginView(item) {
  const id = item?.dataset?.project;
  if (!id || activeView?.item === item) return;
  endView();
  activeView = { item, id, start: Date.now(), slides: 0, rewatches: 0 };
}

function endView() {
  const view = activeView;
  activeView = null;
  const project = view && projectById(view.id);
  if (!project) return;
  const video = view.item.querySelector?.('video[data-feed-video]');
  trackSignal(project, 'view', { dwell: Date.now() - view.start, expected: expectedDwell(project, Number(video?.duration) || 0) });
}

/* Pull to refresh: drag down at the top on a phone, scroll up past the top with a wheel or trackpad */

function setPull(distance) {
  document.body.style?.setProperty?.('--pull', `${Math.round(distance)}px`);
  document.body.style?.setProperty?.('--pull-turn', `${Math.round(distance * 3)}deg`);
  document.body.style?.setProperty?.('--pull-o', String(Math.min(1, distance / 50)));
  document.body.classList?.toggle('pulling', distance > 0 && !feedRefreshing);
  const ready = distance >= 70;
  if (ready && !document.body.classList?.contains?.('ptr-ready') && !feedRefreshing) haptic('tap');
  document.body.classList?.toggle('ptr-ready', ready);
}

async function refreshFeed() {
  if (feedRefreshing) return;
  feedRefreshing = true;
  setPull(64);
  document.body.classList?.add('ptr-loading');
  endView();
  const started = Date.now();
  if (online) await reloadAll({ rerender: false });
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 700 - (Date.now() - started))));
  const taste = currentTaste();
  const unseen = filterProjects(projects(), { category: feedCategory }).filter(project => !taste.seen[project.id]).length;
  feedSeed = Math.floor(Math.random() * 1e6);
  feedOrder = null;
  pinnedProjectId = '';
  feedScrollTop = 0;
  feedRefreshing = false;
  document.body.classList?.remove('ptr-loading');
  setPull(0);
  if (document.body.dataset.view === 'feed') render();
  haptic('success');
  toast(unseen ? `Лента обновлена · новых: ${unseen}` : 'Лента обновлена');
}

function onFeedWheel(event) {
  const feed = event.currentTarget;
  const now = Date.now();
  if (now < feedWheelMuteUntil) { wheelPull.last = now; wheelPull.armed = false; return; }
  if (now - wheelPull.last > 300) wheelPull.armed = feed.scrollTop <= 0;
  wheelPull.last = now;
  if (!wheelPull.armed || feedRefreshing || event.deltaY >= 0 || feed.scrollTop > 0) {
    if (wheelPull.amount) { wheelPull.amount = 0; setPull(0); }
    return;
  }
  wheelPull.amount += -event.deltaY;
  setPull(Math.min(110, wheelPull.amount * 0.35));
  clearTimeout(wheelPull.timer);
  wheelPull.timer = setTimeout(() => {
    const ready = wheelPull.amount * 0.35 >= 70;
    wheelPull.amount = 0;
    if (ready) refreshFeed(); else setPull(0);
  }, 260);
}

function mediaInner(project, reason = '') {
  const count = slideKinds(project).length;
  const slide = Math.min(slides.get(project.id) || 0, count - 1);
  const id = escapeHtml(project.id);
  const controls = count > 1
    ? `<button class="slide-arrow prev" data-action="slide" data-direction="-1" data-id="${id}" aria-label="Предыдущий слайд">${icon('chevronLeft')}</button><button class="slide-arrow next" data-action="slide" data-direction="1" data-id="${id}" aria-label="Следующий слайд">${icon('chevronRight')}</button>`
    : '';
  const from = slideFrom.has(project.id) ? slideFrom.get(project.id) : -1;
  const dots = count > 1 ? `<div class="slide-dots" role="img" aria-label="Слайд ${slide + 1} из ${count}">${Array.from({ length: count }, (_, index) => `<i class="${index === slide ? 'on' : index === from ? 'was' : ''}"></i>`).join('')}</div>` : '';
  const author = userByHandle(project.handle);
  return `${scene(project, slide)}<div class="card-shade"></div>${controls}<div class="card-info">${dots}${reasonChip(reason)}${steamBadgeHtml(project)}${playtestChipHtml(project)}<button class="card-author" data-action="profile" data-handle="${escapeHtml(project.handle)}">${avatar(author || project, 'xs')}<b>${isMine(project.handle) ? 'Вы' : escapeHtml(project.author || `@${project.handle}`)}</b>${plusBadge(author)}<span>· ${escapeHtml(categoryNames[project.category])}</span></button><button class="card-title" data-action="open-project" data-id="${id}">${escapeHtml(project.title)}</button><p class="card-summary">${escapeHtml(project.summary)}</p>${cardUpdateHtml(project)}${cardCtaHtml(project)}${tagline(project)}</div>`;
}

// The post's own call to action, right on the card: «Играть» for a demo that runs in the browser,
// then the author's first button block or first store link. Before, the button lived only on the post page.
function postButton(project) {
  const block = (project.page || []).find(item => item.type === 'button' && linkKind(item.url));
  if (block) {
    const link = linkKind(block.url);
    return { url: link.url, icon: link.icon, label: block.label || linkCta[link.kind] || link.label };
  }
  const first = (project.links?.length ? project.links : [project.url]).map(linkKind).find(Boolean);
  const wish = first?.kind === 'steam' && project.steam?.status === 'coming';
  return first ? { url: first.url, icon: first.icon, label: wish ? 'В желаемое Steam' : linkCta[first.kind] || 'Открыть сайт' } : null;
}

function cardCtaHtml(project) {
  const rating = demoRatingText(project);
  const play = project.demo ? `<button class="card-cta play" data-action="play-demo" data-id="${escapeHtml(project.id)}">${icon('play')}<span>Играть${rating ? ` · ★${rating}` : ''}</span></button>` : '';
  const button = postButton(project);
  const link = button ? `<a class="card-cta" href="${escapeHtml(button.url)}" target="_blank" rel="noopener noreferrer nofollow ugc" data-action="post-link" data-id="${escapeHtml(project.id)}">${icon(button.icon)}<span>${escapeHtml(button.label)}</span>${icon('external')}</a>` : '';
  return play || link ? `<div class="card-ctas">${play}${link}</div>` : '';
}

// Tags shown on cards and pages: no automatic placeholder and no repeat of the stage badge.
function visibleTags(project) {
  const stage = labelOf(postStages, project.stage).toLocaleLowerCase('ru');
  return (project.tags || []).filter(tag => tag !== 'Новый проект' && tag.toLocaleLowerCase('ru') !== stage);
}

// Feed design code "Cinema": facts and tags are one quiet line of text, not coloured pills.
function tagline(project) {
  const stage = labelOf(postStages, project.stage);
  const parts = [project.ai ? 'Сделано с ИИ' : '', ...visibleTags(project)].filter(Boolean).slice(0, stage ? 3 : 4).map(escapeHtml);
  if (stage) parts.unshift(`<span class="stage">${escapeHtml(stage)}</span>`);
  return parts.length ? `<p class="card-tagline">${parts.join(' · ')}</p>` : '';
}


function railButton(action, id, iconName, count, on, label, pop) {
  const pressed = action === 'vote' || action === 'save' ? `aria-pressed="${on}"` : '';
  return `<button class="rail-btn ${on ? 'on' : ''} ${pop ? 'pop' : ''}" data-action="${action}" data-id="${id}" ${pressed} aria-label="${label}"><span class="rail-icon">${icon(iconName)}</span>${count === '' ? '' : `<b>${count}</b>`}</button>`;
}

function railInner(project, pop = '') {
  const id = escapeHtml(project.id);
  const handle = escapeHtml(project.handle);
  const voted = state.votes.includes(project.id);
  const saved = state.saved.includes(project.id);
  const followed = state.follows.includes(project.handle);
  const follow = isMine(project.handle) ? '' : `<button class="rail-follow ${followed ? 'on' : ''}" data-action="follow" data-handle="${handle}" aria-pressed="${followed}" aria-label="${followed ? 'Отписаться' : 'Подписаться'}">${icon(followed ? 'check' : 'plus')}</button>`;
  return `<div class="rail-author"><button class="rail-avatar" data-action="profile" data-handle="${handle}" aria-label="Автор: ${escapeHtml(project.author)}">${ringAvatar(project, '', userByHandle(project.handle), true)}</button>${follow}</div>${railButton('vote', id, 'up', voteCount(project), voted, 'Поддержать', pop === 'vote')}${railButton('comments', id, 'comment', commentCount(project), false, 'Комментарии')}${railButton('save', id, 'bookmark', '', saved, saved ? 'Убрать из сохранённого' : 'Сохранить', pop === 'save')}${railButton('share', id, 'share', '', false, 'Поделиться')}${railButton('post-menu', id, 'more', '', false, 'Ещё')}`;
}

function syncRails(pop = {}) {
  document.querySelectorAll('[data-rail]').forEach(element => {
    const project = projectById(element.dataset?.rail);
    if (project) element.innerHTML = railInner(project, pop.id === project.id ? pop.action : '');
  });
}

function refresh(pop = {}) {
  if (document.body.dataset.view === 'feed') syncRails(pop);
  else render();
}

function changeSlide(id, direction) {
  const project = projectById(id);
  if (!project) return;
  const count = slideKinds(project).length;
  const current = slides.get(id) || 0;
  if (count < 2) return;
  const next = (current + direction + count) % count; // after the last photo comes the first again
  if (next === current) return;
  slides.set(id, next);
  slideFrom.set(id, current);
  if (activeView?.id === id && activeView.slides < 3) {
    activeView.slides += 1;
    trackSignal(project, 'slide');
  }
  const list = document.querySelectorAll?.(`.card-media[data-id="${id}"]`) || [];
  if (!list.length || !list[0]?.classList) { render(); return; }
  list.forEach(media => {
    media.innerHTML = mediaInner(project, media.dataset.reason || '');
    syncFeedVideo(media.closest?.('.feed-item'));
    media.classList.remove('from-left', 'from-right');
    void media.offsetWidth;
    media.classList.add(direction > 0 ? 'from-right' : 'from-left');
  });
  slideFrom.delete(id);
  markNextAds();
}

function stepFeed(direction) {
  const feed = document.querySelector('#feed');
  if (!feed?.scrollTo) return;
  const height = feed.clientHeight || 1;
  feed.scrollTo({ top: (Math.round(feed.scrollTop / height) + direction) * height, behavior: 'smooth' });
}

function currentFeedId() {
  const feed = document.querySelector('#feed');
  const items = feed?.querySelectorAll?.('.feed-item');
  if (!items?.length) return '';
  return items[Math.round(feed.scrollTop / (feed.clientHeight || 1))]?.dataset.project || '';
}

function burst(media, event) {
  if (!media?.getBoundingClientRect) return;
  const rect = media.getBoundingClientRect();
  const mark = document.createElement('span');
  mark.className = 'burst';
  mark.innerHTML = icon('up');
  mark.style.left = `${(event.clientX || rect.left + rect.width / 2) - rect.left}px`;
  mark.style.top = `${(event.clientY || rect.top + rect.height / 2) - rect.top}px`;
  media.appendChild(mark);
  setTimeout(() => mark.remove(), 800);
}

async function toggleProjectFlag(action, id, { onlyOn = false } = {}) {
  if (needLogin('Чтобы поддерживать и сохранять проекты, войди в аккаунт')) return;
  const key = action === 'vote' ? 'votes' : 'saved';
  if (onlyOn && state[key].includes(id)) return;
  state[key] = toggleMembership(state[key], id);
  persist();
  const on = state[key].includes(id);
  if (on) haptic('tap');
  trackSignal(projectById(id), on ? action : action === 'vote' ? 'unvote' : 'unsave');
  refresh({ action, id });
  if (action === 'save' && state.saved.includes(id)) toast('Сохранено в профиле');
  if (!online) return;
  try {
    const result = await apiCall('POST', `/api/projects/${encodeURIComponent(id)}/${action === 'vote' ? 'vote' : 'save'}`);
    const on = action === 'vote' ? result.voted : result.saved;
    if (state[key].includes(id) !== on) { state[key] = toggleMembership(state[key], id); refresh(); }
  } catch (error) {
    state[key] = toggleMembership(state[key], id);
    refresh();
    toast(error.message);
  }
}

async function toggleFollow(handle, target) {
  if (needLogin('Чтобы подписываться на авторов, войди в аккаунт')) return;
  state.follows = toggleMembership(state.follows, handle);
  persist();
  trackSignal(projects().find(project => project.handle === handle) || { handle }, state.follows.includes(handle) ? 'follow' : 'unfollow');
  if (target?.closest?.('dialog') && target.classList?.contains('follow-pill')) target.outerHTML = followPill(handle, 'small');
  refresh();
  if (!online) return;
  try {
    const result = await apiCall('POST', `/api/users/${encodeURIComponent(handle)}/follow`);
    updateUser(result.user);
    if (state.follows.includes(handle) !== result.following) state.follows = toggleMembership(state.follows, handle);
    refresh();
  } catch (error) {
    state.follows = toggleMembership(state.follows, handle);
    refresh();
    toast(error.message);
  }
}

/* Search */

function thumbsHtml(list) {
  return `<div class="thumb-grid">${list.map(project => `<button class="thumb" data-action="open-project" data-id="${escapeHtml(project.id)}" aria-label="${escapeHtml(project.title)}">${scene(project, 0, 'still')}<span class="thumb-title">${escapeHtml(project.title)}</span><span class="thumb-meta">${icon('up')}${voteCount(project)}</span></button>`).join('')}</div>`;
}

function searchResults() {
  const query = search.trim();
  if (!query) {
    const list = filterProjects(projects().filter(visibleInFeed), { search });
    return list.length ? thumbsHtml(list) : emptyState('search', 'Ничего не нашли');
  }
  const found = searchProjects(projects().filter(visibleInFeed), query);
  if (!found.length) return emptyState('search', 'Ничего не нашли', '', 'Ищем по названиям, тегам, авторам, описаниям, страницам и обновлениям');
  return `<div class="search-hits">${found.slice(0, 40).map(({ project, snippet }) => `<button class="search-hit" data-action="open-project" data-id="${escapeHtml(project.id)}"><span class="search-thumb">${scene(project, 0, 'still')}</span><span class="search-text"><b>${escapeHtml(project.title)}</b><small>@${escapeHtml(project.handle)} · ${escapeHtml(categoryNames[project.category] || '')}</small><em>${snippet || escapeHtml(project.summary)}</em></span></button>`).join('')}</div>`;
}

function followPill(handle, className = '', short = false) {
  const followed = state.follows.includes(handle);
  return `<button class="follow-pill ${followed ? 'on' : ''} ${className}" data-action="follow" data-handle="${escapeHtml(handle)}" aria-pressed="${followed}">${followed ? `${icon('check')} ${short ? 'В подписках' : 'Вы подписаны'}` : 'Подписаться'}</button>`;
}

function authorsList() {
  if (online) {
    const query = search.trim().toLocaleLowerCase('ru');
    return remote.users.filter(user => !user.official && !isMine(user.handle) && (!query || `${user.name} ${user.handle}`.toLocaleLowerCase('ru').includes(query)))
      .sort((left, right) => (right.followers - left.followers) || (right.ratingAverage - left.ratingAverage) || (right.projects - left.projects)).slice(0, 30)
      .map(user => ({ handle: user.handle, author: user.name, initials: user.initials, color: user.color, person: user }));
  }
  return [...new Map(demoProjects.map(project => [project.handle, project])).values()];
}

function renderSearch() {
  const all = projects();
  const tiles = Object.entries(categoryNames).map(([id, label]) => `<a class="cat-tile cat-${id}" href="#/feed/${id}">${icon(categoryIcons[id])}<span>${label}<small>${all.filter(project => project.category === id).length}</small></span></a>`).join('');
  return `<div class="page"><h1 class="sr-only">Обзор</h1><label class="search-box">${icon('search')}<input type="search" name="search" placeholder="Игры, приложения, авторы" aria-label="Поиск" value="${escapeHtml(search)}" autocomplete="off"></label><div class="cat-tiles">${tiles}</div>${playtestsRowHtml()}<h2 class="row-title">Авторы</h2><div class="creators" id="search-authors">${creatorsHtml()}</div><h2 class="row-title">Проекты</h2><div id="search-results">${searchResults()}</div></div>`;
}

function playtestsRowHtml() {
  if (!online) return '';
  const open = projects().filter(project => project.playtest?.open && !isMine(project.handle) && visibleInFeed(project));
  if (!open.length) return '';
  return `<button class="playtests-row" data-action="playtests"><span class="row-mark">${icon('users')}</span><span><b>Тест-задания · ${open.length}</b><small>Проверь игру по шагам и получи искры</small></span><em class="pt-reward">${icon('sparkle')}+${sparkRules.accepted.amount}</em></button>`;
}

function creatorsHtml() {
  const authors = authorsList();
  if (!authors.length) return `<p class="muted-line">Авторов не нашли</p>`;
  return authors.map(project => `<div class="creator"><button class="creator-link" data-action="profile" data-handle="${escapeHtml(project.handle)}">${ringAvatar(project, 'lg', userByHandle(project.handle), true)}<b>${escapeHtml(project.author)}${plusBadge(userByHandle(project.handle))}</b><small class="creator-sub">@${escapeHtml(project.handle)}</small></button>${followPill(project.handle, 'small', true)}</div>`).join('');
}

/* Inbox */

function renderInbox(id) {
  if (online && !me) return `<div class="page narrow">${loginCard('Войди, чтобы переписываться с авторами и получать ответы издателя')}</div>`;
  if (id) {
    const thread = threadById(id);
    if (!thread) return `<div class="page">${emptyState('inbox', 'Чат не найден', '<a class="btn btn-ghost" href="#/inbox">Все чаты</a>')}</div>`;
    const log = thread.all.map(message => bubbleHtml(message, thread)).join('');
    const profile = thread.handle && !thread.official ? `<button class="text-link" data-action="profile" data-handle="${escapeHtml(thread.handle)}">Профиль</button>` : '';
    const composer = thread.official ? '<p class="chat-hint">Это служебный чат: сюда приходят ответы про заявки</p>'
      : thread.blocked ? `<p class="chat-hint">Ты заблокировал этого человека. <button class="text-link inline" data-action="block" data-handle="${escapeHtml(thread.handle)}">Разблокировать</button></p>`
      : thread.blockedMe ? '<p class="chat-hint">Этот человек ограничил сообщения</p>' : chatComposerHtml(thread);
    return `<div class="page chat-page"><h1 class="sr-only">Чат: ${escapeHtml(thread.name)}</h1><div class="chat-head">${avatar({ ...thread, look: userByHandle(thread.handle)?.look }, 'xl')}<b>${escapeHtml(thread.name)}${plusBadge(userByHandle(thread.handle))}</b>${profile}</div><div class="chat-log">${log || '<p class="chat-hint">Напиши первое сообщение 👋</p>'}</div>${composer}</div>`;
  }
  const list = threads();
  const rows = list.map(thread => {
    const last = thread.all[thread.all.length - 1];
    const unread = threadUnread(thread);
    return `<a class="thread-row ${unread ? 'unread' : ''}" href="#/inbox/${encodeURIComponent(thread.id)}">${avatar(thread, 'lg')}<span class="thread-text"><b>${escapeHtml(thread.name)}${thread.official ? ` <span class="verified">${icon('check')}</span>` : ''}</b><small>${last ? `${last.from === 'me' ? 'Вы: ' : ''}${escapeHtml(last.text)}` : 'Нет сообщений'}</small></span><span class="thread-meta"><small>${escapeHtml(last?.time || '')}</small>${unread ? '<i class="dot-badge" aria-label="Новое"></i>' : ''}</span></a>`;
  }).join('');
  const unreadNotices = activityUnread();
  const noticeRow = online && me ? `<a class="thread-row activity-row ${unreadNotices ? 'unread' : ''}" href="#/activity"><span class="activity-mark">${icon('bell')}</span><span class="thread-text"><b>Уведомления</b><small>Подписчики, ответы, поддержка и обновления</small></span><span class="thread-meta">${unreadNotices ? `<i class="count-badge">${unreadNotices > 99 ? '99+' : unreadNotices}</i>` : icon('chevronRight')}</span></a>` : '';
  return `<div class="page narrow"><h1 class="sr-only">Входящие</h1><div class="thread-list">${noticeRow}${rows || emptyState('inbox', 'Пока нет переписок', '<a class="btn btn-ghost" href="#/search">Найти авторов</a>', 'Напиши автору из его профиля')}</div></div>`;
}

/* Chat: bubbles with pictures, stickers and reactions; a composer with emoji, stickers, screenshots and voice */

const onlyEmoji = text => /^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]{1,16}$/u.test(text || '') && /\p{Extended_Pictographic}/u.test(text) && [...(text || '').matchAll(/\p{Extended_Pictographic}/gu)].length <= 3;

function stickerHtml(sticker) {
  return `<span class="sticker" style="--s1:${sticker.colors[0]};--s2:${sticker.colors[1]}"><span class="sticker-emoji">${sticker.emoji}</span><b>${escapeHtml(sticker.label)}</b></span>`;
}

function bubbleHtml(message, thread) {
  const mine = message.from === 'me';
  const sticker = stickerById(message.sticker);
  const image = uploadUrl(message.image);
  const counts = Object.entries(message.reactions?.counts || {});
  const shared = message.project ? projectById(message.project) : null;
  const kind = sticker ? 'is-sticker' : message.project && !message.text ? 'is-post' : image && !message.text ? 'is-image' : onlyEmoji(message.text) ? 'is-emoji' : '';
  const post = message.project ? (shared ? `<button class="bubble-post" data-action="open-project" data-id="${escapeHtml(shared.id)}"><span class="bubble-post-art">${scene(shared, 0, 'still')}</span><span><b>${escapeHtml(shared.title)}</b><small>@${escapeHtml(shared.handle)} · ${escapeHtml(shared.summary)}</small></span></button>` : '<span class="bubble-text muted">Пост удалён</span>') : '';
  const body = sticker ? stickerHtml(sticker) : `${post}${image ? `<button class="bubble-image" data-action="view-chat-image" data-src="${image}" aria-label="Открыть картинку"><img src="${image}" alt="Скриншот" loading="lazy"></button>` : ''}${message.text ? `<span class="bubble-text">${escapeHtml(message.text)}</span>` : ''}`;
  const reactions = counts.length ? `<div class="reactions">${counts.map(([emoji, count]) => `<button class="reaction ${message.reactions.mine === emoji ? 'on' : ''}" data-action="react" data-id="${escapeHtml(message.id)}" data-emoji="${emoji}" aria-label="Реакция ${emoji}">${emoji}${count > 1 ? `<b>${count}</b>` : ''}</button>`).join('')}</div>` : '';
  const reactable = online && message.id && !thread.official;
  return `<div class="msg-row ${mine ? 'me' : 'them'}" ${reactable ? `data-msg="${escapeHtml(message.id)}"` : ''}><div class="bubble ${mine ? 'me' : 'them'} ${kind}">${body}${message.time ? `<small>${escapeHtml(message.time)}</small>` : ''}</div>${reactions}</div>`;
}

function chatComposerHtml(thread) {
  const emoji = chatEmoji.map(item => `<button type="button" data-action="insert-emoji" data-emoji="${item}">${item}</button>`).join('');
  const stickers = chatStickers.map(sticker => `<button type="button" data-action="send-sticker" data-id="${sticker.id}" aria-label="Стикер ${escapeHtml(sticker.label)}">${stickerHtml(sticker)}</button>`).join('');
  const panel = `<div class="chat-panel" data-tab="emoji" hidden><div class="panel-tabs"><button type="button" class="on" data-action="chat-tab" data-tab="emoji">Эмодзи</button><button type="button" data-action="chat-tab" data-tab="stickers">Стикеры</button></div><div class="emoji-grid">${emoji}</div><div class="sticker-grid">${stickers}</div></div>`;
  const picture = online ? `<label class="cbtn" aria-label="Отправить скриншот" title="Скриншот или фото">${icon('image')}<input class="file-cover" type="file" accept="image/*" data-chat-image="${escapeHtml(thread.id)}"></label>` : '';
  return `<div class="chat-composer">${panel}<form id="dm-form" class="composer chat-form" data-id="${escapeHtml(thread.id)}"><button type="button" class="cbtn" data-action="chat-panel" aria-label="Эмодзи и стикеры">${icon('smile')}</button><input name="text" placeholder="Сообщение…" aria-label="Сообщение" maxlength="2000" autocomplete="off">${picture}${voiceButton()}<button type="submit" aria-label="Отправить">${icon('send')}</button></form></div>`;
}

async function sendChat(threadId, payload) {
  if (online) {
    remote.threads = (await apiCall('POST', `/api/messages/${encodeURIComponent(threadId)}`, payload)).threads;
    maybeAskPush('Сообщать о новых сообщениях?');
  } else {
    state.dms[threadId] ||= [];
    state.dms[threadId].push({ text: payload.text || '', sticker: payload.sticker || '', time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) });
    persist();
  }
  render();
  scrollChatEnd();
}

// Keep the chat pinned to the newest message, also once pictures finish loading,
// unless the person has scrolled away in the meantime.
function scrollChatEnd() {
  let pinned = 0;
  const end = () => { window.scrollTo?.(0, document.body.scrollHeight || 0); pinned = window.scrollY || 0; };
  end();
  document.querySelectorAll?.('.chat-log img').forEach(img => {
    if (!img.complete) img.addEventListener?.('load', () => { if (Math.abs((window.scrollY || 0) - pinned) < 4) end(); }, { once: true });
  });
}

async function reactTo(threadId, messageId, emoji) {
  if (!online || !messageId) return;
  const y = window.scrollY || 0;
  try {
    remote.threads = (await apiCall('POST', `/api/messages/${encodeURIComponent(threadId)}/react`, { id: messageId, emoji })).threads;
    render();
    window.scrollTo?.(0, y);
  } catch (error) { toast(error.message); }
}

function closeReactBar() {
  document.querySelectorAll?.('.react-bar').forEach(bar => bar.remove?.());
}

function openReactBar(row) {
  closeReactBar();
  if (!row?.dataset?.msg) return;
  const bar = document.createElement('div');
  bar.className = 'react-bar';
  bar.innerHTML = chatReactions.map(emoji => `<button data-action="react" data-id="${escapeHtml(row.dataset.msg)}" data-emoji="${emoji}" aria-label="Реакция ${emoji}">${emoji}</button>`).join('');
  row.appendChild(bar);
  haptic('heavy');
}

/* Voice input: the browser's speech recognition types what you say into the field */

const SpeechRecognitionApi = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
let dictation = null;

function voiceButton() {
  return SpeechRecognitionApi ? `<button type="button" class="cbtn mic" data-action="dictate" aria-label="Голосовой ввод" title="Голосовой ввод">${icon('mic')}</button>` : '';
}

function toggleDictation(button) {
  if (dictation) { dictation.stop(); return; }
  const field = button.closest('form')?.querySelector('input[name="text"], textarea');
  if (!field || !SpeechRecognitionApi) return;
  const recognition = new SpeechRecognitionApi();
  recognition.lang = 'ru-RU';
  recognition.interimResults = true;
  recognition.continuous = false;
  const base = field.value ? `${field.value.replace(/\s+$/, '')} ` : '';
  recognition.onresult = event => {
    field.value = base + Array.from(event.results).map(result => result[0].transcript).join('');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    if (field.tagName === 'TEXTAREA') autosize(field);
  };
  recognition.onerror = event => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') toast('Разреши доступ к микрофону в настройках браузера');
    else if (!['aborted', 'no-speech'].includes(event.error)) toast('Голосовой ввод сейчас недоступен');
  };
  recognition.onend = () => {
    dictation = null;
    document.querySelectorAll?.('.mic.on').forEach(item => item.classList.remove('on'));
    field.focus?.();
  };
  dictation = recognition;
  button.classList.add('on');
  try { recognition.start(); } catch { dictation = null; button.classList.remove('on'); }
}

/* Auth */

// Sign-in: Google / Yandex / GitHub buttons when the server has them, then nick and password.
// With mail set up, sign-up asks for an e-mail and confirms it with a 6-digit code, and there is
// a password-free way in: a code to the e-mail.
let authFlow = null; // { purpose, email, fields, sentAt } while a code is on its way
let authResendTimer = 0;

const providerIcons = {
  google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>',
  yandex: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#FC3F1D"/><path fill="#fff" d="M13.3 6.5h-1c-1.9 0-2.8.95-2.8 2.35 0 1.6.68 2.33 2.08 3.28l1.15.78-3.32 4.97H7.5l2.98-4.44C8.76 12.2 7.8 11 7.8 9c0-2.53 1.76-4.26 5.11-4.26h3.31V18.1H13.3V6.5z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.97.9-3.76 2.28-1.61 2.79-.41 6.91 1.15 9.17.77 1.1 1.68 2.34 2.87 2.3 1.15-.05 1.59-.74 2.98-.74 1.39 0 1.78.74 3 .72 1.24-.02 2.03-1.12 2.78-2.23.88-1.28 1.24-2.52 1.26-2.59-.03-.01-2.42-.93-2.44-3.69zM14.1 5.98c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z"/></svg>',
  github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>'
};

const emailSignIn = () => online && Boolean(remote?.config?.email);

function authProvidersHtml(verb = 'Войти') {
  const list = online ? remote?.config?.providers || [] : [];
  if (!list.length) return '';
  // Google and Apple get a full row; with more providers the rest sit two in a row with short labels.
  const many = list.length > 2;
  return `<div class="auth-social ${many ? 'many' : ''}">${list.map((provider, index) => `<a class="social-btn ${escapeHtml(provider.id)} ${many && index >= 2 ? 'half' : ''}" href="/api/auth/oauth/${encodeURIComponent(provider.id)}/start" aria-label="${verb} через ${escapeHtml(provider.label)}">${providerIcons[provider.id] || icon('user')}<span>${many && index >= 2 ? escapeHtml(provider.label) : `${verb} через ${escapeHtml(provider.label)}`}</span></a>`).join('')}</div><div class="auth-or"><span>или</span></div>`;
}

function authCodeHtml() {
  const wait = Math.max(0, Math.ceil((authFlow.sentAt + 45000 - Date.now()) / 1000));
  const title = authFlow.purpose === 'register' ? 'Подтверди почту' : authFlow.purpose === 'link' ? 'Привяжи почту' : 'Код для входа';
  return `<form id="auth-code-form" class="form auth-code"><span class="auth-mail">${icon('send')}</span><h3>${title}</h3><p class="fine">Отправили 6 цифр на <b>${escapeHtml(authFlow.email)}</b>. Письмо может попасть в «Спам».</p><input name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" aria-label="Код из письма" required><p class="form-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">Подтвердить</button><div class="auth-code-links"><button type="button" class="link-btn auth-resend" data-action="auth-resend" ${wait ? 'disabled' : ''}>${wait ? `Новый код через ${wait} с` : 'Отправить код ещё раз'}</button><button type="button" class="link-btn" data-action="auth-back">Изменить почту</button></div></form>`;
}

function authFormHtml(mode) {
  if (authFlow && authFlow.purpose !== 'link') return authCodeHtml();
  const register = mode === 'register';
  const withEmail = emailSignIn();
  const tabs = `<div class="auth-tabs" role="tablist"><button class="${register ? 'on' : ''}" data-action="auth-mode" data-id="register" role="tab" aria-selected="${register}">Регистрация</button><button class="${register ? '' : 'on'}" data-action="auth-mode" data-id="login" role="tab" aria-selected="${!register}">Вход</button></div>`;
  if (mode === 'code') {
    return `${authProvidersHtml()}${tabs}<form id="auth-form" class="form" data-mode="code"><input name="email" type="email" maxlength="254" placeholder="Почта" aria-label="Почта" autocomplete="email" autocapitalize="none" spellcheck="false" required><p class="form-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">Прислать код</button><button type="button" class="link-btn" data-action="auth-mode" data-id="login">Войти с паролем</button></form>`;
  }
  const fields = register
    ? `<input name="name" maxlength="40" placeholder="Имя" aria-label="Имя" autocomplete="name" required><label class="handle-field"><span>@</span><input name="handle" maxlength="20" placeholder="ник" aria-label="Ник" autocomplete="username" autocapitalize="none" spellcheck="false" pattern="[A-Za-z0-9_]{3,20}" required></label>${withEmail ? '<input name="email" type="email" maxlength="254" placeholder="Почта" aria-label="Почта" autocomplete="email" autocapitalize="none" spellcheck="false" required>' : ''}`
    : `<input name="handle" maxlength="254" placeholder="${withEmail ? 'Ник или почта' : 'Ник'}" aria-label="${withEmail ? 'Ник или почта' : 'Ник'}" autocomplete="username" autocapitalize="none" spellcheck="false" required>`;
  const submit = register ? (withEmail ? 'Получить код на почту' : 'Создать аккаунт') : 'Войти';
  const extra = register
    ? `<p class="fine">Ник: латиница, цифры и _. Его видят другие люди.${withEmail ? ' На почту придёт код подтверждения.' : ''}</p>`
    : withEmail ? '<button type="button" class="link-btn" data-action="auth-mode" data-id="code">Забыл пароль? Войди по коду из письма</button>' : '';
  return `${authProvidersHtml(register ? 'Продолжить' : 'Войти')}${tabs}<form id="auth-form" class="form" data-mode="${mode}">${fields}<input name="password" type="password" minlength="6" maxlength="200" placeholder="Пароль" aria-label="Пароль" autocomplete="${register ? 'new-password' : 'current-password'}" required><p class="form-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">${submit}</button>${extra}</form>`;
}

function loginCard(text) {
  return `<section class="auth-card"><span class="brand-mark big">${logoMark}</span><h2>Войди в про.стим</h2><p class="lead">${escapeHtml(text)}</p><div class="auth-body">${authFormHtml(authMode)}</div></section>`;
}

function renderAuthPage() {
  return `<div class="page narrow">${loginCard('Публикуй проекты, получай оценки доверия и подключай свой компьютер к ИИ-миру')}</div>`;
}

function openAuth(mode = 'register', reason = '') {
  authMode = mode;
  showDialog(`<div class="sheet-body"><h2 id="modal-title">${mode === 'register' ? 'Создай аккаунт' : 'Вход'}</h2>${reason ? `<p class="lead">${escapeHtml(reason)}</p>` : ''}<div class="auth-body">${authFormHtml(mode)}</div></div>`, { kind: 'auth' });
}

// Redraws only the sign-in block, wherever it is: the page or the sheet.
function refreshAuth() {
  const bodies = document.querySelectorAll?.('.auth-body') || [];
  bodies.forEach(body => { body.innerHTML = authFormHtml(authMode); });
  if (!bodies.length) render();
  document.querySelector?.('.auth-body input:not([type="hidden"])')?.focus?.({ preventScroll: true });
  clearInterval(authResendTimer);
  if (authFlow) authResendTimer = setInterval(tickAuthResend, 1000);
}

function tickAuthResend() {
  const button = document.querySelector?.('.auth-resend');
  if (!button || !authFlow) { clearInterval(authResendTimer); return; }
  const wait = Math.max(0, Math.ceil((authFlow.sentAt + 45000 - Date.now()) / 1000));
  button.disabled = wait > 0;
  button.textContent = wait ? `Новый код через ${wait} с` : 'Отправить код ещё раз';
  if (!wait) clearInterval(authResendTimer);
}

async function startEmailCode(purpose, fields) {
  const result = await apiCall('POST', '/api/auth/email/start', { purpose, ...fields });
  authFlow = { purpose, email: result.email, fields, sentAt: Date.now() };
}

async function finishAuth(created) {
  authFlow = null;
  clearInterval(authResendTimer);
  await reloadAll({ rerender: false });
  if (modal.open && dialogContext?.kind === 'auth') { modal.close(); dialogContext = null; }
  render();
  window.scrollTo?.(0, 0);
  toast(created ? `Добро пожаловать, ${me?.name || ''}!` : 'С возвращением!');
  if (remote?.account?.onboarding) openOnboarding();
}

/* Profile and reputation */

function personFor(handle) {
  if (online) return userByHandle(handle);
  if (handle === 'me') return localMe;
  const project = projects().find(item => item.handle === handle);
  return project ? { handle, name: project.author, initials: project.initials, color: project.color } : null;
}

function levelLegendHtml(level) {
  const current = levelTier(level).tier;
  return `<div class="level-legend">${levelTiers.map((tier, index) => {
    const info = levelTier(tier.from);
    const range = info.to >= 50 ? `${tier.from}+` : info.to > tier.from ? `${tier.from}–${info.to}` : `${tier.from}`;
    return `<span class="legend-item ${index + 1 === current ? 'on' : ''}"><span class="${ringClass(info)}" style="--ring:${tier.color}"><i class="legend-dot"></i>${gaugeSvg({ ratingCount: 1, ratingAverage: 5 }, info)}</span><small>${range}</small></span>`;
  }).join('')}</div>`;
}

function profileAvatarHtml(person, handle) {
  const level = Number(person.level) || 1;
  const tier = levelTier(level);
  const rated = Number(person.ratingCount) > 0;
  const label = `Уровень ${level}${rated ? `, оценка ${ratingText(person.ratingAverage)}` : ', оценок пока нет'}. Подробнее`;
  return `<button class="${ringClass(tier, 'lvl-profile')}" style="--ring:${tier.color}" data-action="trust-info" data-handle="${escapeHtml(handle)}" aria-label="${label}">${avatar(person, 'xxl')}${gaugeSvg(person, tier, 16)}${tier.strong ? '<i class="lvl-orbit" aria-hidden="true"></i>' : ''}<span class="lvl-badge">${rated ? `★ ${ratingText(person.ratingAverage)}` : '—'}</span></button>`;
}

function reviewsHtml(handle) {
  const reviews = reviewsCache.get(handle);
  if (!reviews) return '<div class="loading-line"><span class="dots"><i></i><i></i><i></i></span></div>';
  if (reviews.error) return emptyState('close', 'Не загрузилось', '', escapeHtml(reviews.error));
  if (!reviews.length) return emptyState('users', 'Отзывов пока нет', isMine(handle) || !online ? '' : `<button class="btn btn-primary" data-action="rate" data-handle="${escapeHtml(handle)}">★ Оценить</button>`, 'Оценки помогают понять, можно ли доверять человеку');
  return `<div class="reviews">${reviews.map(review => `<div class="review">${avatar(review)}<div><b>${review.handle ? `<button class="text-link inline" data-action="profile" data-handle="${escapeHtml(review.handle)}">${escapeHtml(review.name)}</button>` : escapeHtml(review.name)}</b>${stars(review.score)}<small>${timeAgo(review.createdAt)}</small>${review.text ? `<p>${escapeHtml(review.text)}</p>` : ''}</div></div>`).join('')}</div>`;
}

async function loadReviews(handle, force = false) {
  if (!online || (reviewsCache.has(handle) && !force)) return;
  try {
    const { reviews } = await apiCall('GET', `/api/users/${encodeURIComponent(handle)}/reviews`);
    reviewsCache.set(handle, reviews);
  } catch (error) {
    reviewsCache.set(handle, { error: error.message });
  }
  const current = route();
  if ((current.section === 'u' && current.page === handle) || (current.section === 'me' && isMine(handle))) renderKeepingInput();
}

function renderProfile(handle, tab) {
  const mine = isMine(handle);
  const owned = projects().filter(project => project.handle === handle);
  const person = personFor(handle) || (owned[0] ? { handle, name: owned[0].author, initials: owned[0].initials, color: owned[0].color } : null);
  if (!person) return `<div class="page">${emptyState('user', 'Автор не найден', '<a class="btn btn-ghost" href="#/feed">В ленту</a>')}</div>`;
  const myRating = remote?.myRatings?.[handle];
  const stats = online
    ? [[person.projects ?? owned.length, 'проектов'], [person.followers ?? 0, 'подписчиков', 'people', 'followers'], [person.following ?? 0, 'подписок', 'people', 'following'], ...(person.help ? [[person.help.points, person.help.title.toLowerCase(), 'help-info']] : [])]
    : mine
      ? [[owned.length, 'проектов'], [state.follows.length, 'подписок'], [state.saved.length, 'сохранено']]
      : [[owned.length, 'проектов'], [owned.reduce((sum, project) => sum + voteCount(project), 0), 'поддержали'], [owned.reduce((sum, project) => sum + commentCount(project), 0), 'комментариев']];
  const actions = mine
    ? `<button class="btn btn-primary btn-sm" data-action="publish">${icon('plus')} Проект</button><button class="btn btn-ghost btn-sm" data-action="application">${icon('gamepad')} Заявка в Steam</button>${online ? `<button class="btn btn-ghost btn-sm btn-square look-btn" data-action="look" aria-label="Оформление профиля">${icon('palette')}${hasPlusNow() ? '' : `<i class="lock-crown">${icon('crown')}</i>`}</button><button class="btn btn-ghost btn-sm btn-square" data-action="edit-profile" aria-label="Изменить профиль">${icon('pen')}</button>` : ''}`
    : `${followPill(handle, 'btn-sm')}${person.official ? '' : `<a class="btn btn-ghost btn-sm" href="#/inbox/${encodeURIComponent(handle)}">${icon('inbox')} Написать</a>`}${online && !person.official ? `<button class="btn btn-ghost btn-sm" data-action="rate" data-handle="${escapeHtml(handle)}">${myRating ? `★ ${myRating.score} · Изменить` : '★ Оценить'}</button><button class="btn btn-ghost btn-sm btn-square" data-action="user-menu" data-handle="${escapeHtml(handle)}" aria-label="Ещё">${icon('more')}</button>` : ''}`;
  const tabs = mine
    ? [['', 'grid', 'Проекты'], ['saved', 'bookmark', 'Сохранённое'], ...(online ? [['reposts', 'repost', 'Репосты']] : []), ['follows', 'users', 'Подписки'], ['applications', 'doc', 'Заявки'], ...(online ? [['reviews', 'comment', 'Отзывы']] : [])]
    : online ? [['', 'grid', 'Проекты'], ['reposts', 'repost', 'Репосты'], ['reviews', 'comment', 'Отзывы']] : [];
  const activeTab = tabs.some(([id]) => id === tab) ? tab : '';
  let content;
  if (activeTab === 'saved') {
    const saved = projects().filter(project => state.saved.includes(project.id));
    content = saved.length ? thumbsHtml(saved) : emptyState('bookmark', 'Сохраняй проекты из ленты', '<a class="btn btn-ghost" href="#/feed">В ленту</a>');
  } else if (activeTab === 'follows') {
    const people = online
      ? state.follows.map(item => userByHandle(item)).filter(Boolean).map(user => ({ handle: user.handle, author: user.name, initials: user.initials, color: user.color }))
      : [...new Map(projects().filter(project => state.follows.includes(project.handle)).map(project => [project.handle, project])).values()];
    content = people.length
      ? people.map(project => `<div class="person-row"><button class="author-link" data-action="profile" data-handle="${escapeHtml(project.handle)}">${avatar(project, 'lg')}<span><b>${escapeHtml(project.author)}</b><small>@${escapeHtml(project.handle)}</small></span></button>${followPill(project.handle, 'small')}</div>`).join('')
      : emptyState('users', 'Подпишись на авторов', '<a class="btn btn-ghost" href="#/search">Найти авторов</a>');
  } else if (activeTab === 'applications') {
    const applications = online ? remote.applications : state.applications;
    content = applications.length
      ? applications.map((application, index) => `<div class="app-row"><span class="doc-icon small">${icon('gamepad')}</span><span><b>${escapeHtml(application.title)}</b><small>${escapeHtml(application.status || application.stage || 'Черновик')}${application.createdAt ? ` · ${timeAgo(application.createdAt)}` : ''}${application.priority ? ' · приоритет Плюса' : ''}</small></span><button class="icon-btn" data-action="download-application" data-index="${index}" aria-label="Скачать заявку">${icon('download')}</button></div>`).join('')
      : emptyState('gamepad', 'Заявок пока нет', `<button class="btn btn-primary" data-action="application">${icon('send')} Подать заявку</button>`);
  } else if (activeTab === 'reposts') {
    const shared = projects().filter(project => (project.reposters || []).includes(handle) && visibleInFeed(project));
    content = shared.length ? thumbsHtml(shared) : emptyState('repost', mine ? 'Делись чужими проектами' : 'Репостов пока нет', '', mine ? 'Кнопка «Поделиться» → «Репост»: твои подписчики увидят пост в ленте' : '');
  } else if (activeTab === 'reviews') {
    content = reviewsHtml(handle);
  } else if (!mine && blockedList().includes(handle)) {
    content = `<div class="blocked-note">${icon('ban')}<span>Ты заблокировал @${escapeHtml(handle)}: посты и комментарии скрыты, написать тебе нельзя</span><button class="btn btn-ghost btn-sm" data-action="block" data-handle="${escapeHtml(handle)}">Разблокировать</button></div>`;
  } else {
    content = owned.length ? thumbsHtml(owned) : emptyState('sparkle', mine ? 'Покажи первый проект' : 'Проектов пока нет', mine ? `<button class="btn btn-primary" data-action="publish">${icon('plus')} Опубликовать</button>` : '');
  }
  const base = mine ? '#/me' : `#/u/${encodeURIComponent(handle)}`;
  const tabBar = tabs.length ? `<nav class="ptabs" aria-label="Разделы профиля">${tabs.map(([id, iconName, label]) => `<a href="${base}${id ? `/${id}` : ''}" class="${id === activeTab ? 'active' : ''}" aria-label="${label}" title="${label}" ${id === activeTab ? 'aria-current="page"' : ''}>${icon(iconName)}</a>`).join('')}</nav>` : '<div class="ptabs-line"></div>';
  const badges = `${person.official ? trustBadge(person) : ''}${person.demo ? '<span class="tag">демо-аккаунт</span>' : ''}`;
  const footer = mine && online ? `<div class="profile-foot"><button class="text-link" data-action="logout">Выйти из аккаунта</button></div>` : '';
  return `<div class="page narrow profile"><div class="profile-head ${person.look ? 'has-look' : ''}" ${person.look?.accent ? `style="--look:${person.look.accent}"` : ''}>${lookBannerHtml(person.look, 'profile-banner')}${profileAvatarHtml(person, handle)}<h1>${escapeHtml(person.name || person.author)}${plusBadge(person, true)}</h1><p class="handle">@${escapeHtml(handle === 'me' ? 'вы' : handle)}</p>${badges ? `<div class="profile-badges">${badges}</div>` : ''}${person.bio ? `<p class="bio">${escapeHtml(person.bio)}</p>` : ''}<div class="stats">${stats.map(([value, label, action, list]) => action && online ? `<button class="stat-btn" data-action="${action}" data-handle="${escapeHtml(handle)}" ${list ? `data-list="${list}"` : ''}><b>${value}</b>${escapeHtml(label)}</button>` : `<span><b>${value}</b>${label}</span>`).join('')}</div><div class="profile-actions">${actions}</div></div>${tabBar}<div class="ptab-panel">${content}</div>${footer}</div>`;
}

function openRate(handle) {
  if (needLogin('Чтобы оценивать людей, войди в аккаунт')) return;
  const person = userByHandle(handle);
  if (!person) return;
  const current = remote.myRatings?.[handle];
  const score = current?.score || 0;
  showDialog(`<div class="sheet-body"><div class="rate-head">${avatar(person, 'lg')}<div><h2 id="modal-title">Оценить ${escapeHtml(person.name)}</h2><p class="lead">Насколько можно доверять этому человеку? Оценка видна всем, одна от тебя.</p></div></div><form id="rate-form" class="form" data-handle="${escapeHtml(handle)}"><div class="star-pick" role="radiogroup" aria-label="Оценка">${[5, 4, 3, 2, 1].map(value => `<label><input type="radio" name="score" value="${value}" ${value === score ? 'checked' : ''} required><span aria-label="${value}">★</span></label>`).join('')}</div><textarea name="text" rows="3" maxlength="500" placeholder="Почему такая оценка? Например: помог с билдом, вовремя ответил" aria-label="Отзыв">${escapeHtml(current?.text || '')}</textarea><button class="btn btn-primary btn-block" type="submit">${icon('check')} Сохранить оценку</button>${current ? `<button type="button" class="text-link" data-action="unrate" data-handle="${escapeHtml(handle)}">Убрать мою оценку</button>` : ''}</form></div>`, { kind: 'rate' });
}

/* Plus: how a profile looks */

function lookBannerHtml(look, className) {
  if (!look || (!look.banner && !look.bannerImage && !look.accent)) return '';
  const image = uploadUrl(look.bannerImage);
  return `<div class="${className} ${look.banner ? `look-${escapeHtml(look.banner)}` : 'look-plain'}" aria-hidden="true">${image ? `<img src="${image}" alt="" loading="lazy">` : ''}</div>`;
}

let lookDraft = null;

function lookPreviewHtml() {
  const person = { ...me, look: { banner: lookDraft.banner, bannerImage: lookDraft.bannerImage, accent: profileAccents.find(([key]) => key === lookDraft.accent)?.[1] || '', motion: lookDraft.motion }, plus: true };
  return profileCardHtml(person, true);
}

function openLookEditor() {
  if (!me) return;
  const current = me.look || {};
  lookDraft = { banner: current.banner || '', bannerImage: current.bannerImage || '', accent: current.accentKey || '', motion: current.motion || null };
  const draw = () => {
    const sheet = modal.querySelector('.look-sheet');
    if (!sheet) return;
    sheet.querySelector('.look-preview').innerHTML = lookPreviewHtml();
    sheet.querySelectorAll('[data-banner]').forEach(button => button.classList.toggle('on', button.dataset.banner === lookDraft.banner && !lookDraft.bannerImage));
    sheet.querySelectorAll('[data-accent]').forEach(button => button.classList.toggle('on', button.dataset.accent === lookDraft.accent));
    sheet.querySelector('.look-own').classList.toggle('on', Boolean(lookDraft.bannerImage));
    sheet.querySelector('.look-motion-state').textContent = lookDraft.motion ? (lookDraft.motion.type === 'video' ? 'Видео на аватарке' : 'GIF на аватарке') : 'Обычная аватарка';
    sheet.querySelector('[data-look-clear="motion"]').hidden = !lookDraft.motion;
  };
  showDialog(`<div class="sheet-body look-sheet"><h2 id="modal-title">Оформление профиля</h2><p class="hub-hint">Видно в профиле и в карточке, которая открывается по нажатию на имя. Пока действует Плюс.</p><div class="look-preview"></div><h4 class="look-h">Фон</h4><div class="look-banners"><button type="button" data-banner="" class="look-swatch look-none">${icon('close')}</button>${profileBanners.map(([key, label]) => `<button type="button" data-banner="${key}" class="look-swatch look-${key}" aria-label="${label}" title="${label}"></button>`).join('')}<label class="look-swatch look-own" title="Своя картинка или GIF">${icon('image')}<input type="file" accept="image/*" hidden data-look-file="banner"></label></div><h4 class="look-h">Цвет профиля</h4><div class="look-accents"><button type="button" data-accent="" class="look-dot none" aria-label="Без цвета">${icon('close')}</button>${profileAccents.map(([key, color]) => `<button type="button" data-accent="${key}" class="look-dot" style="--dot:${color}" aria-label="${key}"></button>`).join('')}</div><h4 class="look-h">Живая аватарка</h4><div class="look-motion"><label class="btn btn-ghost btn-sm">${icon('upload')} GIF или видео до 10 с<input type="file" accept="image/gif,video/mp4,video/webm,video/quicktime" hidden data-look-file="motion"></label><small class="look-motion-state"></small><button type="button" class="text-link inline" data-look-clear="motion" hidden>Убрать</button></div><small class="look-progress" aria-live="polite"></small><button class="btn btn-grad btn-block look-save">${icon('check')} Сохранить</button></div>`, { kind: 'look' });
  const sheet = modal.querySelector('.look-sheet');
  draw();
  sheet.addEventListener('click', event => {
    const banner = event.target.closest('[data-banner]');
    const accent = event.target.closest('[data-accent]');
    if (banner) { lookDraft.banner = banner.dataset.banner; lookDraft.bannerImage = ''; draw(); }
    if (accent) { lookDraft.accent = accent.dataset.accent; draw(); }
    if (event.target.closest('[data-look-clear="motion"]')) { lookDraft.motion = null; draw(); }
  });
  sheet.addEventListener('change', async event => {
    const input = event.target.closest('[data-look-file]');
    const file = input?.files?.[0];
    if (!file) return;
    const progress = sheet.querySelector('.look-progress');
    const isVideo = file.type.startsWith('video/');
    if (input.dataset.lookFile === 'motion' && !isVideo && file.type !== 'image/gif') { toast('Для живой аватарки нужен GIF или видео'); return; }
    if (isVideo && file.size > MOTION_VIDEO_LIMIT) { toast('Видео для аватарки — до 12 МБ'); return; }
    if (isVideo) {
      const seconds = await videoLength(file);
      if (seconds > 10.5) { toast('Видео для аватарки — до 10 секунд'); return; }
    }
    try {
      progress.textContent = 'Загружаем…';
      const url = await uploadBlob(file, isVideo ? 'video' : 'image', share => { progress.textContent = `Загружаем… ${Math.round(share * 100)}%`; });
      if (input.dataset.lookFile === 'banner') { lookDraft.bannerImage = url; lookDraft.banner = lookDraft.banner || ''; }
      else lookDraft.motion = { url, type: isVideo ? 'video' : 'image' };
      progress.textContent = '';
      draw();
    } catch (error) {
      progress.textContent = '';
      toast(error.message);
    }
    input.value = '';
  });
  sheet.querySelector('.look-save').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await apiCall('POST', '/api/me/look', { banner: lookDraft.banner, bannerImage: lookDraft.bannerImage, accent: lookDraft.accent, motion: lookDraft.motion?.url || '' });
      updateUser(result.me);
      closeDialog();
      render();
      toast('Профиль оформлен');
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  });
}

function videoLength(file) {
  return new Promise(resolve => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number(video.duration) || 0); };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    video.src = url;
  });
}

// A person at a glance, like in Discord: banner, live avatar, the Plus mark, what they do and quick actions.
function profileCardHtml(person, preview = false) {
  const handle = escapeHtml(person.handle || '');
  const rated = Number(person.ratingCount) > 0;
  const chips = [
    rated ? `<span class="pcard-chip">★ ${ratingText(person.ratingAverage)}</span>` : '',
    person.help?.level >= 2 ? `<span class="pcard-chip help">${icon('check')}${escapeHtml(person.help.title)}</span>` : '',
    person.official ? `<span class="pcard-chip">${icon('check')}Официальный</span>` : ''
  ].join('');
  const mine = isMine(person.handle);
  const actions = preview ? '' : `<div class="pcard-actions">${mine ? '' : followPill(person.handle, 'small', true)}${mine || person.official ? '' : `<a class="btn btn-ghost btn-sm" href="#/inbox/${encodeURIComponent(person.handle)}">${icon('inbox')}</a>`}<button class="btn btn-ghost btn-sm" data-action="profile" data-handle="${handle}">Профиль ${icon('chevronRight')}</button></div>`;
  return `<div class="pcard ${person.look ? 'has-look' : ''}" ${person.look?.accent ? `style="--look:${person.look.accent}"` : ''}>${lookBannerHtml(person.look, 'pcard-banner') || '<div class="pcard-banner look-plain" aria-hidden="true"></div>'}<div class="pcard-body"><span class="pcard-face">${ringAvatar(person, 'pcard-ava', person)}</span><b class="pcard-name">${escapeHtml(person.name || '')}${plusBadge(person)}</b><small class="pcard-handle">@${handle}</small>${chips ? `<div class="pcard-chips">${chips}</div>` : ''}${person.bio ? `<p class="pcard-bio">${escapeHtml(person.bio)}</p>` : ''}<div class="pcard-stats"><span><b>${person.projects ?? 0}</b>проектов</span><span><b>${person.followers ?? 0}</b>подписчиков</span><span><b>${person.help?.points ?? 0}</b>помощь</span></div>${actions}</div></div>`;
}

let cardHost = null;

function openProfileCard(handle, point = null) {
  const person = userByHandle(handle);
  if (!person) { location.hash = `#/u/${encodeURIComponent(handle)}`; return; }
  if (!cardHost) {
    cardHost = document.createElement('dialog');
    cardHost.className = 'cmenu-host card-host';
    cardHost.setAttribute('aria-label', 'Карточка профиля');
    cardHost.addEventListener('click', event => {
      if (Date.now() - (cardHost.openedAt || 0) < 300) return;
      if (event.target === cardHost || event.target.closest?.('[data-action], a')) cardHost.close();
    });
    document.body.appendChild(cardHost);
  }
  cardHost.innerHTML = `<div class="pcard-wrap ${finePointer() ? 'desk' : 'dock'}" tabindex="-1" autofocus>${profileCardHtml(person)}</div>`;
  if (!cardHost.open) cardHost.showModal();
  cardHost.openedAt = Date.now();
  const wrap = cardHost.querySelector('.pcard-wrap');
  if (finePointer() && point) {
    const width = wrap.offsetWidth || 320;
    const height = wrap.offsetHeight || 360;
    wrap.style.left = `${Math.round(Math.max(12, Math.min(innerWidth - width - 12, point.x)))}px`;
    wrap.style.top = `${Math.round(point.y + height + 12 <= innerHeight ? point.y : Math.max(12, point.y - height - 36))}px`;
  }
}

// Help: how a person helped other people's projects. It grows from what authors did with their comments.
function openHelpInfo(handle) {
  const person = userByHandle(handle);
  const help = person?.help;
  if (!help) return;
  const mine = isMine(handle);
  const nextLevel = helpLevels[help.level];
  const kinds = Object.entries(help.kinds || {}).sort((a, b) => b[1] - a[1]).map(([kind, value]) => `${commentTagHtml(kind)}<b class="kind-count">${value}</b>`).join('');
  const area = help.area ? `Сильнее всего — ${helpAreas[help.area] === 'баги' ? 'поиск багов' : helpAreas[help.area]}` : '';
  const facts = help.points
    ? `Помог ${help.projects} ${plural(help.projects, 'проекту', 'проектам', 'проектам')} · пригодилось ${help.helped} ${plural(help.helped, 'отзыв', 'отзыва', 'отзывов')}${help.reviews ? ` · оценил ${help.reviews} демо` : ''}`
    : mine ? 'Оставляй отзывы на демо и комментарии к чужим проектам. Когда автор отметит «Помогло» или отдаст отзыв ИИ, уровень вырастет.' : 'Пока без отметок от авторов.';
  const rows = [['Учтено в обновлении', helpPoints.fixed], ['Автор отдал отзыв ИИ', helpPoints.tasked], ['Отметили «Помогло»', helpPoints.accepted], ['Комментарий закрепили', helpPoints.pinned], ['Оценка демо', helpPoints.review], ['♥ от других, до 5 на комментарий', helpPoints.like]];
  showDialog(`<div class="sheet-body help-sheet"><div class="help-hero lv${help.level}"><span class="help-badge lv${help.level}">${icon('check')}</span><b id="modal-title">${escapeHtml(help.title)}</b><small>${mine ? 'Твоя помощь авторам' : `Помощь авторам · ${escapeHtml(person.name)}`}</small><span class="help-score"><b>${help.points}</b> ${plural(help.points, 'очко', 'очка', 'очков')}</span>${nextLevel ? `<span class="help-bar" aria-hidden="true"><i style="width:${Math.round(help.progress * 100)}%"></i></span><small class="help-next">До «${escapeHtml(nextLevel.name)}» — ${help.next - help.points}</small>` : ''}</div>${kinds ? `<div class="help-kinds">${kinds}</div>` : ''}<p class="help-facts">${facts}${area ? `<br>${area}` : ''}</p><h3 class="sheet-h">Как растёт</h3><p class="fine">Отдельно от рейтинга: рейтинг — доверие людей, а помощь — насколько комментарии пригодились чужим проектам. Очки дают действия автора, а не число сообщений.</p><ul class="help-points">${rows.map(([label, value]) => `<li><span>${label}</span><b>+${value}</b></li>`).join('')}</ul><div class="help-ladder">${helpLevels.map((level, index) => `<span class="${help.level === index + 1 ? 'on' : ''}"><b>${escapeHtml(level.name)}</b><small>${level.from}+</small></span>`).join('')}</div></div>`, { kind: 'help-info' });
}

// Who follows a person and whom they follow, in one sheet with two tabs.
async function openPeople(handle, list = 'followers') {
  const person = userByHandle(handle);
  if (!person) return;
  const draw = (current, handles) => {
    const tabs = [['followers', 'Подписчики', person.followers ?? 0], ['following', 'Подписки', person.following ?? 0]];
    const rows = handles === null
      ? '<div class="loading-line"><span class="dots"><i></i><i></i><i></i></span></div>'
      : handles.length
        ? handles.map(item => userByHandle(item)).filter(Boolean).map(user => `<div class="person-row"><button class="author-link" data-action="profile" data-handle="${escapeHtml(user.handle)}">${ringAvatar(user, 'lg', user)}<span><b>${escapeHtml(user.name)}${plusBadge(user)}</b><small>@${escapeHtml(user.handle)}</small></span></button>${isMine(user.handle) ? '' : followPill(user.handle, 'small')}</div>`).join('')
        : `<p class="muted-line">${current === 'followers' ? 'Подписчиков пока нет' : 'Пока ни на кого не подписан'}</p>`;
    showDialog(`<div class="sheet-body people-sheet"><h2 id="modal-title">${escapeHtml(person.name)}</h2><div class="seg" role="tablist">${tabs.map(([key, label, count]) => `<button role="tab" aria-selected="${key === current}" class="${key === current ? 'on' : ''}" data-action="people" data-handle="${escapeHtml(handle)}" data-list="${key}">${label} · ${count}</button>`).join('')}</div><div class="people-list">${rows}</div></div>`, { kind: 'people', id: handle });
  };
  draw(list, null);
  try {
    const result = await apiCall('GET', `/api/users/${encodeURIComponent(handle)}/people?list=${list === 'following' ? 'following' : 'followers'}`);
    if (dialogContext?.kind === 'people' && dialogContext.id === handle) draw(list, result.people || []);
  } catch (error) {
    toast(error.message);
  }
}

function openTrustInfo(handle) {
  const person = userByHandle(handle);
  if (!person) return;
  const level = trustLevels[person.trust] || trustLevels.new;
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Доверие и уровень</h2><div class="trust-explain"><div class="trust-big trust-${escapeHtml(person.trust)}">${person.ratingCount ? `<b>${String(person.ratingAverage).replace('.', ',')}</b>${stars(person.ratingAverage)}` : '<b>—</b>'}<span>${level.label}</span></div><p class="lead">${escapeHtml(level.hint)}.</p></div><ul class="explain-list"><li><b>Рейтинг</b> — средняя оценка от других людей, от 1 до 5. Одна оценка от каждого, себя оценить нельзя.</li><li><b>Статус</b> учитывает число отзывов: одна случайная оценка мало что меняет.</li><li><b>Уровень</b> растёт за проекты, поддержки, подписчиков, комментарии и отзывы. Сейчас ${person.xp ?? 0} XP, уровень ${person.level || 1}. Шкала вокруг аватарки — спидометр оценки: чем выше средняя оценка, тем больше сегментов горит, а под аватаркой стоит сама оценка. Цвет шкалы — уровень. С 5-го уровня шкала светится, с 14-го по ней бежит искра.</li></ul>${levelLegendHtml(person.level || 1)}${!isMine(handle) && !person.official ? `<button class="btn btn-primary btn-block" data-action="rate" data-handle="${escapeHtml(handle)}">★ Оценить</button>` : ''}</div>`);
}

function avatarEditInner() {
  const preview = avatarDraft ? avatarDraft.preview || '' : uploadUrl(me?.avatar);
  return `<span class="avatar xl ${preview ? 'photo' : ''}" style="--avatar:${me?.color || '#e5e1d8'}">${preview ? `<img src="${preview}" alt="">` : escapeHtml(me?.initials || 'Я')}</span><div><label class="btn btn-ghost btn-sm">${icon('image')} ${preview ? 'Другое фото' : 'Загрузить фото'}<input type="file" name="avatar-file" accept="image/*" hidden></label>${preview ? `<button type="button" class="text-link" data-action="remove-avatar">Убрать фото</button>` : ''}<p class="fine">Настоящее фото помогает людям доверять тебе.</p></div>`;
}

// How the account signs in: its confirmed e-mail and the connected Google / Yandex / GitHub.
function accountHtml() {
  const account = remote?.account;
  if (!online || !account) return '';
  const providers = remote?.config?.providers || [];
  let mail = '';
  if (authFlow?.purpose === 'link') mail = authCodeHtml().replace('id="auth-code-form"', 'id="link-code-form"');
  else if (account.email) mail = `<div class="account-row">${icon('send')}<span><b>${escapeHtml(account.email)}</b><small>Почта подтверждена, по ней можно войти</small></span>${icon('check')}</div>`;
  else if (emailSignIn()) mail = `<form id="link-email-form" class="form"><p class="fine">Привяжи почту: по ней можно войти без пароля и восстановить доступ.</p><div class="inline-field"><input class="field" name="email" type="email" maxlength="254" placeholder="Почта" aria-label="Почта" autocomplete="email" autocapitalize="none" spellcheck="false" required><button class="btn btn-ghost" type="submit">Код</button></div><p class="form-error" role="alert"></p></form>`;
  const linked = providers.map(provider => account.providers.includes(provider.id)
    ? `<span class="social-btn linked ${escapeHtml(provider.id)}">${providerIcons[provider.id] || ''}<span>${escapeHtml(provider.label)} подключён</span>${icon('check')}</span>`
    : `<a class="social-btn ${escapeHtml(provider.id)}" href="/api/auth/oauth/${encodeURIComponent(provider.id)}/start">${providerIcons[provider.id] || ''}<span>Подключить ${escapeHtml(provider.label)}</span></a>`).join('');
  // A password: set one after signing up through a provider, change it, or replace a forgotten one right
  // after coming in by a mailed code.
  const free = !account.hasPassword || account.passwordReset;
  const password = `<form id="password-form" class="form password-form"><h3>${account.hasPassword ? 'Пароль' : 'Задать пароль'}</h3><p class="fine">${account.hasPassword ? (account.passwordReset ? 'Ты вошёл по коду — можно задать новый пароль без старого.' : 'Забыл пароль? Выйди и войди по коду из письма — тогда старый не понадобится.') : 'Чтобы входить и по нику с паролем.'}</p>${free ? '' : '<input class="field" name="current" type="password" maxlength="200" placeholder="Старый пароль" aria-label="Старый пароль" autocomplete="current-password" required>'}<div class="inline-field"><input class="field" name="password" type="password" minlength="6" maxlength="200" placeholder="${account.hasPassword ? 'Новый пароль' : 'Пароль'}" aria-label="Новый пароль" autocomplete="new-password" required><button class="btn btn-ghost" type="submit">Сохранить</button></div><p class="form-error" role="alert"></p></form>`;
  return `<section class="account-block">${mail}${linked ? `<div class="auth-social">${linked}</div>` : ''}${password}</section>`;
}

function openEditProfile() {
  if (!me) return;
  avatarDraft = null;
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Профиль</h2><form id="profile-form" class="form"><div class="avatar-edit">${avatarEditInner()}</div><input name="name" maxlength="40" value="${escapeHtml(me.name)}" placeholder="Имя" aria-label="Имя" required><textarea name="bio" rows="3" maxlength="300" placeholder="О себе: чем занимаешься, что делаешь" aria-label="О себе">${escapeHtml(me.bio || '')}</textarea><button class="btn btn-primary btn-block" type="submit">${icon('check')} Сохранить</button></form><button class="set-row" data-action="account-sheet"><span class="row-mark">${icon('send')}</span><span><b>Вход и почта</b><small>Почта, Google, Apple, Яндекс ID, GitHub</small></span>${icon('chevronRight')}</button></div>`);
  clearInterval(authResendTimer);
  if (authFlow?.purpose === 'link') authResendTimer = setInterval(tickAuthResend, 1000);
}

/* Steam */

// Steam keeps 30% and pays the rest for the game; the publisher's 2% comes out of that payout first.
function calcValues() {
  const copies = copySteps[calculator.copiesIndex];
  const gross = calculator.price * copies;
  const steam = gross * 0.3;
  const payout = gross - steam;
  const publisher = payout * PUBLISHER_FEE;
  return { copies, gross, steam, payout, publisher, author: payout - publisher };
}

const feePercent = `${Math.round(PUBLISHER_FEE * 100)}%`;

function slider(name, label, value, min, max, step, current) {
  return `<label class="slider"><span>${label}<b data-calc="${name}-out">${value}</b></span><input type="range" name="calc-${name}" min="${min}" max="${max}" step="${step}" value="${current}" style="--fill:${((current - min) / (max - min)) * 100}%"></label>`;
}

function calculatorHtml() {
  const values = calcValues();
  const publisherShare = 70 * PUBLISHER_FEE;
  return `<section class="block calc"><h2 class="block-title">Сколько получит автор</h2><div class="calc-result"><strong data-calc="author">${money(values.author)}</strong><small>из <span data-calc="gross">${money(values.gross)}</span> продаж</small></div><div class="split-bar" aria-hidden="true"><i class="seg-steam" style="flex-grow:30"></i><i class="seg-pub" style="flex-grow:${publisherShare}"></i><i class="seg-author" style="flex-grow:${70 - publisherShare}"></i></div><div class="split-legend"><span><i class="dot seg-steam"></i>Steam 30%</span><span><i class="dot seg-pub"></i>Издатель ${feePercent} · <b data-calc="publisher">${money(values.publisher)}</b></span><span><i class="dot seg-author"></i>Автор 98%</span></div>${slider('price', 'Цена', `$${calculator.price}`, 1, 60, 1, calculator.price)}${slider('copies', 'Продажи', number.format(values.copies), 0, copySteps.length - 1, 1, calculator.copiesIndex)}<p class="fine">${feePercent} берутся с выплаты Steam первыми. Банковские комиссии, конвертация и налоги — после, с твоей части.</p></section>`;
}

function updateCalculator() {
  const values = calcValues();
  const text = { author: money(values.author), gross: money(values.gross), publisher: money(values.publisher), 'price-out': `$${calculator.price}`, 'copies-out': number.format(values.copies) };
  for (const [key, value] of Object.entries(text)) {
    const element = document.querySelector(`[data-calc="${key}"]`);
    if (element) element.textContent = value;
  }
}

// Advantages in accent: the 2% fee is the headline, the rest backs it up.
function perksHtml() {
  return `<section class="perks" aria-label="Почему с нами">${publisherPerks.map(perk => `<div class="perk">${icon(perk.icon)}<b>${perk.title}</b><small>${perk.text}</small></div>`).join('')}</section>`;
}

function readinessPercent() {
  return Math.round(readinessItems.filter(item => state.readiness.includes(item.id)).length / readinessItems.length * 100);
}

function readinessHtml() {
  const pct = readinessPercent();
  return `<section class="block readiness"><h2 class="block-title">Готовность к Steam</h2><div class="readiness-wrap"><div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="50"/><circle class="ring-fg" cx="60" cy="60" r="50" pathLength="100" style="stroke-dasharray:${pct} 100;opacity:${pct ? 1 : 0}"/></svg><strong data-ready-pct>${pct}%</strong></div><div class="ready-grid">${readinessItems.map(item => {
    const on = state.readiness.includes(item.id);
    return `<button class="ready-item ${on ? 'on' : ''}" data-action="ready" data-id="${item.id}" aria-pressed="${on}">${icon(item.icon)}<span>${item.title}</span><i class="ready-check">${icon('check')}</i></button>`;
  }).join('')}</div></div><button class="btn btn-primary btn-block ready-cta ${pct === 100 ? 'show' : ''}" data-action="application">${icon('send')} Всё готово — подать заявку</button></section>`;
}

function stepsHtml() {
  const index = Math.max(0, steamSteps.findIndex(step => step.id === openStep));
  return `<div class="steps" style="--p:${index / (steamSteps.length - 1)}">${steamSteps.map((step, position) => `<button class="step ${position <= index ? 'done' : ''} ${position === index ? 'on' : ''}" data-action="step" data-id="${step.id}" aria-pressed="${position === index}"><span class="step-icon">${icon(step.icon)}</span><b>${step.title}</b></button>`).join('')}</div><p class="step-detail" data-step-detail>${steamSteps[index].text}</p>`;
}

function allTopics() {
  return online ? remote.topics : [...state.topics, ...initialTopics];
}

function topicReplies(topic) {
  if (online) return topic.replies;
  return [...topic.replies.map(text => ({ name: topic.author === 'Вы' ? 'Вы' : 'про.стим', text })), ...(state.replies[topic.id] || [])];
}

function myApplications() {
  return online ? remote?.applications || [] : state.applications;
}

function steamLinkHtml(className = 'btn btn-glass', label = `${studio.name} в Steam`) {
  const url = safeUrl(studio.steamUrl);
  return url ? `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${icon('external')} ${escapeHtml(label)}</a>` : '';
}

function studioCardHtml() {
  const official = online ? userByHandle('prostim') : null;
  return `<section class="block studio-card"><div class="studio-head"><span class="studio-mark">${logoMark}</span><div><h2>${escapeHtml(studio.name)}</h2><p>${escapeHtml(studio.tagline)} · ${escapeHtml(studio.country)}</p></div></div><div class="studio-facts"><span class="accent-fact">${icon('percent')} ${feePercent} с выплаты Steam</span><span>${icon('check')} Работаем по договору</span><span>${icon('coins')} Счёт и выплаты в Молдове</span><span>${icon('users')} Отвечаем в чате</span></div>${studio.team.length ? `<div class="studio-people">${studio.team.map(person => `<span>${avatar(person)}<b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.role)}</small></span>`).join('')}</div>` : ''}<div class="hero-actions">${steamLinkHtml('btn btn-ghost')}<a class="btn btn-ghost" href="#/steam/studio">${icon('users')} Кто мы</a>${official ? `<a class="btn btn-ghost" href="#/inbox/prostim">${icon('inbox')} Написать</a>` : ''}</div></section>`;
}

function servicesHtml() {
  return `<section class="block"><h2 class="block-title">Что делает издатель</h2><div class="service-grid">${publisherServices.map(item => `<div class="service">${icon(item.icon)}<b>${item.title}</b><p>${item.text}</p></div>`).join('')}</div></section>`;
}

function payoutHtml() {
  return `<section class="block payout"><h2 class="block-title">Как автор получает деньги</h2><div class="payout-flow">${payoutFlow.map((item, index) => `${index ? `<i class="payout-arrow">${icon('chevronRight')}</i>` : ''}<div class="payout-node">${icon(item.icon)}<b>${item.title}</b><small>${item.text}</small></div>`).join('')}</div><div class="payout-facts">${payoutFacts.map(([value, text]) => `<div><b>${value}</b><small>${text}</small></div>`).join('')}</div><p class="fine">Условия Steam: <a class="text-link inline" href="https://partner.steamgames.com/doc/finance/payments_salesreporting" target="_blank" rel="noopener noreferrer">выплаты и отчёты Steamworks</a>. ${feePercent} издателя удерживаются первыми, банковские комиссии и налоги считаются после — с части автора.</p></section>`;
}

function roadmapHtml() {
  return `<section class="block"><h2 class="block-title">Дорожная карта</h2><ol class="roadmap">${roadmap.map(stage => `<li class="${stage.done ? 'done' : ''}"><i>${stage.done ? icon('check') : ''}</i><div><small>${stage.when}</small><b>${stage.title}</b><ul>${stage.items.map(item => `<li>${item}</li>`).join('')}</ul></div></li>`).join('')}</ol><p class="fine">План может меняться — новости публикуем в обсуждениях.</p></section>`;
}

function faqHtml() {
  return `<section class="block"><h2 class="block-title">Частые вопросы</h2><div class="faq">${steamFaq.map(([question, answer]) => `<details class="more"><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div></section>`;
}

/* Liquid chrome and waves: the visual motif of про.стим */

// Three layered waves that drift sideways; each path is drawn twice so the loop has no seam.
let wavesSeq = 0;

function wavesSvg(className = '') {
  const id = `wv${++wavesSeq}`;
  const crest = (y, amp) => `M0 ${y} C 240 ${y - amp} 480 ${y + amp} 720 ${y} S 1200 ${y - amp} 1440 ${y} C 1680 ${y - amp} 1920 ${y + amp} 2160 ${y} S 2640 ${y - amp} 2880 ${y}`;
  const body = (y, amp) => `${crest(y, amp)} V 160 H 0 Z`;
  const gradient = (name, stops) => `<linearGradient id="${id}${name}" x1="0" x2="1" y1="0" y2="0">${stops.map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`).join('')}</linearGradient>`;
  const layer = (name, y, amp) => `<g class="wave ${name}"><path d="${body(y, amp)}" fill="url(#${id}${name})"/><path class="crest" d="${crest(y, amp)}"/></g>`;
  return `<svg class="waves ${className}" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden="true"><defs>${gradient('w1', [[0, '#2c45c8'], [0.16, '#5b2aa8'], [0.3, '#8c2f6c'], [0.42, '#e3a64e'], [0.52, '#f6e2a4'], [0.64, '#6fd8ea'], [0.8, '#2a86e0'], [1, '#2c45c8']])}${gradient('w2', [[0, '#dccbff'], [0.25, '#ffc9e6'], [0.5, '#fff0c4'], [0.75, '#bfe6ff'], [1, '#dccbff']])}${gradient('w3', [[0, '#5d6773'], [0.18, '#f4f7fb'], [0.34, '#f6e2a4'], [0.48, '#7d8794'], [0.64, '#9fd6ff'], [0.8, '#ffffff'], [1, '#5d6773']])}</defs>${layer('w1', 66, 34)}${layer('w2', 92, 26)}${layer('w3', 116, 18)}</svg>`;
}

// A drop of liquid chrome: a morphing silver body, an iridescent film and a highlight.
function liquidHtml(className = '') {
  return `<div class="liquid ${className}" aria-hidden="true"><i></i><i></i><i></i></div>`;
}

// The AI world's own motif: a glowing core with orbits and nodes (Steam has liquid chrome, the feed has neither).
function neuralHtml(className = '') {
  return `<div class="neural ${className}" aria-hidden="true"><i class="n-ring"></i><i class="n-ring"></i><i class="n-ring"></i><i class="n-core"></i><i class="n-node"></i><i class="n-node"></i><i class="n-node"></i></div>`;
}

function logoLoaderHtml(text = '') {
  return `<div class="logo-loader" role="status" aria-label="${escapeHtml(text || 'Загрузка')}"><span class="ll-stage"><span class="ll-ring"></span><span class="ll-ring"></span><span class="brand-mark big ll-mark">${logoMark}<i class="ll-sheen"></i></span></span>${text ? `<small>${escapeHtml(text)}</small>` : ''}</div>`;
}

// Big marketing numbers: the author keeps 98%, the publisher takes 2%.
function moneySplitHtml() {
  const ours = Math.round(PUBLISHER_FEE * 100);
  const yours = 100 - ours;
  return `<section class="money-split"><div class="split-glow">${liquidHtml('small')}</div><p class="split-kicker">${icon('coins')} С каждой выплаты Steam за игру</p><div class="split-nums"><div class="split-num yours"><b class="chrome-text" data-count="${yours}">${yours}%</b><span>получаешь <em>ты</em></span></div><div class="split-num ours"><b class="iri-text">${ours}%</b><span>берём <em>мы</em></span></div></div><div class="split-bar" aria-hidden="true"><i style="--w:${yours}%"></i><i style="--w:${ours}%"></i></div><ul class="split-facts"><li><b>0 ₽</b>за заявку</li><li><b>1</b>прозрачный договор</li><li><b>${ours}%</b>и больше ничего</li></ul>${wavesSvg('split-waves')}</section>`;
}

function gamesHtml() {
  return `<section class="block games"><div class="block-head"><h2 class="block-title">Наши игры в Steam</h2><span class="muted-count">${escapeHtml(studio.name)}</span></div><div class="game-grid">${studioGames.map(game => {
    const store = `https://store.steampowered.com/app/${game.appId}/`;
    return `<article class="game-card"><button class="game-art" data-action="view-game" data-id="${game.id}" data-index="0" aria-label="Скриншоты ${escapeHtml(game.title)}"><img src="${escapeHtml(game.header)}" alt="${escapeHtml(game.title)}" loading="lazy" referrerpolicy="no-referrer"><span class="game-shine"></span></button><div class="game-body"><div class="game-title"><h3>${escapeHtml(game.title)}</h3><span>${escapeHtml(game.released)}</span></div><p>${escapeHtml(game.summary)}</p><div class="game-shots">${game.shots.map((shot, index) => `<button data-action="view-game" data-id="${game.id}" data-index="${index + 1}" aria-label="Скриншот ${index + 1}"><img src="${escapeHtml(shot.replace('1920x1080', '600x338'))}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('')}</div><div class="game-foot"><span class="chips">${game.genres.map(genre => `<span>${escapeHtml(genre)}</span>`).join('')}</span><a class="btn btn-primary btn-sm" href="${store}" target="_blank" rel="noopener noreferrer">${icon('gamepad')} В Steam</a></div></div></article>`;
  }).join('')}</div></section>`;
}

function renderStudio() {
  const team = studio.team.length
    ? `<div class="team-grid">${studio.team.map(person => `<div class="team-card">${avatar(person, 'xl')}<b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.role || '')}</small>${person.link && safeUrl(person.link) ? `<a class="text-link" href="${escapeHtml(safeUrl(person.link))}" target="_blank" rel="noopener noreferrer">Steam</a>` : ''}</div>`).join('')}</div>`
    : `<p class="muted-line">Карточки команды появятся здесь: имя, роль и ссылка на профиль.</p>`;
  const links = (studio.links || []).map(([label, url]) => safeUrl(url) ? `<a class="ext-link" href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${icon('external')} ${escapeHtml(label)}</a>` : '').join('');
  return `${studioCardHtml()}<section class="block"><h2 class="block-title">Команда</h2>${team}${links ? `<div class="studio-links">${links}</div>` : ''}</section><section class="block"><h2 class="block-title">Зачем мы это делаем</h2><div class="why-grid"><div><b>Автору</b><p>Выпустить игру в Steam без своей компании за границей: договор, страница, билд и выплаты берёт на себя издатель.</p></div><div><b>Игрокам</b><p>Видеть игры до релиза в ленте, пробовать демо и поддерживать авторов.</p></div><div><b>Нам</b><p>${feePercent} с выплаты Steam за игру и платные услуги — только если автор сам их закажет. Скрытых платежей нет.</p></div></div></section>${roadmapHtml()}`;
}

function renderSteam(page) {
  const tab = ['studio', 'documents', 'discussions'].includes(page) ? page : '';
  const navigation = subnav('steam', [['', 'Обзор'], ['studio', 'Студия'], ['documents', 'Документы'], ['discussions', 'Обсуждения']], tab);
  if (tab === 'studio') return `<div class="page">${navigation}<h1 class="sr-only">Студия ${escapeHtml(studio.name)}</h1>${renderStudio()}${gamesHtml()}</div>`;
  if (tab === 'documents') {
    return `<div class="page">${navigation}<h1 class="sr-only">Документы Steam</h1><div class="tile-grid">${steamDocuments.map(document => `<button class="doc-tile" data-action="document" data-id="${document.id}"><span class="doc-icon">${icon(document.icon)}</span><span><b>${document.title}</b><small>${document.subtitle}</small></span></button>`).join('')}</div>${faqHtml()}<a class="ext-link" href="https://partner.steamgames.com/doc/home" target="_blank" rel="noopener noreferrer">${icon('external')} Документация Steamworks</a></div>`;
  }
  if (tab === 'discussions') {
    const topics = allTopics();
    return `<div class="page">${navigation}<div class="page-head"><h1 class="sr-only">Обсуждения Steam</h1><span class="muted-count">${topics.length} тем</span><button class="btn btn-primary btn-sm" data-action="new-topic">${icon('plus')} Тема</button></div><div class="topic-list">${topics.map(topic => `<button class="topic-row" data-action="topic" data-id="${escapeHtml(topic.id)}">${avatar({ initials: (topic.author || '?').slice(0, 1), color: topic.color || (topic.author === 'Вы' ? '#e5e1d8' : '#b7d5fa'), avatar: topic.avatar })}<span class="topic-text"><small>${topic.pinned ? `${icon('pin')} ` : ''}${escapeHtml(topic.category || 'Общее')} · ${escapeHtml(topic.author || '')}${topic.createdAt ? ` · ${timeAgo(topic.createdAt)}` : ''}</small><b>${escapeHtml(topic.title)}</b></span><span class="topic-count">${icon('comment')}${topicReplies(topic).length}</span></button>`).join('')}</div></div>`;
  }
  const applications = myApplications();
  const mine = applications.length ? `<section class="block my-apps"><h2 class="block-title">Мои заявки</h2>${applications.slice(0, 3).map(application => `<a class="app-row" href="#/me/applications"><span class="doc-icon small">${icon('gamepad')}</span><span><b>${escapeHtml(application.title)}</b><small>${escapeHtml(application.status || 'Черновик')} · ${escapeHtml(application.stage || '')}</small></span>${icon('chevronRight')}</a>`).join('')}</section>` : '';
  return `<div class="page">${navigation}<section class="steam-hero"><div class="hero-art chrome-art">${liquidHtml()}${wavesSvg('hero-waves')}</div><span class="hero-fee" aria-hidden="true"><b>${feePercent}</b><small>наша доля</small></span><div class="hero-copy"><span class="hero-kicker">${icon('gamepad')} ${escapeHtml(studio.name)} · паблишинг</span><h1>Выпускаем твою игру <span class="chroma" data-text="в Steam">в Steam</span></h1><p class="hero-lead">Берём всего <b class="accent-text">${feePercent}</b> с выплаты Steam. Договор, страница, билд, запуск и выплаты — через издателя в Молдове.</p><div class="hero-actions"><button class="btn btn-primary hero-main" data-action="application">${icon('send')} Подать заявку</button>${steamLinkHtml('btn btn-glass', 'Мы в Steam')}<a class="btn btn-glass" href="#/steam/studio">${icon('users')} Кто мы</a></div></div></section>${moneySplitHtml()}${perksHtml()}${gamesHtml()}${mine}<section class="block"><h2 class="block-title">Путь игры</h2>${stepsHtml()}</section>${servicesHtml()}${payoutHtml()}<div class="blocks-2">${calculatorHtml()}${mySteamProjectsHtml() || readinessHtml()}</div>${studioCardHtml()}${roadmapHtml()}${faqHtml()}</div>`;
}

/* AI world */

function sourceChip(href) {
  return `<a class="source-chip" href="${href}"><span class="source-icon">${icon(source.type === 'github' ? 'branch' : 'folder')}</span><span><b>${escapeHtml(source.name)}</b><small>${escapeHtml(source.label)}</small></span>${icon('chevronRight')}</a>`;
}

function fileIcon(path) {
  if (/\.(md|txt)$/i.test(path)) return 'doc';
  if (/\.(json|ya?ml|toml)$/i.test(path)) return 'file';
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) return 'image';
  return 'code';
}

function aiNav(active) {
  return subnav('ai', [['', 'Проекты'], ['connect', 'Подключить'], ['editor', 'Редактор']], active);
}

function renderAi(current) {
  const page = current.page === 'connections' ? 'connect' : current.page;
  if (page === 'editor') return renderEditor();
  if (page === 'connect') return renderConnect(current.extra);
  if (page === 'w' && current.extra) return renderWorkspace(current.extra, current.more);
  return renderAiHub();
}

function lastSeenText(device) {
  if (!device) return 'компьютер отключён';
  if (device.online) return 'в сети';
  return device.lastSeen ? `не в сети · был ${timeAgo(device.lastSeen)}` : 'не в сети';
}

function workspaceCard(workspace) {
  const device = workspace.device;
  const last = workspace.lastTask;
  const engines = (device?.engines || []).filter(engine => engine.ok && engine.id !== 'demo').map(engine => `<span class="mini-chip">${escapeHtml(engine.label)}</span>`).join('');
  return `<a class="ws-card" href="#/ai/w/${encodeURIComponent(workspace.id)}"><span class="ws-card-icon">${icon('folder')}<i class="presence ${device?.online ? 'on' : ''}"></i></span><span class="ws-card-body"><b>${escapeHtml(workspace.name)}</b><small>${escapeHtml(device?.name || 'Компьютер')} · ${lastSeenText(device)}${workspace.branch ? ` · ${icon('branch')} ${escapeHtml(workspace.branch)}` : ''}</small>${last ? `<span class="ws-last ${escapeHtml(last.status)}">${isActive(last.status) ? '<i class="spin"></i>' : last.status === 'done' ? icon('check') : icon('close')}${escapeHtml(last.prompt)}</span>` : '<span class="ws-last">Задач пока нет</span>'}${engines ? `<span class="ws-engines">${engines}</span>` : ''}${workspace.role !== 'owner' ? `<span class="ws-shared">${icon('users')} от @${escapeHtml(workspace.ownerHandle)}</span>` : ''}</span>${icon('chevronRight')}</a>`;
}

function aiHowHtml() {
  return `<section class="how"><h2 class="row-title">Как это устроено</h2><div class="how-flow"><div class="how-node">${icon('user')}<b>Телефон или браузер</b><small>Пишешь задачу и видишь каждый шаг</small></div><i class="how-line"></i><div class="how-node accent">${logoMark}<b>про.стим</b><small>Передаёт задачи и шаги, файлы не хранит</small></div><i class="how-line"></i><div class="how-node">${icon('code')}<b>Твой компьютер</b><small>Агент запускает Claude Code или Codex в папке проекта</small></div></div><p class="privacy">${icon('lock')} Проект остаётся на компьютере. На сайт приходят только шаги задачи, diff и файлы, которые ты открыл.</p></section>`;
}

function renderAiHub() {
  const hero = `<section class="ai-hero">${neuralHtml()}<span class="hero-kicker">${icon('sparkle')} ИИ-мир</span><h1>Claude Code и Codex в твоём проекте — с любого устройства</h1><p class="lead">Подключи компьютер один раз, а потом ставь задачи с телефона. Видно, что ИИ думает, какие файлы читает и как их меняет.</p><div class="hero-actions"><a class="btn btn-primary" href="#/ai/connect">${icon('plus')} Подключить компьютер</a><a class="btn btn-ghost" href="#/ai/editor">${icon('folder')} Папка в браузере</a></div></section>`;
  if (!online) return `<div class="page">${aiNav('')}${hero}<div class="note">${icon('lock')}<p>Это локальная копия сайта. Подключение компьютера работает на сервере про.стим — запусти <code>npm start</code> или открой опубликованный сайт.</p></div>${aiHowHtml()}</div>`;
  if (!me) return `<div class="page">${aiNav('')}${hero}${aiHowHtml()}<div class="narrow-block">${loginCard('Войди, чтобы подключить свой компьютер и проекты')}</div></div>`;
  const mine = ai.workspaces.filter(workspace => workspace.role === 'owner' && workspace.present);
  const shared = ai.workspaces.filter(workspace => workspace.role !== 'owner' && workspace.present);
  const list = mine.length ? `<div class="ws-list">${mine.map(workspaceCard).join('')}</div>` : `<div class="ws-empty"><div class="ws-steps"><span><b>1</b>Запусти агент на компьютере</span><span><b>2</b>Выбери папку проекта</span><span><b>3</b>Пиши задачи отсюда</span></div><a class="btn btn-primary" href="#/ai/connect">${icon('plus')} Подключить компьютер</a></div>`;
  return `<div class="page">${aiNav('')}${mine.length ? '' : hero}<div class="section-head"><h2 class="row-title">Мои проекты</h2>${mine.length ? `<a class="btn btn-ghost btn-sm" href="#/ai/connect">${icon('plus')} Ещё</a>` : ''}</div>${list}${shared.length ? `<h2 class="row-title">Доступные мне</h2><div class="ws-list">${shared.map(workspaceCard).join('')}</div>` : ''}${aiHowHtml()}</div>`;
}

function agentCommand() {
  const origin = location.origin;
  const code = ai.pair?.code || 'КОД';
  const allow = ai.pairAllow;
  return ai.pairOs === 'win'
    ? `iwr ${origin}/agent.mjs -OutFile $HOME\\prostim-agent.mjs; node $HOME\\prostim-agent.mjs --server ${origin} --code ${code} --dir . --allow ${allow}`
    : `curl -fsSL ${origin}/agent.mjs -o ~/prostim-agent.mjs && node ~/prostim-agent.mjs --server ${origin} --code ${code} --dir . --allow ${allow}`;
}

function codeBlock(text, label = 'Скопировать') {
  return `<div class="code-block"><pre>${escapeHtml(text)}</pre><button class="icon-btn" data-action="copy" data-copy="${escapeHtml(text)}" aria-label="${label}">${icon('doc')}</button></div>`;
}

function renderConnect(method = '') {
  const methods = [['', 'code', 'Компьютер', 'Claude Code или Codex'], ['folder', 'folder', 'Папка', 'в этом браузере'], ['github', 'branch', 'GitHub', 'открытый репозиторий'], ['cloud', 'cloud', 'Диски', 'Google, Яндекс']];
  const active = methods.some(([id]) => id === method) ? method : '';
  const picker = `<div class="method-grid">${methods.map(([id, iconName, title, text]) => `<a class="method ${id === active ? 'on' : ''}" href="#/ai/connect${id ? `/${id}` : ''}">${icon(iconName)}<b>${title}</b><small>${text}</small>${id === '' ? '<em>лучший вариант</em>' : ''}</a>`).join('')}</div>`;
  let body = '';
  if (active === 'folder') {
    body = `<section class="block"><h2 class="block-title">Папка в этом браузере</h2><p class="lead">Chrome и Edge на компьютере могут открыть папку и сохранять изменения прямо в неё. Код никуда не загружается. ИИ-задачи в этом режиме не выполняются — для них нужен агент.</p><div class="hero-actions"><button class="btn btn-primary" data-action="local-folder">${icon('folder')} Выбрать папку</button><button class="btn btn-ghost" data-action="demo-source" data-provider="local">Пример</button></div></section>`;
  } else if (active === 'github') {
    body = `<section class="block"><h2 class="block-title">GitHub</h2><p class="lead">Открытый репозиторий можно посмотреть без установки. Чтобы ИИ менял код и делал коммиты, склонируй репозиторий на компьютер и подключи папку агентом — так не нужно загружать весь проект на сервер.</p><form id="github-form" class="form"><input name="repository" type="url" placeholder="https://github.com/автор/проект" aria-label="Адрес публичного репозитория" required><button type="submit" class="btn btn-primary btn-block">${icon('download')} Открыть</button><p id="github-status" class="fine" role="status">Публичный репозиторий · только чтение</p></form></section>`;
  } else if (active === 'cloud') {
    body = `<section class="block"><h2 class="block-title">Google Drive и Яндекс Диск</h2><p class="lead">Вход через аккаунт заработает после регистрации приложения у Google и Яндекса. Пока проще всего: включи синхронизацию диска на компьютере и подключи синхронизированную папку агентом.</p><div class="hero-actions"><button class="btn btn-ghost" data-action="demo-source" data-provider="google">${icon('drive')} Пример Drive</button><button class="btn btn-ghost" data-action="demo-source" data-provider="yandex">${icon('cloud')} Пример Яндекс</button></div></section>`;
  } else if (!online) {
    body = `<div class="note">${icon('lock')}<p>Агент подключается к серверу про.стим. Открой опубликованный сайт или запусти сервер командой <code>npm start</code>.</p></div>`;
  } else if (!me) {
    body = `<div class="narrow-block">${loginCard('Компьютер привязывается к твоему аккаунту')}</div>`;
  } else {
    const expired = !ai.pair || ai.pair.expiresAt < Date.now();
    const minutes = ai.pair ? Math.max(0, Math.round((ai.pair.expiresAt - Date.now()) / 60000)) : 0;
    const status = ai.paired
      ? `<div class="pair-status ok">${icon('check')}<div><b>Компьютер «${escapeHtml(ai.paired.name)}» подключён</b><small>Проект появится через пару секунд</small></div><a class="btn btn-primary btn-sm" href="#/ai">К проектам</a></div>`
      : `<div class="pair-status"><span class="dots"><i></i><i></i><i></i></span><div><b>Ждём компьютер</b><small>Страница обновится сама, когда агент подключится</small></div></div>`;
    body = `<ol class="setup">
<li><h3>Установи Node.js и движок</h3><p>Нужен <a class="text-link inline" href="https://nodejs.org" target="_blank" rel="noopener noreferrer">Node.js 18+</a> и хотя бы один ИИ с входом в твой аккаунт:</p><details class="more" open><summary>Claude Code</summary>${codeBlock(ai.pairOs === 'win' ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash')}<p class="fine">Потом запусти <code>claude</code> и войди командой <code>/login</code>.</p></details><details class="more"><summary>Codex (ChatGPT)</summary>${codeBlock('npm install -g @openai/codex')}<p class="fine">Потом выполни <code>codex login</code>.</p></details><p class="fine">Без них агент работает в демо-режиме: шаги видны, файлы не меняются.</p></li>
<li><h3>Что разрешить с сайта</h3>${chipRadio('pair-allow', Object.entries(modeNames).map(([id, label]) => [id, label]), ai.pairAllow)}<p class="fine">${escapeHtml(modeHints[ai.pairAllow])}. Это предел: с сайта нельзя попросить больше.</p></li>
<li><h3>Запусти в папке проекта</h3><div class="os-switch">${chipRadio('pair-os', [['unix', 'macOS · Linux'], ['win', 'Windows']], ai.pairOs)}</div>${codeBlock(agentCommand(), 'Скопировать команду')}<div class="pair-code"><span>Код привязки</span><b>${expired ? '····-····' : escapeHtml(ai.pair.code)}</b><small>${expired ? 'получаем…' : `действует ${minutes} мин`}</small><button class="text-link" data-action="new-code">Новый код</button>${navigator.share ? `<button class="text-link" data-action="share-command">Отправить себе</button>` : ''}</div><p class="fine">Команду запускают на компьютере. Агент запомнит привязку — дальше хватит <code>node ~/prostim-agent.mjs</code>. Ещё одну папку: <code>--dir путь</code>.</p></li>
<li><h3>Готово</h3>${status}</li></ol>`;
  }
  return `<div class="page">${aiNav('connect')}<h1 class="page-title">Подключи проект</h1>${picker}${body}${active === '' ? aiStorageHtml() : ''}</div>`;
}

function aiStorageHtml() {
  return `<section class="block storage"><h2 class="block-title">Почему проект не загружается на сервер</h2><div class="storage-grid"><div><b>${icon('code')} Агент на компьютере</b><p>Задачи выполняются там, где лежит проект — хоть 1000 ГБ. Сайт передаёт только текст задачи и шаги работы.</p></div><div><b>${icon('branch')} Только Git</b><p>Если компьютер выключен, проект можно держать в репозитории и подключить облачную машину с агентом: она клонирует только нужную ветку.</p></div><div><b>${icon('lock')} Доступ</b><p>Предел (анализ, правки, полный) задаёшь на компьютере. Другим людям можно открыть просмотр или постановку задач.</p></div></div></section>`;
}

async function ensurePairCode(force = false) {
  if (!online || !me) return;
  if (!force && ai.pair && ai.pair.expiresAt > Date.now() + 60000) return;
  if (ai.pairLoading) return;
  ai.pairLoading = true;
  try {
    ai.pair = await apiCall('POST', '/api/devices/pair-code');
    if (force) ai.paired = null;
  } catch (error) {
    toast(error.message);
  } finally {
    ai.pairLoading = false;
  }
  if (route().section === 'ai' && ['connect', 'connections'].includes(route().page)) renderKeepingInput();
}

async function refreshWorkspaces() {
  if (!online || !me) return;
  try {
    const { workspaces } = await apiCall('GET', '/api/workspaces');
    ai.workspaces = workspaces;
    for (const workspace of workspaces) {
      const detail = ai.details.get(workspace.id);
      if (detail) Object.assign(detail, { device: workspace.device, branch: workspace.branch, dirty: workspace.dirty, present: workspace.present, name: workspace.name });
    }
  } catch {}
  const current = route();
  if (current.section === 'ai' && current.page !== 'editor') {
    if (current.page === 'w') updateWorkspaceHead(current.extra); else renderKeepingInput();
  }
}

async function loadWorkspace(id, { force = false } = {}) {
  if (!online || !me || ai.loading.has(id) || (ai.details.has(id) && !force)) return;
  ai.loading.add(id);
  try {
    const { workspace } = await apiCall('GET', `/api/workspaces/${encodeURIComponent(id)}`);
    ai.details.set(id, workspace);
    ai.errors.delete(id);
  } catch (error) {
    ai.errors.set(id, error.message);
  } finally {
    ai.loading.delete(id);
  }
  const current = route();
  if (current.section === 'ai' && current.page === 'w' && current.extra === id) {
    renderKeepingInput();
    if (!current.more && ai.details.get(id)?.tasks?.length) scrollRunsToEnd();
  }
}

async function loadTree(id, force = false) {
  if (ai.trees.has(id) && !force) return;
  ai.trees.set(id, { loading: true });
  try {
    ai.trees.set(id, await apiCall('GET', `/api/workspaces/${encodeURIComponent(id)}/tree`));
  } catch (error) {
    ai.trees.set(id, { error: error.message });
  }
  const current = route();
  if (current.section === 'ai' && current.extra === id) renderKeepingInput();
}

async function loadGit(id, force = false) {
  if (ai.git.has(id) && !ai.git.get(id).error && !force) return;
  ai.git.set(id, { loading: true });
  try {
    ai.git.set(id, await apiCall('GET', `/api/workspaces/${encodeURIComponent(id)}/git`));
  } catch (error) {
    ai.git.set(id, { error: error.message });
  }
  const current = route();
  if (current.section === 'ai' && current.extra === id && current.more === 'changes') renderKeepingInput();
}

async function openWorkspaceFile(id, path) {
  ai.file = { id, path, loading: true };
  if (route().more !== 'files') go(`#/ai/w/${encodeURIComponent(id)}/files`); else renderKeepingInput();
  try {
    const file = await apiCall('GET', `/api/workspaces/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}`);
    if (ai.file?.path === path) ai.file = { id, ...file, original: file.content };
  } catch (error) {
    if (ai.file?.path === path) ai.file = { id, path, error: error.message };
  }
  renderKeepingInput();
}

function canRun(detail) {
  return detail && (detail.role === 'owner' || detail.role === 'run');
}

function allowedModes(detail) {
  const ceiling = ['read', 'edit', 'full'].indexOf(detail?.device?.allow || 'edit');
  return ['read', 'edit', 'full'].filter((mode, index) => index <= ceiling && (mode !== 'full' || detail.role === 'owner'));
}

function treeHtml(id) {
  const tree = ai.trees.get(id);
  if (!tree || tree.loading) return '<div class="loading-line"><span class="dots"><i></i><i></i><i></i></span></div>';
  if (tree.error) return `<div class="tree-error">${escapeHtml(tree.error)}<button class="text-link" data-action="refresh-tree" data-id="${escapeHtml(id)}">Повторить</button></div>`;
  const filter = ai.treeFilter.trim().toLowerCase();
  const entries = tree.entries || [];
  const visible = entries.filter(entry => {
    if (filter) return !entry.dir && entry.path.toLowerCase().includes(filter);
    const parent = entry.path.split('/').slice(0, -1);
    return parent.every((_, index) => ai.expanded.has(`${id}:${parent.slice(0, index + 1).join('/')}`));
  }).slice(0, 600);
  const rows = visible.map(entry => {
    const depth = filter ? 0 : entry.path.split('/').length - 1;
    const name = filter ? entry.path : entry.path.split('/').pop();
    const open = ai.expanded.has(`${id}:${entry.path}`);
    return entry.dir
      ? `<button class="tree-row dir ${open ? 'open' : ''}" style="--d:${depth}" data-action="tree-dir" data-id="${escapeHtml(id)}" data-path="${escapeHtml(entry.path)}">${icon(open ? 'chevronDown' : 'chevronRight')}<span>${escapeHtml(name)}</span></button>`
      : `<button class="tree-row ${ai.file?.path === entry.path ? 'active' : ''}" style="--d:${depth}" data-action="ws-file" data-id="${escapeHtml(id)}" data-path="${escapeHtml(entry.path)}">${icon(fileIcon(entry.path))}<span>${escapeHtml(name)}</span></button>`;
  }).join('');
  return `<label class="tree-search">${icon('search')}<input name="tree-filter" placeholder="Найти файл" value="${escapeHtml(ai.treeFilter)}" autocomplete="off" aria-label="Найти файл"></label><div class="tree">${rows || '<p class="muted-line">Пусто</p>'}${tree.truncated ? '<p class="fine">Показаны первые 4000 файлов</p>' : ''}</div>`;
}

function fileViewerHtml(detail) {
  const file = ai.file?.id === detail.id ? ai.file : null;
  if (!file) return `<div class="viewer-empty">${icon('doc')}<p>Выбери файл, чтобы посмотреть или поправить его</p></div>`;
  const editable = canRun(detail) && detail.device?.allow !== 'read' && typeof file.content === 'string';
  const dirty = editable && file.content !== file.original;
  let content;
  if (file.loading) content = '<div class="loading-line"><span class="dots"><i></i><i></i><i></i></span></div>';
  else if (file.error) content = `<p class="tree-error">${escapeHtml(file.error)}</p>`;
  else if (file.binary) content = '<p class="muted-line">Двоичный файл — здесь не показать</p>';
  else if (file.tooLarge) content = '<p class="muted-line">Файл больше 600 КБ — открой его на компьютере</p>';
  else content = `<textarea class="ws-editor" name="ws-file-editor" spellcheck="false" aria-label="Содержимое ${escapeHtml(file.path)}" ${editable ? '' : 'readonly'}>${escapeHtml(file.content)}</textarea>`;
  return `<div class="viewer"><div class="viewer-head"><button class="icon-btn compact-only" data-action="close-ws-file" aria-label="К файлам">${icon('chevronLeft')}</button><span class="file-name">${escapeHtml(file.path)}</span>${dirty ? `<button class="btn btn-primary btn-xs" data-action="save-ws-file">${icon('check')} Сохранить</button>` : editable ? '<small class="tag">можно править</small>' : '<small class="tag">чтение</small>'}</div>${content}</div>`;
}

function changesHtml(id) {
  const git = ai.git.get(id);
  if (!git || git.loading) return '<div class="loading-line"><span class="dots"><i></i><i></i><i></i></span></div>';
  if (git.error) return `<div class="tree-error">${escapeHtml(git.error)}<button class="text-link" data-action="refresh-git" data-id="${escapeHtml(id)}">Повторить</button></div>`;
  if (!git.isGit) return emptyState('branch', 'Папка без Git', '', 'Изменения видны в шагах задач. Чтобы видеть diff и историю, выполни в папке <code>git init</code>.');
  const filesList = git.files.length ? `<ul class="file-list">${git.files.map(file => `<li><b class="fs fs-${escapeHtml(file.status.replace(/\?/g, 'n'))}">${escapeHtml(file.status)}</b><button class="text-link inline" data-action="ws-file" data-id="${escapeHtml(id)}" data-path="${escapeHtml(file.path)}">${escapeHtml(file.path)}</button></li>`).join('')}</ul>` : '<p class="muted-line">Нет незакоммиченных изменений</p>';
  const log = git.log?.length ? `<h3 class="sheet-sub">Последние коммиты</h3><ul class="commit-list">${git.log.map(commit => `<li><code>${escapeHtml(commit.hash)}</code><span>${escapeHtml(commit.subject)}</span><small>${escapeHtml(commit.when)}</small></li>`).join('')}</ul>` : '';
  return `<div class="changes"><div class="changes-head"><span>${icon('branch')} ${escapeHtml(git.branch || 'ветка')}</span><button class="btn btn-ghost btn-xs" data-action="refresh-git" data-id="${escapeHtml(id)}">Обновить</button></div>${filesList}${git.diff ? unifiedDiffHtml(git.diff) : ''}${log}</div>`;
}

function accessHtml(detail) {
  if (detail.role !== 'owner') return emptyState('users', 'Доступ настраивает владелец', '', `Проект открыл @${escapeHtml(detail.ownerHandle)}`);
  const shares = detail.shares?.length
    ? detail.shares.map(share => `<div class="person-row">${avatar(share)}<span class="person-text"><b>${escapeHtml(share.name)}</b><small>@${escapeHtml(share.handle)} · ${share.role === 'run' ? 'ставит задачи' : 'смотрит'}</small></span><button class="icon-btn" data-action="remove-share" data-id="${escapeHtml(detail.id)}" data-handle="${escapeHtml(share.handle)}" aria-label="Закрыть доступ">${icon('close')}</button></div>`).join('')
    : '<p class="muted-line">Пока доступ только у тебя</p>';
  return `<div class="access"><form id="share-form" class="share-form" data-id="${escapeHtml(detail.id)}"><label class="handle-field"><span>@</span><input name="handle" placeholder="ник" maxlength="21" autocomplete="off" autocapitalize="none" aria-label="Ник пользователя" required></label><select name="role" aria-label="Права"><option value="view">Смотреть</option><option value="run">Ставить задачи</option></select><button class="btn btn-primary btn-sm" type="submit">Открыть</button></form><div class="share-list">${shares}</div><p class="fine">Задачи от приглашённых выполняются на твоём компьютере и расходуют твой лимит Claude или Codex. Полный доступ — только для тебя. Для открытого публичного доступа подключай движок через API-ключ по условиям провайдера.</p><h3 class="sheet-sub">Компьютер</h3><div class="device-row">${icon('code')}<span><b>${escapeHtml(detail.device?.name || 'Компьютер')}</b><small>${escapeHtml(detail.device?.platform || '')} · предел: ${escapeHtml(modeNames[detail.device?.allow] || '')} · ${lastSeenText(detail.device)}</small></span><button class="btn btn-ghost btn-xs" data-action="revoke-device" data-id="${escapeHtml(detail.device?.id || '')}">Отвязать</button></div></div>`;
}

function composerHtml(detail) {
  if (!canRun(detail)) return '<p class="composer-note">У тебя доступ только на просмотр</p>';
  const modes = allowedModes(detail);
  if (!modes.includes(ai.mode)) ai.mode = modes.includes('edit') ? 'edit' : modes[0];
  const engines = (detail.device?.engines || []).filter(engine => engine.ok);
  const engine = ai.engine[detail.id] || engines[0]?.id || 'demo';
  const hasSession = (detail.tasks || []).some(task => task.engine === engine && task.events?.some(event => event.sessionId));
  const notReady = (detail.device?.engines || []).filter(item => !item.ok && item.note);
  return `<form id="task-form" class="task-composer" data-id="${escapeHtml(detail.id)}">${taskFilesHtml(detail)}<textarea name="task-prompt" rows="1" maxlength="8000" placeholder="Что сделать в проекте?" aria-label="Задача для ИИ" required>${escapeHtml(ai.draft)}</textarea><div class="composer-row"><div class="mode-pick" role="radiogroup" aria-label="Режим">${modes.map(mode => `<label title="${escapeHtml(modeHints[mode])}"><input type="radio" name="task-mode" value="${mode}" ${mode === ai.mode ? 'checked' : ''}><span>${modeNames[mode]}</span></label>`).join('')}</div>${engines.length > 1 ? `<select name="task-engine" aria-label="Движок">${engines.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === engine ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select>` : `<span class="engine-name">${escapeHtml(engines[0]?.label || 'Демо')}</span>`}${hasSession ? `<label class="continue"><input type="checkbox" name="task-continue" ${ai.continueChat ? 'checked' : ''}><span>продолжить диалог</span></label>` : ''}<span class="composer-tools"><label class="cbtn" aria-label="Прикрепить файлы" title="Файлы, фото, видео, аудио">${icon('clip')}<input class="file-cover" type="file" multiple data-task-files="${escapeHtml(detail.id)}"></label>${voiceButton()}</span><button class="send" type="submit" aria-label="Отправить задачу" ${ai.sending ? 'disabled' : ''}>${icon('send')}</button></div>${notReady.length && engine === 'demo' ? `<p class="composer-note">${icon('lock')} ${escapeHtml(notReady[0].note)}</p>` : ''}</form>`;
}

function runsHtml(detail) {
  const tasks = detail.tasks || [];
  if (!tasks.length) {
    const suggestions = ['Объясни структуру проекта', 'Найди возможные ошибки', 'Напиши README для проекта', 'Что изменилось в последних коммитах?'];
    return `<div class="runs-empty"><span class="ai-orb">${icon('sparkle')}</span><h2>Что сделаем?</h2><p>Агент выполнит задачу на компьютере «${escapeHtml(detail.device?.name || '')}», а шаги появятся здесь.</p><div class="suggestions">${suggestions.map(text => `<button class="suggestion" data-action="prompt-chip" data-text="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}</div></div>`;
  }
  const linked = projects().find(project => project.workspaceId === detail.id && isMine(project.handle));
  const publish = task => linked && task.status === 'done' ? `${task.purpose === 'demo' && task.demoUrl && task.demoUrl !== linked.demo ? `<button class="btn btn-grad btn-sm turn-publish" data-action="demo-apply" data-id="${escapeHtml(linked.id)}" data-url="${escapeHtml(task.demoUrl)}">${icon('play')} Поставить веб-демо в пост</button>` : ''}<button class="btn btn-ghost btn-sm turn-publish" data-action="task-to-update" data-id="${escapeHtml(task.id)}" data-project="${escapeHtml(linked.id)}">${icon('send')} Опубликовать как обновление «${escapeHtml(linked.title)}»</button>` : '';
  return tasks.map(task => `<div class="turn"><div class="turn-prompt"><p>${escapeHtml(task.prompt)}</p>${attachmentsHtml(task.attachments)}<small>${task.handle && !isMine(task.handle) ? `@${escapeHtml(task.handle)} · ` : ''}${escapeHtml(modeNames[task.mode] || '')} · ${clockTime(task.createdAt)}</small></div>${renderRun(task, { canCancel: detail.role === 'owner' || isMine(task.handle) })}${publish(task)}</div>`).join('');
}

function renderWorkspace(id, tab = '') {
  if (!online) return `<div class="page">${aiNav('')}<div class="note">${icon('lock')}<p>Проекты с компьютера открываются на сервере про.стим.</p></div></div>`;
  if (!me) return `<div class="page">${aiNav('')}<div class="narrow-block">${loginCard('Войди, чтобы открыть проект')}</div></div>`;
  const detail = ai.details.get(id);
  if (!detail) {
    const error = ai.errors.get(id);
    return `<div class="page">${aiNav('')}${error ? emptyState('folder', 'Проект недоступен', '<a class="btn btn-ghost" href="#/ai">К проектам</a>', escapeHtml(error)) : '<div class="loading-line big"><span class="dots"><i></i><i></i><i></i></span></div>'}</div>`;
  }
  const tabs = [['', 'sparkle', 'Задачи'], ['files', 'folder', 'Файлы'], ['changes', 'branch', 'Изменения'], ...(detail.role === 'owner' ? [['access', 'users', 'Доступ']] : [])];
  const active = tabs.some(([key]) => key === tab) ? tab : '';
  const base = `#/ai/w/${encodeURIComponent(id)}`;
  const tabBar = `<nav class="ws-nav" aria-label="Разделы проекта">${tabs.map(([key, iconName, label]) => `<a href="${base}${key ? `/${key}` : ''}" class="${key === active ? 'on' : ''}" ${key === active ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></a>`).join('')}</nav>`;
  let content;
  if (active === 'files') content = `<div class="files-layout ${ai.file?.id === id ? 'has-file' : ''}"><aside class="files-tree">${treeHtml(id)}</aside><section class="files-view">${fileViewerHtml(detail)}</section></div>`;
  else if (active === 'changes') content = changesHtml(id);
  else if (active === 'access') content = accessHtml(detail);
  else content = `<div class="runs" id="runs">${runsHtml(detail)}</div><div class="composer-dock">${detail.device?.online ? '' : `<p class="offline-note">${icon('lock')} Компьютер не в сети — задача начнётся, когда агент подключится</p>`}${composerHtml(detail)}</div>`;
  return `<div class="page ws-page ${active ? '' : 'tasks'}"><header class="ws-head" data-ws-head="${escapeHtml(id)}">${workspaceHeadInner(detail)}</header>${tabBar}${content}</div>`;
}

function workspaceHeadInner(detail) {
  const linked = projects().find(project => project.workspaceId === detail.id && isMine(project.handle));
  return rawWorkspaceHeadInner(detail) + (linked ? `<button class="ws-project" data-action="hub-open" data-id="${escapeHtml(linked.id)}" data-tab="code">${icon('grid')}<span>${escapeHtml(linked.title)}</span></button>` : '');
}

function rawWorkspaceHeadInner(detail) {
  return `<a class="icon-btn" href="#/ai" aria-label="К проектам">${icon('chevronLeft')}</a><span class="ws-head-icon">${icon('folder')}<i class="presence ${detail.device?.online ? 'on' : ''}"></i></span><span class="ws-head-text"><b>${escapeHtml(detail.name)}</b><small>${escapeHtml(detail.device?.name || '')} · ${lastSeenText(detail.device)}${detail.branch ? ` · ${escapeHtml(detail.branch)}` : ''}${detail.role !== 'owner' ? ` · от @${escapeHtml(detail.ownerHandle)}` : ''}</small></span>`;
}

function updateWorkspaceHead(id) {
  const detail = ai.details.get(id);
  const head = document.querySelector(`[data-ws-head="${id}"]`);
  if (detail && head) head.innerHTML = workspaceHeadInner(detail);
  const note = document.querySelector('.offline-note');
  if (detail?.device?.online && note) note.remove();
  else if (detail && !detail.device?.online && !note && !route().more) renderKeepingInput();
}

function afterAiRender(current, changedPage) {
  const page = current.page === 'connections' ? 'connect' : current.page;
  if (page === 'connect' && !current.extra) ensurePairCode();
  if (page === 'w' && current.extra) {
    loadWorkspace(current.extra);
    const detail = ai.details.get(current.extra);
    if (detail && current.more === 'files') loadTree(current.extra);
    if (detail && current.more === 'changes') loadGit(current.extra);
    if (changedPage && !current.more) { if (detail?.tasks?.length) scrollRunsToEnd(); else window.scrollTo?.(0, 0); }
  }
}

function scrollRunsToEnd() {
  (globalThis.requestAnimationFrame || setTimeout)(() => window.scrollTo?.(0, document.body.scrollHeight || 0));
}

function patchRun(task, detail) {
  const card = document.querySelector(`[data-run="${globalThis.CSS?.escape ? CSS.escape(task.id) : task.id}"]`);
  if (!card?.querySelectorAll) return false;
  const open = [...card.querySelectorAll('details')].map(element => element.open);
  const nearBottom = window.innerHeight + window.scrollY >= (document.body.scrollHeight || 0) - 240;
  card.outerHTML = renderRun(task, { canCancel: detail.role === 'owner' || isMine(task.handle) });
  const next = document.querySelector(`[data-run="${globalThis.CSS?.escape ? CSS.escape(task.id) : task.id}"]`);
  next?.querySelectorAll('details').forEach((element, index) => { if (open[index] !== undefined) element.open = open[index]; });
  if (nearBottom) window.scrollTo?.(0, document.body.scrollHeight || 0);
  return true;
}

function onTaskEvent({ workspaceId, task, events = [] }) {
  if (!task) return;
  const summary = ai.workspaces.find(workspace => workspace.id === workspaceId);
  if (summary) summary.lastTask = task;
  const detail = ai.details.get(workspaceId);
  const current = route();
  const visible = current.section === 'ai' && current.page === 'w' && current.extra === workspaceId;
  if (current.section === 'ai' && !current.page) renderKeepingInput();
  if (!detail) return;
  let entry = detail.tasks.find(item => item.id === task.id);
  const isNew = !entry;
  if (!entry) { entry = { ...task, events: [] }; detail.tasks.push(entry); }
  const known = entry.events.reduce((max, item) => Math.max(max, item.seq || 0), 0);
  Object.assign(entry, task, { events: [...entry.events, ...events.filter(item => !item.seq || item.seq > known)] });
  if (!visible || current.more) return;
  if (isNew || !patchRun(entry, detail)) { renderKeepingInput(); scrollRunsToEnd(); }
  if (['done', 'error'].includes(task.status)) { ai.git.delete(workspaceId); if (ai.trees.has(workspaceId) && events.some(event => event.kind === 'changes')) loadTree(workspaceId, true); }
}

if (typeof setInterval === 'function') setInterval(() => {
  const current = route();
  if (current.section !== 'ai' || current.page !== 'w') return;
  const detail = ai.details.get(current.extra);
  for (const task of detail?.tasks || []) {
    if (!isActive(task.status)) continue;
    const element = document.querySelector(`[data-run="${task.id}"] [data-run-meta]`);
    if (element) element.textContent = runMeta(task);
  }
}, 1000);

/* Task attachments: picked files upload right away (with progress), then go with the task to the computer */

const TASK_FILE_LIMIT = 25 * 1024 * 1024;
const fileKindIcons = { image: 'image', video: 'film', audio: 'music', file: 'file' };

function localFileKind(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac|flac|opus)$/i.test(file.name)) return 'audio';
  return 'file';
}

function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

// Compares dotted versions as numbers, so 0.10.0 counts as newer than 0.3.0.
function versionAtLeast(version, minimum) {
  const have = String(version || '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const need = minimum.split('.').map(Number);
  for (let index = 0; index < need.length; index += 1) if ((have[index] || 0) !== need[index]) return (have[index] || 0) > need[index];
  return true;
}

function taskFilesHtml(detail) {
  const list = ai.attachments[detail.id] || [];
  if (!list.length) return '';
  const old = detail.device && !versionAtLeast(detail.device.version, '0.3.0');
  return `<div class="task-files">${list.map(item => `<span class="task-file ${item.status}" data-file="${item.localId}">${item.kind === 'image' && item.preview ? `<img src="${escapeHtml(item.preview)}" alt="">` : `<i>${icon(fileKindIcons[item.kind] || 'file')}</i>`}<span><b>${escapeHtml(item.name)}</b><small>${item.status === 'error' ? escapeHtml(item.error) : item.status === 'uploading' ? `${Math.round(item.progress * 100)}%` : fileSize(item.size)}</small></span><button type="button" data-action="remove-task-file" data-id="${escapeHtml(detail.id)}" data-file="${item.localId}" aria-label="Убрать файл">${icon('close')}</button></span>`).join('')}</div>${old ? `<p class="composer-note">${icon('download')} Чтобы компьютер получал файлы, обнови агента: запусти команду подключения ещё раз.</p>` : ''}`;
}

function refreshTaskFiles(workspaceId) {
  const form = document.querySelector('#task-form');
  if (!form || form.dataset.id !== workspaceId) return;
  const detail = ai.details.get(workspaceId);
  form.querySelectorAll('.task-files, .task-files + .composer-note').forEach(element => element.remove());
  form.insertAdjacentHTML('afterbegin', taskFilesHtml(detail));
}

function uploadTaskFile(file, onProgress, holder) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    holder.request = request;
    request.open('POST', '/api/files');
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onload = () => {
      let data = {};
      try { data = JSON.parse(request.responseText || '{}'); } catch { data = {}; }
      if (request.status >= 200 && request.status < 300 && data.id) resolve(data); else reject(new Error(data.error || `Ошибка загрузки ${request.status}`));
    };
    request.onerror = () => reject(new Error('Нет связи'));
    request.onabort = () => reject(new Error('Отменено'));
    request.send(file);
  });
}

function addTaskFiles(workspaceId, fileList) {
  const list = (ai.attachments[workspaceId] ||= []);
  for (const file of Array.from(fileList).slice(0, Math.max(0, 8 - list.length))) {
    const item = { localId: `t${++mediaSeq}`, name: file.name, size: file.size, kind: localFileKind(file), status: 'uploading', progress: 0, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' };
    list.push(item);
    if (file.size > TASK_FILE_LIMIT) { item.status = 'error'; item.error = 'больше 25 МБ'; continue; }
    item.task = uploadTaskFile(file, progress => {
      item.progress = progress;
      const small = document.querySelector(`[data-file="${item.localId}"] small`);
      if (small) small.textContent = `${Math.round(progress * 100)}%`;
    }, item).then(data => { item.id = data.id; item.status = 'done'; }, error => { item.status = 'error'; item.error = error.message; }).finally(() => refreshTaskFiles(workspaceId));
  }
  if (fileList.length > 8) toast('К задаче — до 8 файлов');
  refreshTaskFiles(workspaceId);
}

function attachmentsHtml(attachments) {
  return attachments?.length ? `<div class="run-files">${attachments.map(item => `<span>${icon(fileKindIcons[item.kind] || 'file')}${escapeHtml(item.filename)}</span>`).join('')}</div>` : '';
}

async function submitTask(form) {
  const id = form.dataset.id;
  const detail = ai.details.get(id);
  const data = new FormData(form);
  const prompt = String(data.get('task-prompt') || '').trim();
  if (!prompt || !detail || ai.sending) return;
  ai.sending = true;
  ai.mode = String(data.get('task-mode') || ai.mode);
  const engines = (detail.device?.engines || []).filter(engine => engine.ok);
  const engine = String(data.get('task-engine') || ai.engine[id] || engines[0]?.id || 'demo');
  ai.engine[id] = engine;
  const continueChat = data.has('task-continue') ? data.get('task-continue') === 'on' : false;
  dictation?.stop();
  try {
    const files = ai.attachments[id] || [];
    await Promise.all(files.filter(item => item.task).map(item => item.task));
    if (files.some(item => item.status === 'error')) throw new Error('Убери файлы с ошибкой');
    const { task } = await apiCall('POST', `/api/workspaces/${encodeURIComponent(id)}/tasks`, { prompt, mode: ai.mode, engine, continue: continueChat, attachments: files.map(item => item.id) });
    if (!detail.tasks.some(item => item.id === task.id)) detail.tasks.push(task);
    for (const item of files) if (item.preview) URL.revokeObjectURL(item.preview);
    ai.attachments[id] = [];
    ai.draft = '';
    ai.sending = false;
    render();
    scrollRunsToEnd();
  } catch (error) {
    ai.sending = false;
    toast(error.message);
    renderKeepingInput();
  }
}

function renderEditor() {
  const panes = [['files', 'folder', 'Файлы'], ['code', 'code', 'Код'], ['assistant', 'sparkle', 'ИИ']];
  const welcome = `<div class="ai-welcome"><span class="ai-orb">${icon('sparkle')}</span><h2>Редактор в браузере</h2><p class="muted-line">Открывай папку, GitHub или пример, правь файлы и скачивай. Задачи для ИИ — в подключённых проектах.</p><div class="suggestions"><button class="suggestion" data-action="sample-prompt">Разобраться в проекте</button><button class="suggestion" data-action="explain-file">Объяснить ${escapeHtml(selectedFile?.path || 'файл')}</button><button class="suggestion" data-action="readme">${icon('download')} README</button></div></div>`;
  const chat = messages.length ? messages.map(message => `<div class="msg ${message.role}">${escapeHtml(message.text)}${message.link ? `<a class="btn btn-primary btn-xs" href="${message.link}">Подключить компьютер</a>` : ''}</div>`).join('') : welcome;
  return `<div class="page wide">${aiNav('editor')}<div class="ws-head-editor">${sourceChip('#/ai/connect/folder')}</div><div class="ws-tabs" role="tablist">${panes.map(([id, iconName, label]) => `<button class="${workspacePane === id ? 'on' : ''}" data-action="pane" data-id="${id}" role="tab" aria-selected="${workspacePane === id}">${icon(iconName)}${label}</button>`).join('')}</div><div class="workspace" data-pane="${workspacePane}"><aside class="pane pane-files"><div class="pane-head"><b>Файлы проекта</b><span>${files.length}</span></div>${files.slice(0, 150).map(file => `<button class="file-row ${selectedFile?.path === file.path ? 'active' : ''}" data-action="file" data-path="${escapeHtml(file.path)}">${icon(fileIcon(file.path))}<span>${escapeHtml(file.path)}</span></button>`).join('')}<button class="add-source" data-action="connections">${icon('plus')} Источник</button></aside><section class="pane pane-code"><div class="pane-head"><span class="file-name">${escapeHtml(selectedFile?.path || 'Файл не выбран')}</span><span class="pane-actions"><button class="icon-btn" data-action="download-file" aria-label="Скачать файл">${icon('download')}</button>${selectedFile?.handle ? `<button class="icon-btn accent" data-action="write-file" aria-label="Сохранить в папку">${icon('check')}</button>` : ''}</span></div><textarea id="file-editor" aria-label="Содержимое файла" spellcheck="false">${escapeHtml(selectedFile?.content || '')}</textarea></section><section class="pane pane-ai"><div class="pane-head"><b>${icon('sparkle')} Помощник</b><small class="tag">без модели</small></div><div class="chat" id="chat">${chat}</div><form id="prompt-form" class="composer"><label class="sr-only" for="prompt">Задача для проекта</label><textarea id="prompt" name="prompt" rows="1" placeholder="Опиши задачу…" required>${escapeHtml(promptDraft)}</textarea><button type="submit" aria-label="Отправить задачу">${icon('send')}</button></form></section></div></div>`;
}

/* Dialogs */

function showDialog(content, context = null) {
  const wasOpen = modal.open;
  dialogContext = context;
  modal.dataset.kind = context?.kind || '';
  modal.innerHTML = `<div class="grabber" aria-hidden="true"></div><button class="modal-close" data-action="close-modal" aria-label="Закрыть">${icon('close')}</button>${content}`;
  // On phones a post opens at 70% of the screen and grows to full height once it is scrolled.
  const detent = context?.kind === 'project' && isPhone() ? (wasOpen && sheetDetent === 'full' ? 'full' : 'half') : 'full';
  if (!wasOpen) {
    resetSheet();
    sheetDetent = detent;
    if (detent === 'half') setSheetOffset(0);
    modal.showModal();
    modal.focus?.({ preventScroll: true });
    modal.scrollTop = 0;
  } else if (detent !== sheetDetent) {
    sheetDetent = detent;
    setSheetOffset(0, true);
  }
  modal.dataset.detent = sheetDetent;
}

function isPhone() {
  return Boolean(window.matchMedia?.('(max-width: 760px)').matches);
}

function closeDialog() {
  if (swapPlayerForReview()) return;
  connectionVersion += 1;
  if (dialogContext?.kind === 'publish' && dialogContext.id && projectById(dialogContext.id)) {
    const id = dialogContext.id;
    postDraft = null;
    clearPublishMedia();
    openProject(id);
    return;
  }
  if (modal.open) modal.close();
  dialogContext = null;
  if (route().section === 'project') {
    if (projectOpenedFromApp) {
      projectOpenedFromApp = false;
      history.back();
    } else location.hash = '#/feed';
  }
}

function navigateToProject(id) {
  trackSignal(projectById(id), 'open');
  projectOpenedFromApp = true;
  location.hash = `#/project/${encodeURIComponent(id)}`;
}

function commentsHtml(project) {
  return `<div class="comments-zone" data-comments="${escapeHtml(project.id)}">${commentsInner(project)}</div>`;
}

// Interest of a post: support, saves and how much of it people actually watch.
function interestHtml(project) {
  const stats = cleanStats(statsFor(project));
  const quality = projectQuality({ ...project, votes: voteCount(project), saves: savesCount(project) }, stats);
  const score = Math.round(quality.score * 100);
  const items = [
    ['up', voteCount(project), 'поддержали'],
    ['bookmark', savesCount(project), 'сохранили'],
    ['clock', stats.impressions ? `${Math.round(quality.retention * 100)}%` : '—', 'досмотрели'],
    ['eye', number.format(stats.impressions), 'показов']
  ];
  return `<div class="interest"><div class="interest-head"><span>${icon('flame')} Интерес</span><i class="interest-meter"><i style="width:${score}%"></i></i><b>${score}</b></div><div class="interest-stats">${items.map(([iconName, value, label]) => `<span>${icon(iconName)}<b>${value}</b><small>${label}</small></span>`).join('')}</div></div>`;
}

const linkCta = { steam: 'В Steam', vkplay: 'В VK Play', itch: 'На itch.io', gog: 'В GOG', github: 'Код на GitHub', gitlab: 'Код на GitLab', appstore: 'В App Store', gplay: 'В Google Play', rustore: 'В RuStore', telegram: 'В Telegram', discord: 'В Discord', youtube: 'На YouTube', vk: 'Во VK', figma: 'В Figma' };

function externalLink(url, className, inner) {
  return `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow ugc">${inner}</a>`;
}

function storeGalleryHtml(project) {
  const count = slideKinds(project).length;
  const slidesHtml = Array.from({ length: count }, (_, index) => `<div class="store-slide" data-action="view-media" data-id="${escapeHtml(project.id)}" data-index="${index}" role="button" aria-label="Открыть на весь экран">${scene(project, index, 'preview')}</div>`).join('');
  const controls = count > 1
    ? `<button class="gallery-arrow prev" data-action="gallery" data-direction="-1" aria-label="Назад">${icon('chevronLeft')}</button><button class="gallery-arrow next" data-action="gallery" data-direction="1" aria-label="Дальше">${icon('chevronRight')}</button><div class="store-dots" aria-hidden="true">${Array.from({ length: count }, (_, index) => `<i class="${index ? '' : 'on'}"></i>`).join('')}</div>`
    : '';
  return `<div class="store-media"><div class="store-gallery">${slidesHtml}</div>${controls}</div>`;
}

function storeLinksHtml(project) {
  const links = (project.links?.length ? project.links : [project.url]).map(linkKind).filter(Boolean);
  const [first, ...rest] = links;
  const rating = demoRatingText(project);
  const play = project.demo ? `<button class="btn btn-grad store-cta" data-action="play-demo" data-id="${escapeHtml(project.id)}">${icon('play')} Играть в браузере${rating ? ` <small class="cta-rating">★${rating} · ${project.demoRating.count}</small>` : ''}</button>` : '';
  const tracked = html => html.replace('<a ', `<a data-action="post-link" data-id="${escapeHtml(project.id)}" `);
  const primary = play ? play + (first ? tracked(externalLink(first.url, 'link-pill', `${icon(first.icon)}${escapeHtml(linkCta[first.kind] || first.label)}`)) : '') : first
    ? tracked(externalLink(first.url, 'btn btn-primary store-cta', `${icon(first.icon)} ${escapeHtml(first.kind === 'steam' && project.steam?.status === 'coming' ? 'В желаемое Steam' : linkCta[first.kind] || 'Открыть сайт')}`))
    : project.id === 'contour' ? `<button class="btn btn-primary store-cta" data-action="open-demo">${icon('play')} Попробовать</button>` : '';
  const trailer = safeUrl(project.video) ? externalLink(safeUrl(project.video), 'link-pill', `${icon('play')}Трейлер`) : '';
  const pills = rest.map(link => externalLink(link.url, 'link-pill', `${icon(link.icon)}${escapeHtml(link.label)}`)).join('');
  return primary || trailer || pills ? `<div class="store-cta-row">${primary}${trailer}${pills}</div>` : '';
}

function storeFactsHtml(project) {
  const list = (options, keys) => (keys || []).map(key => labelOf(options, key)).filter(Boolean).join(', ');
  const made = [...(project.ai ? ['ИИ'] : []), ...(project.madeWith || [])].join(', ');
  const facts = [
    ['flag', 'Стадия', labelOf(postStages, project.stage)],
    ['monitor', 'Платформы', list(postPlatforms, project.platforms)],
    ['coins', 'Цена', labelOf(postPricing, project.pricing)],
    ['users', 'Автор ищет', list(postSeeking, project.seeking)],
    [project.ai ? 'sparkle' : 'code', 'Сделано с', made]
  ].filter(([, , value]) => value);
  return facts.length ? `<div class="store-facts">${facts.map(([iconName, label, value]) => `<div class="fact">${icon(iconName)}<span><small>${label}</small><b>${escapeHtml(value)}</b></span></div>`).join('')}</div>` : '';
}

function openProject(id) {
  const project = projectById(id);
  if (!project) return;
  const projectId = escapeHtml(project.id);
  const mine = isMine(project.handle);
  const theme = cleanTheme(project.theme);
  ensureFonts(fontFamiliesFor(project));
  const write = mine ? '' : `<a class="btn btn-ghost btn-square" href="#/inbox/${encodeURIComponent(project.handle)}" aria-label="Написать автору" title="Написать автору">${icon('inbox')}</a>`;
  const edit = mine && (online || project.handle === 'me') ? `<button class="btn btn-ghost" data-action="edit-project" data-id="${projectId}">${icon('pen')} Редактировать</button>` : '';
  const remove = mine && online ? `<button class="btn btn-ghost btn-square" data-action="delete-project" data-id="${projectId}" aria-label="Удалить проект">${icon('trash')}</button>` : '';
  const promotion = mine && online ? promotionHtml(project) : '';
  const page = project.page?.length ? pageHtml(project.page) : project.description && project.description !== project.summary ? `<p class="pb pb-text">${escapeHtml(project.description)}</p>` : '';
  const follow = mine ? '' : followPill(project.handle, 'small');
  document.querySelectorAll?.('video[data-feed-video]').forEach(video => video.pause?.());
  showDialog(`<article class="store ${themeClass(theme)}" style="${themeVars(theme)}"><div class="store-top">${storeGalleryHtml(project)}<div class="store-head"><div class="sheet-author"><button class="author-link" data-action="profile" data-handle="${escapeHtml(project.handle)}">${ringAvatar(project, '', userByHandle(project.handle), true)}<span><b>${escapeHtml(project.author)}${plusBadge(userByHandle(project.handle))}</b><small>${escapeHtml(categoryNames[project.category])}${project.createdAt ? ` · ${timeAgo(project.createdAt)}` : ''}</small></span></button>${follow}</div><h2 id="modal-title" class="store-title">${escapeHtml(project.title)}</h2><p class="store-summary">${escapeHtml(project.summary)}</p>${storeLinksHtml(project)}${storeFactsHtml(project)}${visibleTags(project).length ? `<div class="chips">${visibleTags(project).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}</div></div>${page ? `<div class="store-page">${page}</div>` : ''}${updatesHtml(project)}<div class="store-foot"><div data-playtest>${playtestCardHtml(project)}</div>${projectHubHtml(project) || promotion}${interestHtml(project)}<div class="sheet-actions">${edit}${watchButton(project)}${write}${mine ? '' : `<button class="btn btn-ghost btn-square" data-action="vote" data-id="${projectId}" aria-pressed="${state.votes.includes(project.id)}" aria-label="Поддержать">${icon('up')}</button>`}<button class="btn btn-ghost btn-square" data-action="share" data-id="${projectId}" aria-label="Поделиться">${icon('share')}</button>${mine ? '' : `<button class="btn btn-ghost btn-square" data-action="post-menu" data-id="${projectId}" aria-label="Ещё" title="Ещё">${icon('more')}</button>`}${remove}</div><h3 class="sheet-sub">Комментарии <span>${commentCount(project)}</span></h3>${commentsHtml(project)}</div></article>`, { kind: 'project', id });
  const gallery = modal.querySelector?.('.store-gallery');
  if (gallery) loopTrack(gallery, 0, index => syncGalleryDots(gallery, index));
}

/* Promotion and Plus: buying reach, and what it shows */

const rub = value => `${Number(value).toLocaleString('ru-RU')} ₽`;
const shortDate = time => new Date(time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const hasPlusNow = () => Boolean(remote?.account?.plusUntil > Date.now());

function promotionFor(projectId) {
  const list = (remote?.promotions || []).filter(item => item.projectId === projectId);
  return list.find(item => item.status === 'active') || list.find(item => item.status === 'pending') || null;
}

// The owner sees the campaign on the post: impressions so far, taps, the end date — or an offer to start one.
function promotionHtml(project) {
  const promotion = promotionFor(project.id);
  const id = escapeHtml(project.id);
  if (promotion?.status === 'active') {
    const share = Math.min(100, Math.round(promotion.shown / Math.max(1, promotion.impressions) * 100));
    return `<div class="promo-status"><div class="promo-top"><span class="promo-live"><i></i>Продвигается</span><small>до ${shortDate(promotion.endsAt)}</small></div><div class="promo-bar"><i style="width:${share}%"></i></div><div class="promo-nums"><span><b>${promotion.shown.toLocaleString('ru-RU')}</b> из ${promotion.impressions.toLocaleString('ru-RU')} показов</span><span><b>${promotion.clicks}</b> переходов</span></div></div>`;
  }
  if (promotion?.status === 'pending') return `<div class="promo-status pending"><div class="promo-top"><span class="promo-live wait"><i></i>Ждёт оплаты</span><button class="link-btn" data-action="boost" data-id="${id}">Оплатить</button></div></div>`;
  return `<button class="promo-offer" data-action="boost" data-id="${id}"><span class="promo-icon">${icon('megaphone')}</span><span><b>Продвинуть пост</b><small>Покажем его в ленте между постами — от ${rub(boostPrice(boostPlans[0], hasPlusNow()))}</small></span>${icon('chevronRight')}</button>`;
}

function openBoost(projectId) {
  if (needLogin('Чтобы продвигать проекты, войди в аккаунт')) return;
  const project = projectById(projectId);
  if (!project) return;
  const plus = hasPlusNow();
  const plans = boostPlans.map(plan => `<label class="plan"><input type="radio" name="plan" value="${plan.id}" data-price="${boostPrice(plan, plus)}" ${plan.best ? 'checked' : ''}><span class="plan-card">${plan.best ? '<i class="plan-best">Выгодно</i>' : ''}<b>${plan.title}</b><em>до ${plan.impressions.toLocaleString('ru-RU')} показов</em><strong>${rub(boostPrice(plan, plus))}</strong>${plus ? `<s>${rub(plan.price)}</s>` : ''}</span></label>`).join('');
  const chosen = boostPlans.find(plan => plan.best) || boostPlans[0];
  const mode = remote?.config?.payments;
  showDialog(`<div class="sheet-body boost"><span class="boost-mark">${icon('megaphone')}</span><h2 id="modal-title">Продвинуть «${escapeHtml(project.title)}»</h2>${boostGiftsHtml(project)}<p class="lead">Пост будет появляться в ленте у других людей после каждых ${AD_EVERY} постов, с пометкой «Реклама». Перед ним край ленты подсвечивается и рекламу можно пропустить — смотрят те, кому интересно.</p><form id="boost-form" class="form" data-id="${escapeHtml(project.id)}"><div class="plan-grid">${plans}</div><p class="fine">Показ засчитывается один раз на человека за полчаса. Подписчики Плюс рекламу не видят.${plus ? ' Твоя скидка Плюс уже учтена.' : ''}</p>${mode === 'test' ? `<p class="test-note">${icon('lock')} Тестовый режим: оплата ещё не подключена, деньги не списываются.</p>` : ''}<p class="form-error" role="alert"></p><button class="btn btn-grad btn-block" type="submit" ${mode ? '' : 'disabled'}>${mode ? `Оплатить <span data-boost-price>${rub(boostPrice(chosen, plus))}</span>` : 'Оплата скоро появится'}</button></form></div>`, { kind: 'boost', id: projectId });
}

// A quiet row in the profile settings; the loud offer only ever appears as an ad slot in the feed.
function plusRowHtml() {
  if (hasPlusNow()) return `<button class="plus-row on" data-action="plus"><span class="plus-mark small">${icon('crown')}</span><span><b>про.стим Плюс</b><small>Активен до ${shortDate(remote.account.plusUntil)}</small></span><em>Продлить</em></button>`;
  return `<button class="plus-row" data-action="plus"><span class="plus-mark small">${icon('crown')}</span><span><b>про.стим Плюс</b><small>Без рекламы · ${rub(plusPlan.price)} в месяц</small></span>${icon('chevronRight')}</button>`;
}

const paywallReasons = {
  prompt: ['sparkle', 'Промпт с ИИ — часть Плюса', 'ИИ прочитает README, файлы и обсуждение и превратит короткий отзыв в точную задачу для агента'],
  plus: ['crown', 'Больше возможностей во всех разделах', 'Лента без рекламы, ИИ-мир без тесных лимитов и заявки в Steam без очереди'],
  voice: ['mic', 'Голосовые комментарии — в Плюсе', 'Наговори отзыв до двух минут: автору проще понять, где ты застрял'],
  look: ['palette', 'Оформи профиль по-своему', 'Анимированный фон, GIF или видео на аватарке и свой цвет профиля']
};
let paywallAfter = null;

// The offer: what Plus gives, a free day for people who never had it, the first month at half price.
function openPaywall(reason = 'plus', after = null) {
  if (needLogin('Чтобы попробовать Плюс, войди в аккаунт')) return;
  paywallAfter = after;
  const [iconName, title, text] = paywallReasons[reason] || paywallReasons.plus;
  const account = remote?.account || {};
  const price = account.plusPrice || plusPlan.price;
  const discount = price < plusPlan.price ? Math.round((1 - price / plusPlan.price) * 100) : 0;
  const mode = remote?.config?.payments;
  const perks = [['crown', 'Значок Плюса у имени'], ['palette', 'Анимированный профиль: фон, GIF или видео на аватарке, свой цвет'], ['mic', 'Голосовые комментарии'], ['sparkle', 'Промпт с ИИ из любого комментария'], ['eyeOff', 'Лента без рекламы'], ['megaphone', `−${Math.round(PLUS_DISCOUNT * 100)}% на продвижение и день в подарок каждый месяц`], ['users', `До ${playtestSlots.plus} тестеров в тест-задании и место выше в списке`], ['monitor', 'ИИ-мир и Steam: больше компьютеров, заявка без очереди']];
  const trial = account.plusTrial ? `<button class="btn btn-grad btn-block pw-trial" data-action="plus-trial">${icon('sparkle')} Попробовать бесплатно · ${plusPlan.trialHours} часа</button><small class="pw-fine">Без карты. Через сутки Плюс просто выключится — ничего не спишется.</small>` : '';
  const buy = mode ? `<button class="pw-buy ${trial ? '' : 'main'}" data-action="plus-pay"><span><b>${discount ? 'Первый месяц' : 'Месяц'} за ${rub(price)}</b><small>${discount ? `<s>${rub(plusPlan.price)}</s> дальше ${rub(plusPlan.price)} в месяц` : `${plusPlan.days} дней, без автопродления`}</small></span>${discount ? `<em>−${discount}%</em>` : icon('chevronRight')}</button>` : '<p class="pw-fine">Оплата скоро появится</p>';
  const sparks = sparksBalance() >= sparkPrices.plusWeek ? `<button class="gift-row" data-action="plus-sparks"><span class="row-mark">${icon('sparkle')}</span><span><b>Неделя за ${sparkPrices.plusWeek} искр</b><small>У тебя ${sparksBalance()} искр</small></span>${icon('chevronRight')}</button>` : '';
  openLayer(`<div class="paywall"><button class="icon-btn pw-close" data-action="layer-close" aria-label="Закрыть">${icon('close')}</button><div class="pw-hero"><i class="pw-orb a"></i><i class="pw-orb b"></i><i class="pw-orb c"></i><span class="pw-crown">${icon(iconName)}</span><span class="pw-kicker">${icon('crown')} ${escapeHtml(plusPlan.title)}</span><h2 id="layer-title">${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></div><ul class="pw-perks">${perks.map(([name, label], index) => `<li style="--i:${index}">${icon(name)}<span>${escapeHtml(label)}</span></li>`).join('')}</ul><details class="plus-more pw-compare"><summary>Сравнить: без Плюса и с Плюсом</summary>${plusCompareHtml()}</details><div class="pw-offer">${trial}${buy}${sparks}${mode === 'test' ? `<p class="test-note">${icon('lock')} Тестовый режим: деньги не списываются.</p>` : ''}</div></div>`, 'paywall');
}

async function startPlusTrial(button) {
  button.disabled = true;
  try {
    const result = await apiCall('POST', '/api/plus/trial');
    if (remote?.account) Object.assign(remote.account, { plusUntil: result.plusUntil, plusTrial: false, plusTrialNow: true });
    closeLayer();
    toast('Плюс включён на 24 часа — пробуй');
    const after = paywallAfter;
    paywallAfter = null;
    await reloadAll({ rerender: !modal.open });
    after?.();
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
}

function openPlus() {
  if (needLogin('Чтобы оформить Плюс, войди в аккаунт')) return;
  if (!hasPlusNow()) { openPaywall('plus'); return; }
  closeLayer();
  const mode = remote?.config?.payments;
  const until = hasPlusNow() ? `<p class="fine">Сейчас Плюс действует до ${shortDate(remote.account.plusUntil)} — новый месяц добавится сверху.</p>` : '';
  showDialog(`<div class="sheet-body plus-sheet"><span class="plus-mark big">${icon('crown')}</span><h2 id="modal-title">${plusPlan.title}</h2><p class="plus-price"><b>${rub(plusPlan.price)}</b> в месяц</p><ul class="plus-perks">${plusPlan.perks.map(perk => `<li>${icon('check')}${escapeHtml(perk)}</li>`).join('')}</ul><details class="plus-more"><summary>Без Плюса и с Плюсом</summary>${plusCompareHtml()}</details>${until}${sparksBalance() >= sparkPrices.plusWeek ? `<button class="gift-row" data-action="plus-sparks"><span class="row-mark">${icon('sparkle')}</span><span><b>Неделя Плюса за ${sparkPrices.plusWeek} искр</b><small>У тебя ${sparksBalance()} искр</small></span>${icon('chevronRight')}</button>` : ''}${mode === 'test' ? `<p class="test-note">${icon('lock')} Тестовый режим: оплата ещё не подключена, деньги не списываются.</p>` : ''}<button class="btn btn-grad btn-block" data-action="plus-pay" ${mode ? '' : 'disabled'}>${mode ? `Продлить на месяц за ${rub(remote?.account?.plusPrice || plusPlan.price)}` : 'Оплата скоро появится'}</button></div>`, { kind: 'plus' });
}

// Real payments leave for the bank page; in test mode a stand-in step confirms without money.
function handlePayment(payment) {
  if (payment.status === 'succeeded') { haptic('success'); afterPayment(payment); return; }
  if (payment.mode === 'yookassa' && payment.confirmationUrl) { location.href = payment.confirmationUrl; return; }
  showDialog(`<div class="sheet-body pay-test"><span class="boost-mark">${icon('lock')}</span><h2 id="modal-title">Оплата ${rub(payment.amount)}</h2><p class="lead">${escapeHtml(payment.description)}</p><p class="test-note">${icon('lock')} Тестовый режим: ЮKassa ещё не подключена, деньги не списываются.</p><button class="btn btn-grad btn-block" data-action="pay-test" data-id="${escapeHtml(payment.id)}">Оплатить (тест)</button><button class="link-btn" data-action="close-modal">Отмена</button></div>`, { kind: 'payment' });
}

async function payTest(paymentId, button) {
  if (button) button.disabled = true;
  try {
    const { payment } = await apiCall('POST', `/api/payments/${encodeURIComponent(paymentId)}/test`);
    await afterPayment(payment);
  } catch (error) {
    if (button) button.disabled = false;
    toast(error.message);
  }
}

async function afterPayment(payment) {
  await reloadAll({ rerender: false });
  if (modal.open) { modal.close(); dialogContext = null; }
  feedOrder = null;
  render();
  if (payment.kind === 'promotion') {
    const promotion = (remote?.promotions || []).find(item => item.paymentId === payment.id);
    if (promotion) openProject(promotion.projectId);
    toast('Готово: пост продвигается в ленте');
  } else toast('Плюс подключён — лента без рекламы');
}

// Back from the bank page: ask the server (it asks ЮKassa) until the payment settles.
async function checkReturnedPayment(paymentId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const { payment } = await apiCall('GET', `/api/payments/${encodeURIComponent(paymentId)}`);
      if (payment.status === 'succeeded') { await afterPayment(payment); return; }
      if (payment.status === 'canceled') { toast('Оплата отменена'); return; }
    } catch { return; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  toast('Оплата ещё обрабатывается — статус обновится сам');
}

/* Full-screen viewer: swipe sideways between photos, swipe up or down to go back to the post */

function viewerItemsFor(project) {
  const media = projectMedia(project);
  if (media.length) return media.map(item => item.type === 'video'
    ? `<video src="${item.url}" ${uploadUrl(item.poster) ? `poster="${item.poster}"` : ''} controls playsinline preload="metadata"></video>`
    : `<img src="${item.url}" alt="${escapeHtml(project.title)}" draggable="false">`);
  return slideKinds(project).map((_, index) => `<div class="viewer-scene">${scene(project, index, 'player')}</div>`);
}

function openViewer(items, index = 0) {
  if (!items.length || typeof document.createElement !== 'function') return;
  let viewer = document.querySelector('#viewer');
  if (!viewer || !viewer.showModal) {
    viewer = document.createElement('dialog');
    viewer.id = 'viewer';
    viewer.className = 'viewer';
    viewer.setAttribute('aria-label', 'Просмотр');
    document.body.appendChild(viewer);
    bindViewer(viewer);
  }
  const arrows = items.length > 1 ? `<button class="viewer-arrow prev" data-action="viewer-step" data-direction="-1" aria-label="Предыдущее">${icon('chevronLeft')}</button><button class="viewer-arrow next" data-action="viewer-step" data-direction="1" aria-label="Следующее">${icon('chevronRight')}</button>` : '';
  viewer.innerHTML = `<div class="viewer-top"><span class="viewer-count">${index + 1} / ${items.length}</span><button class="viewer-close" data-action="viewer-close" aria-label="Закрыть">${icon('close')}</button></div><div class="viewer-track">${items.map((item, position) => `<div class="viewer-slide" data-index="${position}">${item}</div>`).join('')}</div>${arrows}<p class="viewer-hint">${window.matchMedia?.('(hover: none)').matches ? 'Свайп вверх или вниз — назад к посту' : 'Esc или клик мимо фото — назад к посту'}</p>`;
  modal.querySelectorAll?.('video').forEach(video => video.pause?.());
  viewer.style.removeProperty('--fade');
  viewer.showModal();
  const track = viewer.querySelector('.viewer-track');
  track.scrollLeft = index * track.clientWidth;
  if (items.length > 1) loopTrack(track, index, () => syncViewer(viewer));
  syncViewer(viewer);
}

function syncViewer(viewer) {
  const track = viewer.querySelector('.viewer-track');
  if (!track) return;
  const index = loopIndex(track);
  const slidesList = track.querySelectorAll('.viewer-slide:not([data-copy])');
  const count = viewer.querySelector('.viewer-count');
  if (count) count.textContent = `${index + 1} / ${slidesList.length}`;
  const looping = Boolean(track.dataset.loop);
  viewer.querySelector('.viewer-arrow.prev')?.toggleAttribute('disabled', !looping && index === 0);
  viewer.querySelector('.viewer-arrow.next')?.toggleAttribute('disabled', !looping && index >= slidesList.length - 1);
  slidesList.forEach((slide, position) => { if (position !== index) slide.querySelector('video')?.pause(); });
}

function stepViewer(direction) {
  const track = document.querySelector('#viewer .viewer-track');
  track?.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' });
}

function closeViewer(direction = 0) {
  const viewer = document.querySelector('#viewer');
  if (!viewer?.open) return;
  const slide = viewer.querySelector('.viewer-drag');
  viewer.classList.add('closing');
  if (slide) slide.style.transform = `translateY(${direction * innerHeight}px)`;
  setTimeout(() => {
    viewer.querySelectorAll('video').forEach(video => video.pause());
    viewer.close();
    viewer.classList.remove('closing');
  }, direction ? 200 : 0);
}

function bindViewer(viewer) {
  let drag = null;
  viewer.addEventListener('scroll', () => syncViewer(viewer), { capture: true, passive: true });
  viewer.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
  viewer.addEventListener('click', event => {
    if (event.target.classList?.contains('viewer-slide') || event.target === viewer) closeViewer();
  });
  viewer.addEventListener('touchstart', event => {
    const slide = event.target.closest('.viewer-slide');
    drag = event.touches.length === 1 && slide && !event.target.closest('video') ? { slide, x: event.touches[0].clientX, y: event.touches[0].clientY, dy: 0, vertical: null, time: event.timeStamp } : null;
  }, { passive: true });
  viewer.addEventListener('touchmove', event => {
    if (!drag) return;
    const dx = event.touches[0].clientX - drag.x;
    const dy = event.touches[0].clientY - drag.y;
    if (drag.vertical === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.vertical = Math.abs(dy) > Math.abs(dx);
      if (!drag.vertical) { drag = null; return; }
      drag.slide.classList.add('viewer-drag');
    }
    if (event.cancelable) event.preventDefault();
    drag.dy = dy;
    drag.slide.style.transform = `translateY(${dy}px) scale(${1 - Math.min(0.15, Math.abs(dy) / 2400)})`;
    viewer.style.setProperty('--fade', String(Math.max(0.2, 1 - Math.abs(dy) / 500)));
  }, { passive: false });
  viewer.addEventListener('touchend', event => {
    if (!drag?.vertical) { drag = null; return; }
    const { dy, slide, time } = drag;
    drag = null;
    const fast = Math.abs(dy) / Math.max(1, event.timeStamp - time) > 0.5;
    if (Math.abs(dy) > 90 || (fast && Math.abs(dy) > 30)) closeViewer(Math.sign(dy));
    else {
      slide.style.transform = '';
      viewer.style.removeProperty('--fade');
      setTimeout(() => slide.classList.remove('viewer-drag'), 250);
    }
  });
}

function syncGalleryDots(gallery, index = loopIndex(gallery)) {
  gallery.parentElement?.querySelectorAll?.('.store-dots i').forEach((dot, position) => dot.classList.toggle('on', position === index));
}

// A horizontal track of photos that never ends: copies of the last and the first photo sit at the
// opposite ends, and landing on a copy quietly jumps to the real photo. Swipes, arrows and dots work as
// before; only the end is gone.
function loopIndex(track) {
  const raw = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const count = Number(track.dataset?.count) || 0;
  return track.dataset?.loop && count ? ((raw - 1) % count + count) % count : raw;
}

function loopTrack(track, start = 0, onChange = null) {
  const slidesList = [...(track?.children || [])];
  if (!track || slidesList.length < 2 || track.dataset.loop || typeof requestAnimationFrame !== 'function') return;
  const count = slidesList.length;
  const head = slidesList[count - 1].cloneNode(true);
  const tail = slidesList[0].cloneNode(true);
  for (const copy of [head, tail]) { copy.dataset.copy = '1'; copy.setAttribute('aria-hidden', 'true'); copy.querySelectorAll('video').forEach(video => video.removeAttribute('autoplay')); }
  track.insertBefore(head, slidesList[0]);
  track.appendChild(tail);
  track.dataset.loop = '1';
  track.dataset.count = String(count);
  const jump = position => {
    track.style.scrollSnapType = 'none';
    track.scrollLeft = position * track.clientWidth;
    void track.offsetWidth;
    track.style.scrollSnapType = '';
  };
  jump(start + 1);
  requestAnimationFrame(() => jump(start + 1));
  let timer = 0;
  const settle = () => {
    const raw = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (raw === 0) jump(count);
    else if (raw === count + 1) jump(1);
    onChange?.(loopIndex(track));
  };
  track.addEventListener('scroll', () => {
    onChange?.(loopIndex(track));
    clearTimeout(timer);
    timer = setTimeout(settle, 110);
  }, { passive: true });
  track.addEventListener('scrollend', () => { clearTimeout(timer); settle(); });
}

function openComments(id) {
  const project = projectById(id);
  if (project) showDialog(`<div class="sheet-body"><h2 id="modal-title" class="sheet-title">Комментарии <span>${commentCount(project)}</span></h2>${commentsHtml(project)}</div>`, { kind: 'comments', id });
}

function chipRadio(name, options, checked) {
  return `<div class="chip-radio">${options.map(([value, label, iconName]) => `<label><input type="radio" name="${name}" value="${escapeHtml(value)}" ${value === checked ? 'checked' : ''}><span>${iconName ? icon(iconName) : ''}${label}</span></label>`).join('')}</div>`;
}

const MEDIA_ACCEPT = 'image/*,video/mp4,video/quicktime,video/webm';

function mediaVisual(item) {
  const poster = item.posterPreview || item.posterUrl;
  if (item.type === 'video') return `${poster ? `<img src="${escapeHtml(poster)}" alt="">` : `<video src="${escapeHtml(item.preview)}#t=0.1" muted playsinline preload="metadata"></video>`}<span class="play-mark small">${icon('play')}</span>`;
  return `<img src="${escapeHtml(item.preview)}" alt=""${item.focus ? ` style="${focusStyle(item.focus)}"` : ''}>`;
}

function mediaStateHtml(item, big = false) {
  if (item.status === 'error') return `<span class="tile-state error" data-action="media-error" data-id="${item.id}">${icon('close')}${big ? `<small>${escapeHtml(item.error || 'Не загрузилось')}</small>${item.retry ? `<button type="button" class="tile-retry" data-action="media-retry" data-id="${item.id}">Повторить</button>` : ''}` : ''}</span>`;
  if (item.status === 'done') return item.url && item.file ? `<span class="tile-state done" aria-label="Загружено">${icon('check')}</span>` : '';
  const percent = Math.round((item.progress || 0) * 100);
  return `<span class="tile-state busy ${item.status === 'processing' ? 'spin' : ''}" style="--p:${item.status === 'processing' ? 25 : percent}"><i></i><small>${item.status === 'processing' ? 'Готовим' : `${percent}%`}</small></span>`;
}

function imagePickerHtml() {
  const input = `<input class="file-cover" type="file" name="images" accept="${MEDIA_ACCEPT}" multiple aria-label="Фото, GIF или видео">`;
  if (!online) return `<div class="drop offline"><span class="drop-icon">${icon('image')}</span><b>Обложкой станет название</b><small>Фото и видео можно загрузить на сайте с аккаунтом</small></div>`;
  if (!publishMedia.length) return `<label class="drop">${input}<span class="drop-icon">${icon('upload')}</span><b>Добавь фото, GIF или видео</b><small>${isCompact() ? 'Нажми, чтобы выбрать' : 'Перетащи сюда или нажми'} · до 8 файлов</small><span class="drop-hint">Первое станет обложкой. Без файлов обложкой будет название на цвете страницы</span></label>`;
  const [cover, ...rest] = publishMedia;
  const busy = publishMedia.filter(item => item.status === 'processing' || item.status === 'uploading').length;
  const failed = publishMedia.filter(item => item.status === 'error').length;
  const summary = failed
    ? `<span class="pick-summary error">${icon('close')} Не загрузилось: ${failed}</span>`
    : busy ? `<span class="pick-summary">${icon('refresh')} Загружаем: ${busy} из ${publishMedia.length}</span>`
    : `<span class="pick-summary done">${icon('check')} Готово: ${publishMedia.length} ${plural(publishMedia.length, 'файл', 'файла', 'файлов')}</span>`;
  const thumbs = rest.map((item, index) => `<span class="pick-thumb" data-media="${item.id}">${mediaVisual(item)}${mediaStateHtml(item)}<button type="button" class="pick-make-cover" data-action="media-cover" data-index="${index + 1}" aria-label="Сделать обложкой"></button><button type="button" class="pick-remove" data-action="remove-image" data-index="${index + 1}" aria-label="Убрать">${icon('close')}</button></span>`).join('');
  return `<div class="pick-cover" data-media="${cover.id}">${mediaVisual(cover)}<em>${icon('image')} Обложка</em><button type="button" class="pick-focus" data-action="media-focus" data-index="0">${icon('eye')} Кадр в ленте</button>${mediaStateHtml(cover, true)}<button type="button" class="pick-remove" data-action="remove-image" data-index="0" aria-label="Убрать">${icon('close')}</button></div><div class="pick-strip">${thumbs}${publishMedia.length < 8 ? `<label class="pick-add">${input}${icon('plus')}<small>Ещё</small></label>` : ''}</div><p class="pick-status">${summary}${rest.length ? '<span>Нажми на миниатюру — она станет обложкой</span>' : ''}</p>`;
}

function plural(count, one, few, many) {
  const tens = count % 100;
  const ones = count % 10;
  return tens > 10 && tens < 20 ? many : ones === 1 ? one : ones > 1 && ones < 5 ? few : many;
}

function renderPicker() {
  const wrap = modal.querySelector?.('.image-pick-wrap');
  if (wrap) wrap.innerHTML = imagePickerHtml();
}

async function imageToBlob(file, maxSide = 1600, square = false) {
  if (!file.type.startsWith('image/')) throw new Error('Это не картинка');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error('Не удалось открыть картинку')); element.src = url; });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceWidth = square ? side : image.naturalWidth;
    const sourceHeight = square ? side : image.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    canvas.getContext('2d').drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось сжать картинку')), 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function videoPoster(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    // iOS loads nothing until asked: load() plus a muted play() makes the first frame available.
    video.load?.();
    video.play?.().then(() => video.pause(), () => {});
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('no preview')); setTimeout(resolve, 4000); });
    video.currentTime = Math.min(0.5, (video.duration || 1) / 3);
    await new Promise(resolve => { video.onseeked = resolve; setTimeout(resolve, 2500); });
    if (!video.videoWidth) return null;
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const MB = 1024 * 1024;
let mediaSeq = 0;
let mediaQueue = Promise.resolve();

function mediaKind(file) {
  if (file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name || '')) return 'video';
  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name || '')) return 'image';
  return '';
}

function sizeText(bytes) {
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0).replace('.', ',')} МБ`;
}

// Tiles appear at once; each file is then prepared and uploaded in the background, one after another.
function addPublishFiles(fileList) {
  const files = Array.from(fileList || []);
  const room = Math.max(0, 8 - publishMedia.length);
  if (files.length > room) toast(`Можно до 8 файлов — добавлено ${room}`);
  const added = files.slice(0, room).map(file => ({ id: `m${++mediaSeq}`, type: mediaKind(file) || 'image', kind: mediaKind(file), file, preview: URL.createObjectURL(file), status: 'processing', progress: 0 }));
  if (!added.length) return;
  publishMedia.push(...added);
  renderPicker();
  for (const item of added) item.task = mediaQueue = mediaQueue.then(() => prepareMedia(item));
}

async function prepareMedia(item) {
  if (!publishMedia.includes(item)) return;
  item.status = 'processing';
  item.error = '';
  item.retry = false;
  item.progress = 0;
  renderPicker();
  try {
    if (!item.kind) throw new Error('Это не фото и не видео');
    if (item.kind === 'video') {
      if (item.file.size > 40 * MB) throw new Error(`Видео ${sizeText(item.file.size)}, можно до 40 МБ. Обрежь его или вставь ссылку на YouTube`);
      item.blob = item.file;
      if (!item.poster) videoPoster(item.file).then(poster => {
        if (!poster || !publishMedia.includes(item)) return;
        item.poster = poster;
        item.posterPreview = URL.createObjectURL(poster);
        renderPicker();
      });
    } else if (item.file.type === 'image/gif') {
      if (item.file.size > 8 * MB) throw new Error(`GIF ${sizeText(item.file.size)}, можно до 8 МБ`);
      item.blob = item.file;
    } else if (!item.blob) {
      item.blob = await imageToBlob(item.file);
      URL.revokeObjectURL(item.preview);
      item.preview = URL.createObjectURL(item.blob);
    }
    if (!publishMedia.includes(item)) return;
    item.status = 'uploading';
    renderPicker();
    item.url = await uploadBlob(item.blob, item.kind, progress => {
      item.progress = progress;
      const state = modal.querySelector?.(`[data-media="${item.id}"] .tile-state`);
      if (state) state.outerHTML = mediaStateHtml(item, item === publishMedia[0]);
    }, item);
    item.status = 'done';
  } catch (error) {
    if (!publishMedia.includes(item)) return;
    item.status = 'error';
    item.error = error.message || 'Не загрузилось';
    item.retry = !/можно до|не фото|не похож|Нужн/i.test(item.error);
    toast(item.error);
  }
  renderPicker();
}

// Upload with progress (fetch cannot report it). The server checks the real file type.
function uploadBlob(blob, kind = '', onProgress = null, holder = null) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    if (holder) holder.request = request;
    request.open('POST', '/api/uploads');
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', blob.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'));
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    request.onload = () => {
      let data = {};
      try { data = JSON.parse(request.responseText || '{}'); } catch { data = {}; }
      if (request.status >= 200 && request.status < 300 && data.url) resolve(data.url);
      else reject(new Error(data.error || (request.status === 413 ? 'Файл слишком большой' : `Ошибка загрузки ${request.status}`)));
    };
    request.onerror = () => reject(new Error('Нет связи — нажми «Повторить»'));
    request.onabort = () => reject(new Error('Загрузка отменена'));
    request.send(blob);
  });
}

async function waitForMedia(submit) {
  const pending = publishMedia.filter(item => item.task && (item.status === 'processing' || item.status === 'uploading'));
  if (!pending.length) return;
  if (submit) submit.textContent = 'Дожидаемся загрузки файлов…';
  await Promise.all(pending.map(item => item.task));
}

function clearPublishMedia() {
  for (const item of publishMedia) {
    item.request?.abort?.();
    if (item.file) URL.revokeObjectURL(item.preview);
    if (item.posterPreview) URL.revokeObjectURL(item.posterPreview);
  }
  publishMedia = [];
}

/* Publishing: three short steps — files and name, facts and links, the page */

function chipChoice(name, options, values = [], single = false) {
  const chosen = Array.isArray(values) ? values : [values];
  return `<div class="chip-radio">${options.map(([value, label, iconName]) => `<label><input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${chosen.includes(value) ? 'checked' : ''} ${single ? 'data-single' : ''}><span>${iconName ? icon(iconName) : ''}${label}</span></label>`).join('')}</div>`;
}

function linkRowsHtml() {
  const rows = postDraft.links.map((value, index) => {
    const link = linkKind(value);
    return `<div class="link-row"><span class="link-kind" data-kind-for="${index}">${icon(link?.icon || 'globe')}<small>${escapeHtml(link?.label || 'Ссылка')}</small></span><input name="link" type="url" inputmode="url" autocomplete="off" value="${escapeHtml(value)}" data-link="${index}" placeholder="${index ? 'Ещё ссылка' : 'Steam, VK Play, RuStore, itch.io, GitHub, сайт'}" aria-label="Ссылка ${index + 1}">${postDraft.links.length > 1 ? `<button type="button" class="icon-btn" data-action="link-remove" data-index="${index}" aria-label="Убрать ссылку">${icon('close')}</button>` : ''}</div>`;
  }).join('');
  return `${rows}${postDraft.links.length < POST_LINK_LIMIT ? `<button type="button" class="add-link" data-action="link-add">${icon('plus')} Ещё ссылка</button>` : ''}`;
}

function openPublish(projectId = '') {
  if (needLogin('Чтобы публиковать проекты, войди в аккаунт')) return;
  const project = projectId ? projectById(projectId) : null;
  if (projectId && (!project || !isMine(project.handle))) return;
  clearPublishMedia();
  if (project) publishMedia = projectMedia(project).map(item => ({ id: `m${++mediaSeq}`, type: item.type, kind: item.type, url: item.url, preview: item.url, posterUrl: uploadUrl(item.poster), status: 'done', ...(item.focus ? { focus: item.focus } : {}) }));
  postDraft = {
    id: project?.id || '', step: 1, selected: -1,
    theme: cleanTheme(project?.theme),
    blocks: (project?.page || []).map(block => ({ ...block, ...(block.items ? { items: [...block.items] } : {}) })),
    links: [...(project?.links?.length ? project.links : project?.url ? [project.url] : []), ''].slice(0, POST_LINK_LIMIT)
  };
  if (postDraft.links.length > 1 && !postDraft.links.at(-1)) postDraft.links.pop();
  const field = (name, attrs) => `<input name="${name}" ${attrs} value="${escapeHtml(project?.[name] ?? '')}">`;
  const label = (iconName, text) => `<p class="field-label">${icon(iconName)}${text}</p>`;
  const steps = ['Основное', 'Детали', 'Страница'];
  showDialog(`<div class="sheet-body publish"><h2 id="modal-title">${project ? 'Редактировать' : 'Новый проект'}</h2><div class="wizard-steps">${steps.map((name, index) => `<button type="button" class="wstep ${index ? '' : 'on'}" data-action="wizard-step" data-step="${index + 1}"><i>${index + 1}</i><span>${name}</span></button>`).join('')}</div><form id="publish-form" class="form wizard" data-step="1" novalidate><fieldset class="wpane" data-pane="1">${!project && online ? `<div class="import-box"><p>${icon('wand')}<span><b>Заполнить по ссылке</b><small>Steam, itch.io, GitHub, RuStore, App Store, Google Play или сайт — подтянем название, текст, теги и картинки</small></span></p><div class="import-row"><input name="importUrl" inputmode="url" placeholder="Вставь ссылку на страницу проекта" aria-label="Ссылка для автозаполнения" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="btn btn-grad btn-sm" data-action="import-link">Заполнить</button></div><small class="import-state" aria-live="polite"></small></div>` : ''}<div class="image-pick-wrap">${imagePickerHtml()}</div>${field('title', 'maxlength="80" placeholder="Название" aria-label="Название" required autocomplete="off"')}${field('summary', 'maxlength="160" placeholder="Коротко: что это и для кого" aria-label="Короткое описание" required autocomplete="off"')}${label('grid', 'Раздел')}${chipRadio('category', Object.entries(categoryNames).map(([id, name]) => [id, name, categoryIcons[id]]), project?.category || 'apps')}</fieldset><fieldset class="wpane" data-pane="2">${label('flag', 'Стадия')}${chipChoice('stage', postStages, project?.stage, true)}${label('monitor', 'Платформы')}${chipChoice('platforms', postPlatforms, project?.platforms)}${label('coins', 'Цена')}${chipChoice('pricing', postPricing, project?.pricing, true)}${label('users', 'Кого ищешь')}${chipChoice('seeking', postSeeking, project?.seeking)}<label class="toggle-row"><input type="checkbox" name="ai" ${project?.ai ? 'checked' : ''}><span>${icon('sparkle')}<b>Сделано с помощью ИИ</b><small>Вайбкодинг, генерация кода или графики</small></span><i class="toggle" aria-hidden="true"></i></label><input name="madeWith" maxlength="160" placeholder="Чем сделано: Godot, Unity, React, Claude Code" aria-label="Чем сделано" value="${escapeHtml((project?.madeWith || []).join(', '))}" autocomplete="off">${label('globe', 'Ссылки')}<div class="link-rows">${linkRowsHtml()}</div>${online ? field('video', 'type="url" placeholder="Трейлер на YouTube, VK или Steam" aria-label="Ссылка на трейлер"') : ''}${online ? `${label('play', 'Демо в браузере')}<input name="demo" maxlength="2000" inputmode="url" placeholder="Веб-версия: itch.io, GitHub Pages, свой сайт" aria-label="Ссылка на демо в браузере" value="${escapeHtml(project?.demo || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" data-demo-input><small class="demo-state">Кнопка «Играть» появится на карточке, игра запустится прямо в посте. Можно вставить и код iframe — например «Embed game» с itch.io</small>` : ''}<input name="tags" maxlength="120" placeholder="Теги через запятую: Пиксель-арт, Кооператив" aria-label="Теги" value="${escapeHtml((project?.tags || []).filter(tag => tag !== 'Новый проект').join(', '))}" autocomplete="off"></fieldset><fieldset class="wpane" data-pane="3"><div class="pe-host">${pageEditorHtml()}</div></fieldset><p class="form-error" role="alert"></p><div class="wizard-bar"><button type="button" class="btn btn-ghost wizard-back" data-action="wizard-step" data-step="back">${icon('chevronLeft')}</button><button class="btn btn-primary" type="submit">Далее ${icon('chevronRight')}</button></div></form></div>`, { kind: 'publish', id: project?.id || '' });
  autosizeFields(modal);
}

function stepOneValid(form) {
  for (const name of ['title', 'summary']) {
    const input = form.elements?.[name];
    if (input && !input.value.trim()) {
      showWizardStep(1);
      input.reportValidity?.();
      input.focus?.();
      return false;
    }
  }
  return true;
}

function setWizardStep(step) {
  const form = modal.querySelector?.('#publish-form');
  if (!form || !postDraft) return;
  const next = step === 'back' ? postDraft.step - 1 : Number(step);
  if (next > 1 && !stepOneValid(form)) return;
  showWizardStep(next);
}

function showWizardStep(step) {
  const form = modal.querySelector?.('#publish-form');
  if (!form || !postDraft) return;
  postDraft.step = Math.max(1, Math.min(3, step));
  form.dataset.step = String(postDraft.step);
  modal.querySelectorAll?.('.wstep').forEach(button => {
    const number = Number(button.dataset.step);
    button.classList.toggle('on', number === postDraft.step);
    button.classList.toggle('done', number < postDraft.step);
  });
  const submit = form.querySelector?.('button[type="submit"]');
  if (submit) submit.innerHTML = postDraft.step < 3 ? `Далее ${icon('chevronRight')}` : `${icon(postDraft.id ? 'check' : 'send')} ${postDraft.id ? 'Сохранить' : 'Опубликовать'}`;
  if (postDraft.step === 3) renderPageEditor();
  modal.scrollTo?.({ top: 0, behavior: 'smooth' });
}

/* Page editor: blocks the author styles and orders; the preview uses the page's own colours */

function themeSwatches(key, colors) {
  const current = postDraft.theme[key];
  const custom = current && !colors.includes(current);
  return `<div class="swatches"><button type="button" class="swatch none ${current ? '' : 'on'}" data-action="pe-theme" data-key="${key}" data-value="" aria-label="Как в про.стим" title="Как в про.стим"></button>${colors.map(color => `<button type="button" class="swatch ${current === color ? 'on' : ''}" style="--sw:${color}" data-action="pe-theme" data-key="${key}" data-value="${color}" aria-label="Цвет ${color}"></button>`).join('')}<label class="swatch custom ${custom ? 'on' : ''}" ${custom ? `style="--sw:${current}"` : ''} title="Свой цвет"><input type="color" data-pe-theme="${key}" value="${current || '#888888'}" aria-label="Свой цвет"></label></div>`;
}

function fontChips(current, action, index = '') {
  const own = action === 'pe-style';
  return `<div class="pe-fonts">${own ? `<button type="button" class="pe-font ${current ? '' : 'on'}" data-action="pe-style" data-key="font" data-value="" data-index="${index}"><b>Аа</b><small>Как у страницы</small></button>` : ''}${Object.entries(pageFonts).map(([key, font]) => `<button type="button" class="pe-font pf-${key} ${current === key ? 'on' : ''}" data-action="${action}" data-key="font" data-value="${key}" ${own ? `data-index="${index}"` : ''}><b>Аа</b><small>${font.label}</small></button>`).join('')}</div>`;
}

function blockToolsHtml(block, index) {
  const textual = ['heading', 'text', 'list', 'quote'].includes(block.type);
  const button = (key, value, label, on, extra = '') => `<button type="button" class="${on ? 'on' : ''}" data-action="pe-style" data-key="${key}" data-value="${value}" data-index="${index}" ${extra}>${label}</button>`;
  const weight = Number(block.weight) || (block.type === 'heading' ? 800 : 400);
  const order = `<div class="pe-seg">${button('move', -1, icon('chevronUp'), false, `aria-label="Выше" ${index ? '' : 'disabled'}`)}${button('move', 1, icon('chevronDown'), false, `aria-label="Ниже" ${index < postDraft.blocks.length - 1 ? '' : 'disabled'}`)}${button('delete', 1, icon('trash'), false, 'aria-label="Удалить блок"')}</div>`;
  if (!textual) {
    const shape = block.type === 'image' && !block.uploading ? `<div class="pe-seg">${Object.entries(imageRatios).map(([key, label]) => button('ratio', key, label, (block.ratio || '') === key)).join('')}</div>${block.ratio ? `<button type="button" class="pe-focus" data-action="pe-focus" data-index="${index}">${icon('eye')} Кадр</button>` : ''}` : '';
    return `<div class="pe-tools"><div class="pe-tool-row">${order}${shape}</div></div>`;
  }
  const colors = `<div class="swatches small"><button type="button" class="swatch none ${block.color ? '' : 'on'}" data-action="pe-style" data-key="color" data-value="" data-index="${index}" aria-label="Цвет текста страницы"></button>${pageColors.map(color => `<button type="button" class="swatch ${block.color === color ? 'on' : ''}" style="--sw:${color}" data-action="pe-style" data-key="color" data-value="${color}" data-index="${index}" aria-label="Цвет ${color}"></button>`).join('')}<label class="swatch custom ${block.color && !pageColors.includes(block.color) ? 'on' : ''}"><input type="color" data-pe-color="${index}" value="${block.color || '#ffffff'}" aria-label="Свой цвет текста"></label></div>`;
  return `<div class="pe-tools"><div class="pe-tool-row"><div class="pe-seg">${Object.entries(pageSizes).map(([key, label]) => button('size', key, label, (block.size || 'm') === key, `aria-label="Размер ${label}"`)).join('')}</div><div class="pe-seg">${Object.entries(pageWeights).map(([key, label]) => button('weight', key, 'Аа', weight === Number(key), `style="font-weight:${key}" aria-label="${label}" title="${label}"`)).join('')}</div><div class="pe-seg">${button('align', '', icon('alignLeft'), block.align !== 'center', 'aria-label="По левому краю"')}${button('align', 'center', icon('alignCenter'), block.align === 'center', 'aria-label="По центру"')}</div>${order}</div>${fontChips(block.font || '', 'pe-style', index)}${colors}</div>`;
}

function editBlockHtml(block, index) {
  const on = postDraft.selected === index ? 'on' : '';
  const area = (key, value, placeholder) => `<textarea class="${blockClass(block)} pe-field" ${blockStyle(block)} data-pe="${key}" data-index="${index}" rows="1" placeholder="${placeholder}" aria-label="${placeholder}">${escapeHtml(value)}</textarea>`;
  const input = (key, placeholder, extra = '') => `<input class="pe-input" data-pe="${key}" data-index="${index}" value="${escapeHtml(block[key] || '')}" placeholder="${placeholder}" aria-label="${placeholder}" autocomplete="off" ${extra}>`;
  let body = '';
  if (block.type === 'heading') body = area('text', block.text || '', 'Заголовок');
  else if (block.type === 'text') body = area('text', block.text || '', 'Текст. **Жирный**, _курсив_, [ссылка](https://…)');
  else if (block.type === 'list') body = `<div class="pe-list">${area('items', (block.items || []).join('\n'), 'Каждый пункт — с новой строки')}</div>`;
  else if (block.type === 'quote') body = `<div class="pb-quote-shell">${area('text', block.text || '', 'Цитата или отзыв')}${input('author', 'Кто сказал')}</div>`;
  else if (block.type === 'image' || block.type === 'video') {
    const source = block.preview || uploadUrl(block.url);
    const shaped = block.ratio ? ` style="aspect-ratio:${block.ratio.replace(':', ' / ')};object-fit:cover;${focusStyle(block.focus)}"` : '';
    const media = block.type === 'video' ? `<video src="${escapeHtml(source)}" muted playsinline controls preload="metadata"></video>` : `<img src="${escapeHtml(source)}" alt=""${shaped}>`;
    const state = block.uploading ? `<span class="pe-uploading">${icon('refresh')} Загружаем… ${Math.round((block.progress || 0) * 100)}%</span>` : block.error ? `<span class="pe-upload-error">${icon('close')} ${escapeHtml(block.error)} — удали блок и попробуй снова</span>` : '';
    body = `<figure class="pb pb-media ${block.uploading ? 'uploading' : ''} ${block.error ? 'failed' : ''}">${media}${state}</figure>${block.error ? '' : input('caption', 'Подпись · необязательно')}`;
  } else if (block.type === 'button') {
    const link = linkKind(block.url);
    body = `<div class="pb pb-button pe-button">${icon(link?.icon || 'external')}${input('label', link ? link.label : 'Текст кнопки')}</div>${input('url', 'Ссылка: сайт, Steam, Telegram…', 'inputmode="url" autocapitalize="off" spellcheck="false"')}${buttonHintHtml(block)}`;
  } else if (block.type === 'divider') body = '<hr class="pb pb-divider">';
  return `<div class="peb ${on}" data-block="${index}">${blockToolsHtml(block, index)}${body}</div>`;
}

// Under the button's link: where it goes, or why it will not show.
function buttonHintHtml(block) {
  const link = linkKind(block.url);
  if (link) return `<small class="pe-hint ok">${icon('check')} Кнопка ведёт на ${escapeHtml(link.host)} · видна на карточке в ленте и на странице</small>`;
  return `<small class="pe-hint ${block.url ? 'bad' : ''}">${icon(block.url ? 'close' : 'external')} ${block.url ? 'Не похоже на ссылку — без неё кнопки не будет' : 'Вставь ссылку — без неё кнопка не появится'}</small>`;
}

function pageEditorHtml() {
  if (!postDraft) return '';
  ensureFonts(Object.keys(pageFonts));
  const form = modal.querySelector?.('#publish-form');
  const title = form?.elements?.title?.value || 'Название проекта';
  const summary = form?.elements?.summary?.value || '';
  const blocks = postDraft.blocks.map(editBlockHtml).join('');
  const add = Object.entries(pageBlockTypes).filter(([, type]) => online || !type.media).map(([key, type]) => type.media
    ? `<label class="pe-add-btn">${icon(type.icon)}<span>${type.label}</span><input class="file-cover" type="file" data-pe-file="${key}" accept="${key === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/*'}"></label>`
    : `<button type="button" class="pe-add-btn" data-action="pe-add" data-type="${key}">${icon(type.icon)}<span>${type.label}</span></button>`).join('');
  return `<div class="pe-theme"><div class="pe-row"><span>${icon('palette')} Фон</span>${themeSwatches('bg', pageBackgrounds)}</div><div class="pe-row"><span>${icon('sparkle')} Акцент</span>${themeSwatches('accent', pageColors)}</div><div class="pe-row"><span>${icon('text')} Шрифт</span>${fontChips(postDraft.theme.font, 'pe-theme')}</div></div><div class="pe-canvas ${themeClass(postDraft.theme)}" style="${themeVars(postDraft.theme)}"><div class="pe-preview-head"><b class="store-title">${escapeHtml(title)}</b>${summary ? `<p class="store-summary">${escapeHtml(summary)}</p>` : ''}<span class="pe-fake-cta">${icon('external')} Кнопка ссылки</span></div><div class="pe-blocks">${blocks || `<div class="pe-empty">${icon('sparkle')}<b>Собери страницу проекта</b><span>Добавь текст, фото, GIF, видео и кнопки. Каждый блок можно покрасить, выбрать шрифт и размер</span></div>`}</div></div><p class="pe-add-title">Добавить блок</p><div class="pe-add">${add}</div>`;
}

function renderPageEditor() {
  const host = modal.querySelector?.('.pe-host');
  if (!host) return;
  host.innerHTML = pageEditorHtml();
  autosizeFields(host);
}

function rerenderBlock(index) {
  const element = modal.querySelector?.(`.peb[data-block="${index}"]`);
  if (!element || !postDraft.blocks[index]) { renderPageEditor(); return; }
  element.outerHTML = editBlockHtml(postDraft.blocks[index], index);
  autosizeFields(modal.querySelector?.(`.peb[data-block="${index}"]`));
}

function selectBlock(index) {
  if (!postDraft || postDraft.selected === index) return;
  postDraft.selected = index;
  modal.querySelectorAll?.('.peb').forEach(element => element.classList.toggle('on', Number(element.dataset.block) === index));
}

function autosizeFields(root) {
  root?.querySelectorAll?.('textarea.pe-field').forEach(autosize);
}

function autosize(field) {
  if (!field?.style) return;
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

function addBlock(type) {
  if (postDraft.blocks.length >= PAGE_BLOCK_LIMIT) { toast(`Не больше ${PAGE_BLOCK_LIMIT} блоков`); return null; }
  const block = type === 'list' ? { type, items: [] } : { type };
  postDraft.blocks.push(block);
  postDraft.selected = postDraft.blocks.length - 1;
  renderPageEditor();
  if (!['image', 'video'].includes(type)) modal.querySelector?.(`.peb[data-block="${postDraft.selected}"] [data-pe]`)?.focus?.({ preventScroll: false });
  return block;
}

async function addPageMedia(file, type) {
  if (!file || !postDraft) return;
  const kind = mediaKind(file) || type;
  const limit = kind === 'video' ? 40 : file.type === 'image/gif' ? 8 : 25;
  if (file.size > limit * MB) { toast(`${kind === 'video' ? 'Видео' : 'Файл'} ${sizeText(file.size)}, можно до ${limit} МБ`); return; }
  const block = addBlock(kind === 'video' ? 'video' : 'image');
  if (!block) return;
  block.uploading = true;
  block.progress = 0;
  block.preview = URL.createObjectURL(file);
  renderPageEditor();
  try {
    const blob = kind === 'image' && file.type !== 'image/gif' ? await imageToBlob(file, 2000) : file;
    block.url = await uploadBlob(blob, kind, progress => {
      block.progress = progress;
      const label = modal.querySelector?.(`.peb[data-block="${postDraft?.blocks.indexOf(block)}"] .pe-uploading`);
      if (label) label.innerHTML = `${icon('refresh')} Загружаем… ${Math.round(progress * 100)}%`;
    });
  } catch (error) {
    block.error = error.message;
    toast(error.message);
  }
  delete block.uploading;
  renderPageEditor();
}

function styleBlock(index, key, value) {
  const block = postDraft?.blocks[index];
  if (!block) return;
  if (key === 'move') {
    const to = index + Number(value);
    if (to < 0 || to >= postDraft.blocks.length) return;
    [postDraft.blocks[index], postDraft.blocks[to]] = [postDraft.blocks[to], postDraft.blocks[index]];
    postDraft.selected = to;
    renderPageEditor();
    modal.querySelector?.(`.peb[data-block="${to}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (key === 'delete') {
    const [removed] = postDraft.blocks.splice(index, 1);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    postDraft.selected = -1;
    renderPageEditor();
    return;
  }
  if (key === 'ratio' && !value) delete block.focus;
  if (key === 'weight') block.weight = Number(value);
  else if (value) block[key] = value;
  else delete block[key];
  postDraft.selected = index;
  rerenderBlock(index);
}

function draftPage() {
  return (postDraft?.blocks || []).filter(block => !block.uploading && !block.error && (!['image', 'video'].includes(block.type) || block.url)).map(({ uploading, preview, progress, error, ...block }) => block);
}

function openApplication(projectId = '') {
  if (needLogin('Чтобы подать заявку издателю, войди в аккаунт')) return;
  const project = projectId ? projectById(projectId) : null;
  const own = project && isMine(project.handle) ? project : null;
  const link = own ? (own.demo || own.links?.[0] || own.video || '') : '';
  const about = own ? [own.summary, own.description].filter(Boolean).join('\n\n').slice(0, 2400) : '';
  const stage = own?.stage === 'release' ? 'Готова к релизу' : own?.stage === 'prototype' || own?.stage === 'idea' ? 'Прототип' : 'Демо';
  const proof = own ? (() => { const readiness = projectReadiness(own); return `<p class="hub-hint">${icon('flame')} Издатель увидит пост и отклик в ленте: готовность ${readiness.percent}%, следят ${own.watchers || 0}${hasPlusNow() ? ' · с Плюсом заявку посмотрят первой' : ''}.</p>`; })() : '';
  showDialog(`<div class="sheet-body"><span class="hero-icon steam">${icon('gamepad')}</span><h2 id="modal-title">Заявка в Steam</h2>${proof}<form id="application-form" class="form">${own ? `<input type="hidden" name="projectId" value="${escapeHtml(own.id)}">` : ''}<input name="title" required maxlength="100" placeholder="Название игры" aria-label="Название игры" value="${escapeHtml(own?.title || '')}">${chipRadio('stage', [['Прототип', 'Прототип'], ['Демо', 'Демо'], ['Готова к релизу', 'Релиз']], stage)}<input name="url" type="url" placeholder="Ссылка на демо или трейлер" aria-label="Ссылка на демонстрацию" value="${escapeHtml(link)}"><textarea name="description" required rows="3" maxlength="2400" placeholder="Какая помощь нужна?" aria-label="Какая помощь нужна">${escapeHtml(about)}</textarea><input name="contact" required placeholder="Email или Telegram" maxlength="120" aria-label="Контакт"><button class="btn btn-primary btn-block" type="submit">${icon(online ? 'send' : 'check')} ${online ? 'Отправить заявку' : 'Сохранить черновик'}</button></form></div>`);
}

function openTopic(id) {
  const topic = allTopics().find(item => item.id === id);
  if (!topic) return;
  const replies = topicReplies(topic);
  const list = replies.length
    ? replies.map(reply => `<div class="comment">${avatar({ initials: reply.initials || reply.name.slice(0, 1), color: reply.color || (reply.name === 'Вы' ? '#e5e1d8' : '#b7d5fa') })}<div><b>${reply.handle ? `<button class="text-link inline" data-action="profile" data-handle="${escapeHtml(reply.handle)}">${escapeHtml(reply.name)}</button>` : escapeHtml(reply.name)}</b>${reply.createdAt ? `<small>${timeAgo(reply.createdAt)}</small>` : ''}<p>${escapeHtml(reply.text)}</p></div></div>`).join('')
    : `<p class="comments-empty">${icon('comment')} Ответь первым</p>`;
  showDialog(`<div class="sheet-body"><p class="kicker">${escapeHtml(topic.category || 'Общее')} · ${escapeHtml(topic.author)}</p><h2 id="modal-title">${escapeHtml(topic.title)}</h2><div class="comments">${list}</div><form id="reply-form" data-id="${escapeHtml(id)}" class="composer sticky"><input name="text" required maxlength="2000" placeholder="${online && !me ? 'Войди, чтобы ответить' : 'Ответить…'}" aria-label="Ответ в теме" autocomplete="off"><button type="submit" aria-label="Отправить">${icon('send')}</button></form></div>`, { kind: 'topic', id });
}

function openConnection(provider) {
  if (provider === 'github') { go('#/ai/connect/github'); return; }
  go('#/ai/connect/cloud');
}

function openDemo() {
  const progress = demoTasks.length ? Math.round(completeTasks.length / demoTasks.length * 100) : 0;
  showDialog(`<div class="sheet-body live-demo"><p class="kicker">Контур · мини-демо</p><h2 id="modal-title">Мои задачи</h2><div class="progress"><i style="width:${progress}%"></i></div><form id="demo-task-form" class="composer"><input name="task" required maxlength="120" placeholder="Новая задача" aria-label="Новая задача" autocomplete="off"><button type="submit" aria-label="Добавить">${icon('plus')}</button></form><div class="live-tasks">${demoTasks.map((task, index) => `<button class="live-task ${completeTasks.includes(index) ? 'done' : ''}" data-action="toggle-task" data-index="${index}" aria-pressed="${completeTasks.includes(index)}"><i>${completeTasks.includes(index) ? icon('check') : ''}</i>${escapeHtml(task)}</button>`).join('')}</div></div>`, { kind: 'demo' });
}

function setFiles(newFiles, newSource) {
  connectionVersion += 1;
  files = newFiles;
  selectedFile = files[0] || null;
  source = newSource;
  messages = [];
  promptDraft = '';
  workspacePane = 'files';
  go('#/ai/editor');
  render();
}

async function chooseLocalFolder() {
  if (!('showDirectoryPicker' in window)) {
    document.querySelector('#directory-import').click();
    return;
  }
  try {
    const directory = await window.showDirectoryPicker({ mode: 'readwrite' });
    const loaded = [];
    async function walk(handle, prefix = '', depth = 0) {
      if (depth > 5 || loaded.length >= 150) return;
      for await (const [name, child] of handle.entries()) {
        if (loaded.length >= 150) break;
        if (name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(name)) continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (child.kind === 'directory') await walk(child, path, depth + 1);
        else if (/\.(md|txt|html|css|js|jsx|ts|tsx|json|py|yml|yaml|toml|rs|go|sql)$/i.test(name)) {
          const file = await child.getFile();
          if (file.size <= 512000) {
            const content = await file.text();
            loaded.push({ path, content, originalContent: content, handle: child });
          }
        }
      }
    }
    await walk(directory);
    if (!loaded.length) {
      toast('В папке нет текстовых файлов');
      return;
    }
    setFiles(loaded, { name: directory.name, type: 'folder', label: 'Локальная папка' });
    toast(`Открыто файлов: ${loaded.length}`);
  } catch (error) {
    if (error.name !== 'AbortError') toast('Нет доступа к папке');
  }
}

async function openGitHub(form) {
  const requestVersion = ++connectionVersion;
  const status = form.querySelector('#github-status');
  const submit = form.querySelector('button[type="submit"]');
  try {
    const url = new URL(new FormData(form).get('repository'));
    if (url.hostname !== 'github.com') throw new Error('Нужна ссылка на github.com');
    const [owner, repository] = url.pathname.split('/').filter(Boolean);
    if (!owner || !repository) throw new Error('Укажи владельца и репозиторий');
    submit.disabled = true;
    status.textContent = 'Загружаем файлы…';
    const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository.replace(/\.git$/, ''))}`;
    const response = await fetch(`${api}/contents`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(response.status === 404 ? 'Репозиторий не найден или закрыт' : 'GitHub ограничил запросы, попробуй позже');
    const entries = await response.json();
    const supported = entries.filter(entry => entry.type === 'file' && entry.size <= 512000 && /\.(md|txt|html|css|js|ts|json|py)$/i.test(entry.name)).slice(0, 12);
    const loaded = await Promise.all(supported.map(async entry => {
      const fileResponse = await fetch(entry.url, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
      if (!fileResponse.ok) throw new Error('Не удалось прочитать файл');
      const file = await fileResponse.json();
      const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), character => character.charCodeAt(0));
      return { path: file.path, content: new TextDecoder().decode(bytes) };
    }));
    if (!loaded.length) throw new Error('В корне нет текстовых файлов');
    if (requestVersion !== connectionVersion || !form.isConnected) return;
    setFiles(loaded, { name: `${owner}/${repository}`, type: 'github', label: 'GitHub · чтение' });
    toast('Репозиторий открыт');
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' ? 'GitHub не ответил, попробуй ещё раз' : error.message;
  } finally {
    submit.disabled = false;
  }
}

function download(name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Скопировано');
  } catch {
    showDialog(`<div class="sheet-body"><h2 id="modal-title">Скопируй вручную</h2><textarea class="field" rows="4" readonly aria-label="Текст">${escapeHtml(text)}</textarea></div>`);
  }
}

async function shareProject(id) {
  const project = projectById(id);
  if (id.startsWith('local-')) {
    toast('Проект пока только в твоём браузере');
    return;
  }
  const address = new URL(location.href);
  address.hash = `/project/${encodeURIComponent(id)}`;
  const url = address.href;
  try {
    if (navigator.share) await navigator.share({ title: project.title, url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Ссылка скопирована');
    }
    trackSignal(project, 'share');
  } catch (error) {
    if (error.name !== 'AbortError') showDialog(`<div class="sheet-body"><h2 id="modal-title">Ссылка</h2><input class="field" readonly value="${escapeHtml(url)}" aria-label="Ссылка на проект"></div>`);
  }
}

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function sendPrompt(text) {
  promptDraft = '';
  messages.push({ role: 'user', text }, { role: 'assistant', text: `В «${source.name}» ${files.length} файлов, выбран ${selectedFile?.path || 'README'}. В редакторе модель не подключена: чтобы Claude Code или Codex выполнили задачу и показали шаги, подключи компьютер с этой папкой.`, link: '#/ai/connect' });
  workspacePane = 'assistant';
  render();
  const chat = document.querySelector('#chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function formError(form, message) {
  haptic('error');
  const element = form.querySelector?.('.form-error');
  if (element) element.textContent = message; else toast(message);
}

/* Events */

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (hapticActions[action]) haptic(hapticActions[action]);
  const adItem = ['open-project', 'media'].includes(action) ? target.closest?.('.feed-item.is-ad') : null;
  if (adItem) reportAd(adItem.dataset.ad, 'click');
  if (action === 'close-modal') closeAnimated();
  else if (action === 'ad-skip') skipAd(target);
  else if (action === 'boost') openBoost(id);
  else if (action === 'plus') openPlus();
  else if (action === 'pay-test') payTest(id, target);
  else if (action === 'plus-pay') {
    target.disabled = true;
    apiCall('POST', '/api/plus').then(({ payment }) => { closeLayer(); handlePayment(payment); }).catch(error => { target.disabled = false; toast(error.message); });
  }
  else if (action === 'home') {
    const feed = document.querySelector('#feed');
    if (route().section === 'feed' && feed) {
      event.preventDefault();
      if (feed.scrollTop > 0) feed.scrollTo?.({ top: 0, behavior: 'smooth' }); else refreshFeed();
    }
  } else if (action === 'feed-refresh') {
    const feed = document.querySelector('#feed');
    if (feed?.scrollTop > 0) feed.scrollTo?.({ top: 0, behavior: 'smooth' });
    refreshFeed();
  } else if (action === 'not-interested') {
    if (activeView?.id === id) endView();
    trackSignal(projectById(id), 'hide');
    if (feedOrder) feedOrder.entries = feedOrder.entries.filter(entry => entry.id !== id);
    closeDialog();
    document.querySelectorAll?.(`.feed-item[data-project="${id}"]`).forEach(item => item.remove?.());
    toast('Покажем меньше похожего');
  } else if (action === 'reset-taste') {
    if (!confirm('Сбросить то, что лента узнала о твоих интересах?')) return;
    if (online && me) {
      try { remote.taste = cleanTaste((await apiCall('DELETE', '/api/me/taste')).taste); } catch (error) { toast(error.message); return; }
    } else {
      localTaste = emptyTaste();
      saveTaste();
    }
    feedOrder = null;
    render();
    toast('Интересы сброшены');
  } else if (action === 'back') {
    if (history.length > 1) history.back();
    else location.hash = route().section === 'inbox' ? '#/inbox' : '#/feed';
  } else if (action === 'publish') openPublish();
  else if (action === 'profile') go(isMine(target.dataset.handle) ? '#/me' : `#/u/${encodeURIComponent(target.dataset.handle)}`);
  else if (action === 'open-project') navigateToProject(id);
  else if (action === 'post-link') trackSignal(projectById(id), /steampowered\.com|s\.team/.test(target.href || '') ? 'wishlist' : 'open');
  else if (action === 'media') {
    const now = Date.now();
    clearTimeout(tapTimer);
    if (lastTap.id === id && now - lastTap.time < 300) {
      lastTap = { time: 0, id: '' };
      if (!online || me) burst(target, event);
      toggleProjectFlag('vote', id, { onlyOn: true });
      haptic('success');
    } else {
      lastTap = { time: now, id };
      tapTimer = setTimeout(() => navigateToProject(id), 300);
    }
  } else if (action === 'comments') openComments(id);
  else if (action === 'share') openShare(id);
  else if (action === 'feed-mode') setFeedMode(target.dataset.mode);
  else if (action === 'hub-tab') { hubTab = target.dataset.tab || 'feed'; rerenderHub(id); }
  else if (action === 'playtest-join') joinPlaytest(id, target);
  else if (action === 'playtest-open') openPlaytest(id);
  else if (action === 'playtest-edit') openPlaytestEditor(id);
  else if (action === 'playtest-run') runPlaytestPrompt(id);
  else if (action === 'playtests') openPlaytestsList();
  else if (action === 'playtest-close') { if (confirm('Закрыть набор тестеров? Отчёты останутся в «Отзывах», доступ к папке у тестеров пропадёт.')) playtestCall(id, 'playtest', { open: false }, 'Набор закрыт'); }
  else if (action === 'playtest-leave') { closeLayer(); playtestCall(id, 'playtest/leave', {}, 'Ты больше не тестер этого проекта'); }
  else if (action === 'playtest-invite') {
    const project = projectById(target.dataset.project);
    if (!project?.playtest?.open) { toast('Сначала создай тест-задание — потом позовёшь людей'); openPlaytestEditor(target.dataset.project); }
    else playtestCall(target.dataset.project, 'playtest/invite', { handle: target.dataset.handle }, result => result.again ? 'Уже звал — второе приглашение не пришлём' : `@${target.dataset.handle} получит приглашение в тестеры`);
  }
  else if (action === 'hub-open') { hubTab = target.dataset.tab || 'steam'; navigateToProject(id); }
  else if (action === 'hub-link') hubCall(id, 'link', { workspaceId: target.dataset.workspace || '' }, target.dataset.workspace ? 'Пост связан с папкой в ИИ-мире' : 'Связь убрана');
  else if (action === 'hub-digest-task') hubDigestTask(id);
  else if (action === 'hub-demo-task') hubDemoTask(id, target);
  else if (action === 'demo-apply') { target.disabled = true; hubCall(id, 'demo', { url: target.dataset.url }, 'Демо в посте обновлено — подписчики узнают'); }
  else if (action === 'demo-dismiss') hubCall(id, 'demo', { dismiss: true });
  else if (action === 'review-demo') openReview(id);
  else if (action === 'fb-filter') { feedbackFilter = target.dataset.kind || 'all'; rerenderHub(id); }
  else if (action === 'fb-open') { feedbackOpenOnly = !feedbackOpenOnly; rerenderHub(id); }
  else if (action === 'fb-helpers') { helpersAll = !helpersAll; rerenderHub(id); }
  else if (action === 'comment-menu') {
    const rect = target.getBoundingClientRect?.();
    openCommentMenu(target.dataset.project, id, rect ? { x: finePointer() ? rect.left : rect.left + rect.width / 2, y: rect.bottom + 4 } : null);
  }
  else if (action === 'people') openPeople(target.dataset.handle, target.dataset.list || 'followers');
  else if (action === 'plus-trial') startPlusTrial(target);
  else if (action === 'comment-label') labelComment(target.dataset.project, id, target.dataset.label || '');
  else if (action === 'comment-prompt') openCommentPrompt(target.dataset.project, id);
  else if (action === 'help-info') openHelpInfo(target.dataset.handle);
  else if (action === 'fb-task') openFeedbackTask(id, target.dataset.kind);
  else if (action === 'hub-repo-check') { target.disabled = true; hubCall(id, 'repo-check', {}, 'Репозиторий проверен'); }
  else if (action === 'hub-steam') hubCall(id, 'steam', { status: target.dataset.status }).then(result => { if (result?.releaseBoost) toast('Поздравляем с релизом! Пост сутки продвигается бесплатно'); });
  else if (action === 'hub-check') {
    const project = projectById(id);
    const checklist = { ...(project?.steam?.checklist || {}) };
    checklist[target.dataset.item] = !checklist[target.dataset.item];
    hubCall(id, 'steam', { checklist });
  }
  else if (action === 'hub-steam-texts') hubSteamTexts(id, target);
  else if (action === 'comment-accept') commentAction('POST', target.dataset.project, id, 'accept');
  else if (action === 'comment-task') openCommentTask(target.dataset.project, id);
  else if (action === 'task-to-update') taskToUpdate(id, target.dataset.project, target);
  else if (action === 'boost-gift') boostGift(id, target.dataset.pay, target);
  else if (action === 'plus-sparks') plusForSparks(target);
  else if (action === 'sparks-sheet') openSparks();
  else if (action === 'feed-modes') { event.preventDefault(); toggleModeMenu(); }
  else if (action === 'comment-sort') {
    commentSort = target.dataset.sort || 'best';
    try { storage.setItem(COMMENT_SORT_KEY, commentSort); } catch {}
    rerenderComments(id);
  }
  else if (action === 'thread-open') { openThreads.add(id); rerenderComments(target.dataset.project); }
  else if (action === 'ob-pick') pickOnboarding(target);
  else if (action === 'ob-next') { if (onboard && onboard.step < (onboard.last || 3)) { onboard.step += 1; openOnboarding(); } else finishOnboarding(false); }
  else if (action === 'ob-back') { if (onboard) { onboard.step = Math.max(1, onboard.step - 1); openOnboarding(); } }
  else if (action === 'ob-skip') finishOnboarding(true);
  else if (action === 'set-option') chooseSetting(target.dataset.name, target.dataset.value);
  else if (action === 'account-sheet') openAccountSheet();
  else if (action === 'blocked-sheet') openBlockedSheet();
  else if (action === 'layer-close') closeLayer();
  else if (action === 'media-focus') openMediaFocus(Number(target.dataset.index) || 0);
  else if (action === 'pe-focus') openBlockFocus(Number(target.dataset.index));
  else if (action === 'share-native') await shareProject(id);
  else if (action === 'share-to') shareTo(id, target.dataset.handle, target);
  else if (action === 'repost') toggleRepost(id);
  else if (action === 'copy-link') { copyText(projectLink(id)); trackSignal(projectById(id), 'share'); }
  else if (action === 'post-menu') openPostMenu(id);
  else if (action === 'user-menu') openUserMenu(target.dataset.handle);
  else if (action === 'watch') toggleWatch(id, target);
  else if (action === 'report') openReport(target.dataset.kind, id || target.dataset.handle, target.dataset.project || '');
  else if (action === 'block') toggleBlock(target.dataset.handle);
  else if (action === 'feed-prefs') openFeedPrefs();
  else if (action === 'pref-set') setPref(target.dataset.key, target.dataset.kind || '', id);
  else if (action === 'notify-settings') openNotifySettings();
  else if (action === 'push-on') enablePush(target);
  else if (action === 'push-off') disablePush();
  else if (action === 'push-test') {
    target.disabled = true;
    apiCall('POST', '/api/push/test').then(result => toast(result.delivered ? 'Отправили — проверь уведомление' : 'Не дошло: выключи и включи уведомления заново')).catch(error => toast(error.message)).finally(() => { target.disabled = false; });
  }
  else if (action === 'install-app') installApp();
  else if (action === 'ask-push-yes') { document.querySelector('.push-ask')?.remove?.(); enablePush(); }
  else if (action === 'ask-push-no') document.querySelector('.push-ask')?.remove?.();
  else if (action === 'new-update') openUpdateForm(id);
  else if (action === 'delete-update') deleteUpdate(id, target.dataset.update);
  else if (action === 'play-demo') openPlayer(id);
  else if (action === 'player-full') { const frame = modal.querySelector?.('.player-frame'); (frame?.requestFullscreen || frame?.webkitRequestFullscreen)?.call(frame); }
  else if (action === 'import-link') importLink(target);
  else if (action === 'like-comment') likeComment(target.dataset.project, id, target);
  else if (action === 'reply-comment') { replyTarget = { projectId: target.dataset.project, id, name: target.dataset.name || '' }; rerenderComments(target.dataset.project); modal.querySelector?.('#comment-form input[name="text"]')?.focus?.(); }
  else if (action === 'reply-cancel') { const projectId = replyTarget?.projectId; replyTarget = null; if (projectId) rerenderComments(projectId); }
  else if (action === 'pin-comment') commentAction('POST', target.dataset.project, id, 'pin');
  else if (action === 'delete-comment') { if (confirm('Удалить комментарий? Ответы на него тоже пропадут.')) commentAction('DELETE', target.dataset.project, id, ''); }
  else if (action === 'digest') showDigest(id, target);
  else if (action === 'voice-rec') { if (hasPlusNow()) startVoice(id); else openPaywall('voice', () => { rerenderComments(id); startVoice(id); }); }
  else if (action === 'profile-card') { const rect = target.getBoundingClientRect?.(); openProfileCard(target.dataset.handle, rect ? { x: rect.left, y: rect.bottom + 6 } : null); }
  else if (action === 'look') { if (hasPlusNow()) openLookEditor(); else openPaywall('look', openLookEditor); }
  else if (action === 'voice-stop') stopVoice(true);
  else if (action === 'voice-cancel') stopVoice(false);
  else if (action === 'play-voice') playVoice(target);
  else if (action === 'vote' || action === 'save') {
    await toggleProjectFlag(action, id);
    if (target.closest?.('dialog') && action === 'vote') target.setAttribute('aria-pressed', String(state.votes.includes(id)));
  } else if (action === 'follow') {
    const following = !state.follows.includes(target.dataset.handle);
    toggleFollow(target.dataset.handle, target);
    if (following && online && me) maybeAskPush('Сообщать о новых проектах автора?');
  }
  else if (action === 'slide') changeSlide(id, Number(target.dataset.direction));
  else if (action === 'feed-step') stepFeed(Number(target.dataset.direction));
  else if (action === 'step') {
    openStep = id;
    const index = steamSteps.findIndex(step => step.id === id);
    const wrap = document.querySelector('.steps');
    const detail = document.querySelector('[data-step-detail]');
    if (wrap?.querySelectorAll && detail) {
      wrap.style.setProperty('--p', index / (steamSteps.length - 1));
      wrap.querySelectorAll('.step').forEach((element, position) => {
        element.classList.toggle('on', position === index);
        element.classList.toggle('done', position <= index);
        element.setAttribute('aria-pressed', String(position === index));
      });
      detail.textContent = steamSteps[index].text;
      detail.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
    } else render();
  } else if (action === 'ready') {
    state.readiness = toggleMembership(state.readiness, id);
    persist();
    const pct = readinessPercent();
    const on = state.readiness.includes(id);
    target.classList.toggle('on', on);
    target.setAttribute('aria-pressed', String(on));
    const ring = document.querySelector('.ring-fg');
    if (ring?.style) { ring.style.strokeDasharray = `${pct} 100`; ring.style.opacity = pct ? 1 : 0; }
    const label = document.querySelector('[data-ready-pct]');
    if (label) label.textContent = `${pct}%`;
    document.querySelector('.ready-cta')?.classList.toggle('show', pct === 100);
    if (pct === 100 && on) toast('Можно подавать заявку 🎉');
  } else if (action === 'application') openApplication(id || '');
  else if (action === 'document') {
    const document = steamDocuments.find(item => item.id === id);
    showDialog(`<div class="sheet-body doc-reader"><span class="hero-icon steam">${icon(document.icon)}</span><h2 id="modal-title">${document.title}</h2><p class="lead">${document.subtitle}</p><p class="body-text">${document.content}</p><button class="btn btn-ghost" data-action="download-document" data-id="${id}">${icon('download')} Скачать .md</button></div>`);
  } else if (action === 'download-document') {
    const document = steamDocuments.find(item => item.id === id);
    download(`${document.id}.md`, `# ${document.title}\n\n${document.content}\n`, 'text/markdown;charset=utf-8');
  } else if (action === 'download-application') {
    const application = myApplications()[Number(target.dataset.index) || 0];
    if (application) download('publishing-application.md', `# Заявка на паблишинг\n\nИгра: ${application.title}\n\nСтадия: ${application.stage}\n\nДемонстрация: ${application.url || '—'}\n\n${application.description}\n\nКонтакт: ${application.contact}\n`, 'text/markdown;charset=utf-8');
  } else if (action === 'topic') openTopic(id);
  else if (action === 'new-topic') {
    if (needLogin('Чтобы создавать темы, войди в аккаунт')) return;
    showDialog(`<div class="sheet-body"><h2 id="modal-title">Новая тема</h2><form id="topic-form" class="form"><input name="title" required maxlength="160" placeholder="Заголовок" aria-label="Заголовок">${chipRadio('category', [['Разработка', 'Разработка'], ['Релизы', 'Релизы'], ['Паблишинг', 'Паблишинг'], ['Общее', 'Общее']], 'Разработка')}<textarea name="text" required rows="4" maxlength="2400" placeholder="Вопрос или мысль" aria-label="Сообщение"></textarea><button type="submit" class="btn btn-primary btn-block">${icon('send')} Создать</button></form></div>`);
  } else if (action === 'connections') go('#/ai/connect/folder');
  else if (action === 'goto') go(target.dataset.href);
  else if (action === 'connect') openConnection(target.dataset.provider);
  else if (action === 'local-folder') await chooseLocalFolder();
  else if (action === 'demo-source') {
    const provider = target.dataset.provider;
    setFiles(demoFiles.map(file => ({ ...file })), { name: provider === 'github' ? 'demo/my-project' : 'Мой облачный проект', type: 'demo', label: `Пример · ${provider === 'google' ? 'Google Drive' : provider === 'yandex' ? 'Яндекс Диск' : provider === 'local' ? 'папка' : 'GitHub'}` });
  } else if (action === 'pane') {
    workspacePane = id;
    render();
  } else if (action === 'file') {
    selectedFile = files.find(file => file.path === target.dataset.path);
    if (isCompact()) workspacePane = 'code';
    render();
  } else if (action === 'download-file') {
    if (selectedFile) download(selectedFile.path.split('/').pop(), selectedFile.content);
  } else if (action === 'write-file') {
    if (!selectedFile?.handle || writingFile) return;
    const file = selectedFile;
    const content = file.content;
    writingFile = true;
    target.disabled = true;
    try {
      const current = await file.handle.getFile();
      if (await current.text() !== file.originalContent) {
        toast('Файл изменён снаружи — открой папку заново');
        return;
      }
      const writable = await file.handle.createWritable();
      await writable.write(content);
      await writable.close();
      file.originalContent = content;
      toast('Сохранено в папку');
    } catch {
      toast('Нет разрешения на запись');
    } finally {
      writingFile = false;
      target.disabled = false;
    }
  } else if (action === 'sample-prompt' || action === 'explain-file') {
    sendPrompt(action === 'sample-prompt' ? 'Помоги разобраться в структуре проекта' : `Объясни, что делает ${selectedFile?.path || 'этот файл'}`);
  } else if (action === 'readme') {
    const readme = `# ${source.name}\n\n## О проекте\n\nОпишите, какую задачу решает проект.\n\n## Файлы\n\n${files.map(file => `- ${file.path}`).join('\n')}\n\n## Запуск\n\nДобавьте проверенную команду запуска.\n`;
    download('README-draft.md', readme, 'text/markdown;charset=utf-8');
    toast('Черновик README скачан');
  } else if (action === 'open-demo') openDemo();
  else if (action === 'toggle-task') {
    completeTasks = toggleMembership(completeTasks, Number(target.dataset.index));
    openDemo();
  } else if (action === 'auth-mode') {
    authMode = id;
    authFlow = null;
    refreshAuth();
  } else if (action === 'auth-back') {
    const link = authFlow?.purpose === 'link';
    authFlow = null;
    if (link) openAccountSheet(); else refreshAuth();
  } else if (action === 'auth-resend') {
    if (!authFlow) return;
    target.disabled = true;
    try {
      await startEmailCode(authFlow.purpose, authFlow.fields);
      toast('Отправили новый код');
    } catch (error) { toast(error.message); }
    tickAuthResend();
    clearInterval(authResendTimer);
    authResendTimer = setInterval(tickAuthResend, 1000);
  } else if (action === 'logout') {
    await apiCall('POST', '/api/auth/logout').catch(() => {});
    me = null;
    ai.details.clear();
    ai.workspaces = [];
    await reloadAll();
    go('#/feed');
    toast('Ты вышел из аккаунта');
  } else if (action === 'edit-profile') openEditProfile();
  else if (action === 'rate') openRate(target.dataset.handle);
  else if (action === 'unrate') {
    const handle = target.dataset.handle;
    try {
      const result = await apiCall('DELETE', `/api/users/${encodeURIComponent(handle)}/rate`);
      updateUser(result.user);
      delete remote.myRatings[handle];
      reviewsCache.delete(handle);
      closeDialog();
      render();
      toast('Оценка убрана');
    } catch (error) { toast(error.message); }
  } else if (action === 'trust-info') openTrustInfo(target.dataset.handle);
  else if (action === 'edit-project') openPublish(id);
  else if (action === 'remove-task-file') {
    const list = ai.attachments[id] || [];
    const index = list.findIndex(item => item.localId === target.dataset.file);
    if (index >= 0) { const [item] = list.splice(index, 1); item.request?.abort?.(); if (item.preview) URL.revokeObjectURL(item.preview); }
    refreshTaskFiles(id);
  } else if (action === 'chat-panel') {
    const panel = document.querySelector('.chat-panel');
    if (panel) panel.hidden = !panel.hidden;
  } else if (action === 'chat-tab') {
    const panel = target.closest('.chat-panel');
    if (panel) {
      panel.dataset.tab = target.dataset.tab;
      panel.querySelectorAll('.panel-tabs button').forEach(button => button.classList.toggle('on', button === target));
    }
  } else if (action === 'insert-emoji') {
    const field = document.querySelector('#dm-form input[name="text"]');
    if (field) {
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? field.value.length;
      field.value = `${field.value.slice(0, start)}${target.dataset.emoji}${field.value.slice(end)}`;
      const caret = start + target.dataset.emoji.length;
      field.setSelectionRange?.(caret, caret);
    }
  } else if (action === 'send-sticker') {
    const form = document.querySelector('#dm-form');
    if (form) try { await sendChat(form.dataset.id, { sticker: id }); } catch (error) { toast(error.message); }
  } else if (action === 'react') {
    closeReactBar();
    await reactTo(route().page, id, target.dataset.emoji);
  } else if (action === 'view-chat-image') openViewer([`<img src="${escapeHtml(target.dataset.src)}" alt="" draggable="false">`], 0);
  else if (action === 'dictate') toggleDictation(target);
  else if (action === 'view-media') {
    const project = projectById(id);
    if (project) openViewer(viewerItemsFor(project), Number(target.dataset.index) || 0);
  } else if (action === 'view-game') {
    const game = studioGames.find(item => item.id === id);
    if (game) openViewer([game.header, ...game.shots].map(url => `<img src="${escapeHtml(url)}" alt="${escapeHtml(game.title)}" referrerpolicy="no-referrer" draggable="false">`), Number(target.dataset.index) || 0);
  } else if (action === 'viewer-close') closeViewer();
  else if (action === 'viewer-step') stepViewer(Number(target.dataset.direction));
  else if (action === 'wizard-step') setWizardStep(target.dataset.step);
  else if (action === 'pe-add') addBlock(target.dataset.type);
  else if (action === 'pe-style') styleBlock(Number(target.dataset.index), target.dataset.key, target.dataset.value || '');
  else if (action === 'pe-theme') {
    if (!postDraft) return;
    postDraft.theme[target.dataset.key] = target.dataset.value || (target.dataset.key === 'font' ? 'sans' : '');
    renderPageEditor();
  } else if (action === 'link-add' || action === 'link-remove') {
    if (!postDraft) return;
    if (action === 'link-add') postDraft.links.push(''); else postDraft.links.splice(Number(target.dataset.index), 1);
    const rows = modal.querySelector?.('.link-rows');
    if (rows) rows.innerHTML = linkRowsHtml();
    if (action === 'link-add') rows?.querySelector?.('[data-link]:last-of-type, .link-row:last-of-type input')?.focus?.();
  } else if (action === 'gallery') {
    const gallery = target.closest?.('.store-media')?.querySelector?.('.store-gallery');
    gallery?.scrollBy?.({ left: Number(target.dataset.direction) * gallery.clientWidth, behavior: 'smooth' });
  } else if (action === 'delete-project') {
    if (!confirm('Удалить проект из ленты? Это нельзя отменить.')) return;
    try {
      await apiCall('DELETE', `/api/projects/${encodeURIComponent(id)}`);
      remote.projects = remote.projects.filter(project => project.id !== id);
      closeDialog();
      render();
      toast('Проект удалён');
    } catch (error) { toast(error.message); }
  } else if (action === 'toggle-sound') {
    feedMuted = !feedMuted;
    document.querySelectorAll('video[data-feed-video]').forEach(video => { video.muted = feedMuted; });
    document.querySelectorAll('.sound-btn').forEach(button => { button.textContent = feedMuted ? '🔇' : '🔊'; button.setAttribute('aria-label', feedMuted ? 'Включить звук' : 'Выключить звук'); });
  } else if (action === 'media-cover') {
    const [item] = publishMedia.splice(Number(target.dataset.index), 1);
    publishMedia.unshift(item);
    const wrap = modal.querySelector?.('.image-pick-wrap');
    if (wrap) wrap.innerHTML = imagePickerHtml();
  } else if (action === 'remove-avatar') {
    avatarDraft = { url: '' };
    const holder = modal.querySelector?.('.avatar-edit');
    if (holder) holder.innerHTML = avatarEditInner();
  } else if (action === 'media-error') {
    if (!event.target.closest('.tile-retry')) toast(publishMedia.find(entry => entry.id === id)?.error || 'Не загрузилось');
  } else if (action === 'media-retry') {
    const item = publishMedia.find(entry => entry.id === id);
    if (item) item.task = mediaQueue = mediaQueue.then(() => prepareMedia(item));
  } else if (action === 'remove-image') {
    const [removed] = publishMedia.splice(Number(target.dataset.index), 1);
    removed?.request?.abort?.();
    if (removed?.file) URL.revokeObjectURL(removed.preview);
    renderPicker();
  } else if (action === 'copy') copyText(target.dataset.copy || '');
  else if (action === 'new-code') ensurePairCode(true);
  else if (action === 'share-command') navigator.share?.({ title: 'Команда для агента про.стим', text: agentCommand() }).catch(() => {});
  else if (action === 'prompt-chip') {
    ai.draft = target.dataset.text || '';
    const field = document.querySelector('[name="task-prompt"]');
    if (field) { field.value = ai.draft; field.focus?.(); }
  } else if (action === 'cancel-task') {
    target.disabled = true;
    try { await apiCall('POST', `/api/tasks/${encodeURIComponent(id)}/cancel`); } catch (error) { toast(error.message); target.disabled = false; }
  } else if (action === 'tree-dir') {
    const key = `${id}:${target.dataset.path}`;
    if (ai.expanded.has(key)) ai.expanded.delete(key); else ai.expanded.add(key);
    const tree = target.closest?.('.files-tree');
    if (tree) tree.innerHTML = treeHtml(id); else render();
  } else if (action === 'ws-file') openWorkspaceFile(id, target.dataset.path);
  else if (action === 'close-ws-file') { ai.file = null; render(); }
  else if (action === 'save-ws-file') {
    const file = ai.file;
    if (!file) return;
    target.disabled = true;
    try {
      const result = await apiCall('PUT', `/api/workspaces/${encodeURIComponent(file.id)}/file`, { path: file.path, content: file.content, baseHash: file.hash });
      Object.assign(file, { hash: result.hash, original: file.content });
      ai.git.delete(file.id);
      toast('Сохранено на компьютере');
      render();
    } catch (error) {
      toast(error.message);
      target.disabled = false;
    }
  } else if (action === 'refresh-git') loadGit(id, true);
  else if (action === 'refresh-tree') loadTree(id, true);
  else if (action === 'remove-share') {
    try {
      const { workspace } = await apiCall('DELETE', `/api/workspaces/${encodeURIComponent(id)}/shares/${encodeURIComponent(target.dataset.handle)}`);
      Object.assign(ai.details.get(id), { shares: workspace.shares });
      render();
    } catch (error) { toast(error.message); }
  } else if (action === 'revoke-device') {
    if (!confirm('Отвязать компьютер? Агент на нём перестанет получать задачи, пока его не привяжут заново.')) return;
    try {
      await apiCall('DELETE', `/api/devices/${encodeURIComponent(id)}`);
      ai.details.clear();
      await refreshWorkspaces();
      go('#/ai');
      toast('Компьютер отвязан');
    } catch (error) { toast(error.message); }
  }
});

document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const value = name => String(data.get(name) || '').trim();
  const submit = form.querySelector?.('button[type="submit"]');
  if (form.id === 'auth-form') {
    const mode = form.dataset.mode;
    const register = mode === 'register';
    const fields = { name: value('name'), handle: value('handle').replace(/^@/, ''), password: String(data.get('password') || ''), email: value('email') };
    if (submit) submit.disabled = true;
    try {
      if (mode === 'code' || (register && emailSignIn())) {
        await startEmailCode(register ? 'register' : 'login', register ? fields : { email: fields.email });
        refreshAuth();
        return;
      }
      await apiCall('POST', register ? '/api/auth/register' : '/api/auth/login', fields);
      await finishAuth(register);
    } catch (error) {
      formError(form, error.message);
      if (submit) submit.disabled = false;
    }
    return;
  }
  if (form.id === 'auth-code-form' || form.id === 'link-code-form') {
    if (!authFlow) return;
    if (submit) submit.disabled = true;
    try {
      await apiCall('POST', '/api/auth/email/verify', { email: authFlow.email, code: value('code') });
      if (authFlow.purpose === 'link') {
        authFlow = null;
        await reloadAll({ rerender: false });
        openAccountSheet();
        toast('Почта привязана');
      } else await finishAuth(authFlow.purpose === 'register');
    } catch (error) {
      formError(form, error.message);
      if (submit) submit.disabled = false;
      const input = form.querySelector?.('[name="code"]');
      if (input) { input.value = ''; input.focus?.(); }
    }
    return;
  }
  if (form.id === 'boost-form') {
    if (submit) submit.disabled = true;
    try {
      const { payment } = await apiCall('POST', '/api/promotions', { projectId: form.dataset.id, plan: data.get('plan') });
      handlePayment(payment);
    } catch (error) {
      formError(form, error.message);
      if (submit) submit.disabled = false;
    }
    return;
  }
  if (form.id === 'password-form') {
    if (submit) submit.disabled = true;
    try {
      await apiCall('POST', '/api/me/password', { current: String(data.get('current') || ''), password: String(data.get('password') || '') });
      await reloadAll({ rerender: false });
      openAccountSheet();
      toast('Пароль сохранён');
    } catch (error) {
      formError(form, error.message);
      if (submit) submit.disabled = false;
    }
    return;
  }
  if (form.id === 'link-email-form') {
    if (submit) submit.disabled = true;
    try {
      await startEmailCode('link', { email: value('email') });
      openAccountSheet();
    } catch (error) {
      formError(form, error.message);
      if (submit) submit.disabled = false;
    }
    return;
  }
  if (form.id === 'publish-form') {
    if (!postDraft) return;
    if (postDraft.step < 3) { setWizardStep(postDraft.step + 1); return; }
    if (!stepOneValid(form)) return;
    if (postDraft.blocks.some(block => block.uploading)) { formError(form, 'Подожди, файлы ещё загружаются'); return; }
    const brokenButton = postDraft.blocks.findIndex(block => block.type === 'button' && !linkKind(block.url));
    if (brokenButton >= 0) {
      showWizardStep(3);
      selectBlock(brokenButton);
      modal.querySelector?.(`.peb[data-block="${brokenButton}"] [data-pe="url"]`)?.focus?.();
      formError(form, 'У кнопки нет рабочей ссылки: вставь адрес или удали блок');
      return;
    }
    const tags = value('tags').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 5);
    const fields = {
      title: value('title'), summary: value('summary'), category: data.get('category') || 'apps', tags,
      stage: data.get('stage') || '', platforms: data.getAll('platforms'), pricing: data.get('pricing') || '', seeking: data.getAll('seeking'),
      ai: data.get('ai') === 'on', madeWith: value('madeWith'), links: data.getAll('link').map(String), demo: value('demo'), theme: { ...postDraft.theme }, page: draftPage()
    };
    const editing = postDraft.id;
    const label = editing ? 'Сохранить' : 'Опубликовать';
    let savedId = editing;
    if (online) {
      if (submit) submit.disabled = true;
      try {
        await waitForMedia(submit);
        if (publishMedia.some(item => item.status === 'error' || !item.url)) {
          showWizardStep(1);
          throw new Error('Убери файлы с ошибкой или нажми «Повторить»');
        }
        const media = [];
        for (const item of publishMedia) {
          const poster = item.type === 'video' ? item.posterUrl || (item.poster ? (item.posterUrl = await uploadBlob(item.poster, 'image').catch(() => '')) : '') : '';
          media.push({ url: item.url, ...(poster ? { poster } : {}), ...(item.focus ? { focus: item.focus } : {}) });
        }
        if (submit) submit.textContent = editing ? 'Сохраняем…' : 'Публикуем…';
        const { project } = await apiCall(editing ? 'PATCH' : 'POST', editing ? `/api/projects/${encodeURIComponent(editing)}` : '/api/projects', { ...fields, media, video: value('video') });
        replaceProject(project);
        savedId = project.id;
      } catch (error) {
        formError(form, error.message);
        if (submit) { submit.disabled = false; submit.textContent = label; }
        return;
      }
    } else {
      const clean = cleanPostFields(fields);
      const local = { ...fields, ...clean, url: clean.links[0] || '', scene: '', tags: tags.length ? tags : ['Новый проект'] };
      const existing = state.projects.find(project => project.id === editing);
      if (existing) Object.assign(existing, local);
      else state.projects.unshift({ id: newId('local'), ...local, author: 'Вы', initials: 'Я', handle: 'me', color: '#e5e1d8', votes: 0, createdAt: Date.now(), slides: 1, comments: [] });
      savedId = existing ? existing.id : state.projects[0].id;
      persist();
    }
    clearPublishMedia();
    postDraft = null;
    if (editing) {
      slides.delete(savedId);
      const saved = projectById(savedId);
      document.querySelectorAll?.(`.card-media[data-id="${savedId}"]`).forEach(media => { if (saved) media.innerHTML = mediaInner(saved, media.dataset.reason || ''); });
      refresh();
      openProject(savedId);
      toast('Сохранено ✓');
      return;
    }
    pinnedProjectId = savedId;
    feedCategory = 'all';
    feedOrder = null;
    feedScrollTop = 0;
    go('#/feed');
    render();
    toast('Опубликовано ✓');
    haptic('success');
  } else if (form.id === 'report-form') {
    if (!data.get('reason')) { formError(form, 'Выбери причину'); return; }
    if (submit) submit.disabled = true;
    try {
      await apiCall('POST', '/api/reports', { kind: form.dataset.kind, id: form.dataset.id, project: form.dataset.project, reason: data.get('reason'), note: value('note') });
      hideReported(form.dataset.kind, form.dataset.id, form.dataset.project);
      closeDialog();
      toast('Спасибо. Жалоба у модераторов, автор не узнает, кто её отправил');
    } catch (error) { formError(form, error.message); if (submit) submit.disabled = false; }
  } else if (form.id === 'update-form') {
    if (!value('title')) { formError(form, 'Напиши, что нового'); return; }
    if (submit) submit.disabled = true;
    try {
      const { project } = await apiCall('POST', `/api/projects/${encodeURIComponent(form.dataset.id)}/updates`, { title: value('title'), version: value('version'), text: value('text'), image: form.dataset.image || '', taskId: form.dataset.task || '' });
      replaceProject(project);
      openProject(project.id);
      toast(project.watchers ? `Обновление ушло ${project.watchers} подписчикам проекта` : 'Обновление опубликовано');
    } catch (error) { formError(form, error.message); if (submit) submit.disabled = false; }
  } else if (form.id === 'comment-form') {
    if (!value('text')) return;
    if (needLogin('Чтобы комментировать, войди в аккаунт')) return;
    const id = form.dataset.id;
    if (online) {
      try {
        const result = await apiCall('POST', `/api/projects/${encodeURIComponent(id)}/comments`, { text: value('text'), replyTo: value('replyTo') });
        replaceProject(result.project);
        freshComment = result.comment || '';
      } catch (error) { toast(error.message); return; }
    } else {
      state.comments[id] ||= [];
      state.comments[id].push({ name: 'Вы', text: value('text'), time: 'сейчас' });
      persist();
    }
    trackSignal(projectById(id), 'comment');
    const answered = Boolean(replyTarget);
    replyTarget = null;
    const posted = freshComment ? projectById(id)?.comments?.find(item => item.id === freshComment) : null;
    if (posted?.replyTo) openThreads.add(posted.replyTo);
    refresh();
    rerenderComments(id);
    const fresh = freshComment ? modal.querySelector?.(`.comment[data-comment="${freshComment}"]`) : null;
    fresh?.classList.add('fresh');
    fresh?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    freshComment = '';
    maybeAskPush(answered ? 'Сообщить, когда ответят снова?' : 'Сообщить, когда тебе ответят?');
  } else if (form.id === 'application-form') {
    if (!value('title') || !value('description') || !value('contact')) return;
    let application = Object.fromEntries(data);
    if (online) {
      try { application = (await apiCall('POST', '/api/applications', application)).application; remote.applications.unshift(application); await reloadAll({ rerender: false }); } catch (error) { toast(error.message); return; }
    } else {
      state.applications.unshift(application);
      persist();
    }
    showDialog(`<div class="sheet-body success"><span class="hero-icon done">${icon('check')}</span><h2 id="modal-title">${online ? 'Заявка отправлена' : 'Черновик сохранён'}</h2><p class="lead">${escapeHtml(application.title)} — ${online ? 'ответ придёт во «Входящие»' : 'в профиле, во вкладке заявок'}.</p><div class="sheet-actions"><button class="btn btn-primary" data-action="download-application" data-index="0">${icon('download')} Скачать</button><button class="btn btn-ghost" data-action="goto" data-href="#/me/applications">В профиль</button></div></div>`);
  } else if (form.id === 'topic-form') {
    if (!value('title') || !value('text')) return;
    let topic;
    if (online) {
      try { topic = (await apiCall('POST', '/api/topics', { title: value('title'), category: data.get('category'), text: value('text') })).topic; remote.topics.unshift(topic); } catch (error) { toast(error.message); return; }
    } else {
      topic = { id: newId('topic'), title: value('title'), category: data.get('category'), author: 'Вы', replies: [value('text')] };
      state.topics.unshift(topic);
      persist();
    }
    render();
    openTopic(topic.id);
  } else if (form.id === 'reply-form') {
    if (!value('text')) return;
    if (needLogin('Чтобы отвечать в темах, войди в аккаунт')) return;
    const id = form.dataset.id;
    if (online) {
      try {
        const { topic } = await apiCall('POST', `/api/topics/${encodeURIComponent(id)}/replies`, { text: value('text') });
        remote.topics = remote.topics.map(item => item.id === topic.id ? topic : item);
      } catch (error) { toast(error.message); return; }
    } else {
      state.replies[id] ||= [];
      state.replies[id].push({ name: 'Вы', text: value('text') });
      persist();
    }
    render();
    openTopic(id);
  } else if (form.id === 'dm-form') {
    if (!value('text')) return;
    dictation?.stop();
    try { await sendChat(form.dataset.id, { text: value('text') }); } catch (error) { toast(error.message); return; }
    document.querySelector('#dm-form input')?.focus?.();
  } else if (form.id === 'github-form') await openGitHub(form);
  else if (form.id === 'prompt-form') {
    if (value('prompt')) sendPrompt(value('prompt'));
  } else if (form.id === 'demo-task-form') {
    if (!value('task')) return;
    demoTasks.push(value('task'));
    openDemo();
    modal.querySelector?.('#demo-task-form input')?.focus?.();
  } else if (form.id === 'profile-form') {
    try {
      const patch = { name: value('name'), bio: value('bio') };
      if (avatarDraft) patch.avatar = avatarDraft.blob ? await uploadBlob(avatarDraft.blob) : '';
      const result = await apiCall('PATCH', '/api/me', patch);
      avatarDraft = null;
      updateUser(result.me);
      closeDialog();
      render();
      toast('Профиль обновлён');
    } catch (error) { toast(error.message); }
  } else if (form.id === 'rate-form') {
    const handle = form.dataset.handle;
    const score = Number(data.get('score'));
    if (!score) { toast('Выбери от 1 до 5 звёзд'); return; }
    try {
      const result = await apiCall('POST', `/api/users/${encodeURIComponent(handle)}/rate`, { score, text: value('text') });
      updateUser(result.user);
      remote.myRatings[handle] = result.myRating;
      reviewsCache.delete(handle);
      closeDialog();
      render();
      toast('Спасибо, оценка сохранена');
    } catch (error) { toast(error.message); }
  } else if (form.id === 'task-form') await submitTask(form);
  else if (form.id === 'share-form') {
    const id = form.dataset.id;
    try {
      const { workspace } = await apiCall('POST', `/api/workspaces/${encodeURIComponent(id)}/shares`, { handle: value('handle'), role: value('role') });
      Object.assign(ai.details.get(id), { shares: workspace.shares });
      render();
      toast('Доступ открыт');
    } catch (error) { toast(error.message); }
  }
});

document.addEventListener('input', event => {
  if (event.target.name === 'plan' && event.target.form?.id === 'boost-form') {
    const price = event.target.form.querySelector?.('[data-boost-price]');
    if (price) price.textContent = rub(event.target.dataset.price);
    return;
  }
  // The code field keeps digits only and sends itself once all six are in (also when pasted or autofilled).
  if (event.target.matches?.('.code-input')) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== event.target.value) event.target.value = digits;
    if (digits.length === 6) event.target.form?.requestSubmit?.();
    return;
  }
  const target = event.target;
  if (target.dataset?.pe && postDraft) {
    const block = postDraft.blocks[Number(target.dataset.index)];
    if (block) block[target.dataset.pe] = target.dataset.pe === 'items' ? target.value.split('\n') : target.value;
    if (target.tagName === 'TEXTAREA') autosize(target);
    if (block?.type === 'button' && target.dataset.pe === 'url') {
      const link = linkKind(target.value);
      const shell = target.closest?.('.peb')?.querySelector?.('.pe-button');
      if (shell?.firstElementChild) shell.firstElementChild.outerHTML = icon(link?.icon || 'external');
      const hint = target.closest?.('.peb')?.querySelector?.('.pe-hint');
      if (hint) hint.outerHTML = buttonHintHtml(block);
    }
    return;
  }
  if (target.dataset?.link !== undefined && postDraft) {
    const index = Number(target.dataset.link);
    postDraft.links[index] = target.value;
    const link = linkKind(target.value);
    const kind = modal.querySelector?.(`[data-kind-for="${index}"]`);
    if (kind) kind.innerHTML = `${icon(link?.icon || 'globe')}<small>${escapeHtml(link?.label || 'Ссылка')}</small>`;
    return;
  }
  if (target.dataset?.prefSearch !== undefined) {
    prefQuery = target.value;
    const box = modal.querySelector?.('#pref-suggest');
    if (box) box.innerHTML = suggestHtml(prefQuery);
    return;
  }
  if (target.name === 'search') {
    search = target.value;
    const results = document.querySelector('#search-results');
    if (results) results.innerHTML = searchResults();
    const authors = document.querySelector('#search-authors');
    if (authors) authors.innerHTML = creatorsHtml();
  }
  if (target.name?.startsWith?.('calc-')) {
    const key = target.name.slice(5);
    const amount = Number(target.value);
    if (key === 'price') calculator.price = amount;
    else if (key === 'copies') calculator.copiesIndex = amount;
    target.style?.setProperty('--fill', `${((amount - Number(target.min)) / (Number(target.max) - Number(target.min))) * 100}%`);
    updateCalculator();
  }
  if (target.id === 'file-editor' && selectedFile) selectedFile.content = target.value;
  if (target.id === 'prompt') promptDraft = target.value;
  if (target.name === 'task-prompt') ai.draft = target.value;
  if (target.name === 'tree-filter') {
    ai.treeFilter = target.value;
    const tree = target.closest?.('.files-tree')?.querySelector?.('.tree');
    if (tree) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = treeHtml(route().extra);
      tree.replaceWith(wrapper.querySelector('.tree') || wrapper);
    }
  }
  if (target.name === 'ws-file-editor' && ai.file) {
    const wasDirty = ai.file.content !== ai.file.original;
    ai.file.content = target.value;
    if (wasDirty !== (ai.file.content !== ai.file.original)) {
      const head = document.querySelector('.viewer-head');
      if (head) {
        const holder = document.createElement('div');
        holder.innerHTML = fileViewerHtml(ai.details.get(ai.file.id));
        head.replaceWith(holder.querySelector('.viewer-head'));
      }
    }
  }
});

document.addEventListener('change', async event => {
  const changed = event.target;
  if (changed?.dataset?.notify) { saveNotifyPref(changed.dataset.notify, changed.checked); return; }
  if (changed?.dataset?.setting) { toggleSetting(changed.dataset.setting, changed.checked); return; }
  if (changed?.dataset?.steamDate) { hubCall(changed.dataset.steamDate, 'steam', { releaseAt: changed.value ? new Date(`${changed.value}T12:00:00`).getTime() : 0 }, 'Дата выхода сохранена'); return; }
  if (changed?.dataset?.demoInput !== undefined) { checkDemoField(changed); return; }
  if (changed?.dataset?.updateImage !== undefined) { attachUpdateImage(changed); return; }
  const target = event.target;
  if (target.name === 'pair-allow') { ai.pairAllow = target.value; renderKeepingInput(); }
  else if (target.name === 'pair-os') { ai.pairOs = target.value; renderKeepingInput(); }
  else if (target.name === 'task-mode') ai.mode = target.value;
  else if (target.name === 'task-engine') { ai.engine[route().extra] = target.value; renderKeepingInput(); }
  else if (target.name === 'task-continue') ai.continueChat = target.checked;
  else if (target.name === 'images' && target.files) { addPublishFiles(target.files); target.value = ''; }
  else if (target.dataset?.chatImage && target.files?.[0]) {
    const file = target.files[0];
    target.value = '';
    toast('Отправляем картинку…');
    try {
      const blob = file.type === 'image/gif' ? file : await imageToBlob(file, 1800);
      const url = await uploadBlob(blob, 'image');
      const field = document.querySelector('#dm-form input[name="text"]');
      await sendChat(target.dataset.chatImage, { image: url, text: field?.value.trim() || '' });
    } catch (error) { toast(error.message); }
  }
  else if (target.dataset?.taskFiles && target.files?.length) { addTaskFiles(target.dataset.taskFiles, target.files); target.value = ''; }
  else if (target.dataset?.peFile && target.files?.[0]) { const file = target.files[0]; target.value = ''; await addPageMedia(file, target.dataset.peFile); }
  else if (target.dataset?.peTheme && postDraft) { postDraft.theme[target.dataset.peTheme] = target.value; renderPageEditor(); }
  else if (target.dataset?.peColor !== undefined && postDraft) styleBlock(Number(target.dataset.peColor), 'color', target.value);
  else if (target.dataset?.single !== undefined && target.checked) {
    target.closest?.('.chip-radio')?.querySelectorAll?.(`input[name="${target.name}"]`).forEach(input => { if (input !== target) input.checked = false; });
  }
  else if (target.name === 'avatar-file' && target.files?.[0]) {
    const file = target.files[0];
    target.value = '';
    if (!file.type.startsWith('image/')) { toast('Это не картинка'); return; }
    openCropper({ file, aspect: 1, round: true, size: 512, title: 'Аватарка', onDone: blob => {
      avatarDraft = { blob, preview: URL.createObjectURL(blob) };
      const holder = modal.querySelector?.('.avatar-edit');
      if (holder) holder.innerHTML = avatarEditInner();
    } });
  }
});

document.querySelector('#directory-import').addEventListener('change', async event => {
  const imported = [];
  for (const file of Array.from(event.target.files).slice(0, 150)) {
    if (file.size <= 512000 && /\.(md|txt|html|css|js|jsx|ts|tsx|json|py|yml|yaml|toml|rs|go|sql)$/i.test(file.name)) imported.push({ path: file.webkitRelativePath || file.name, content: await file.text() });
  }
  if (!imported.length) { toast('Нет текстовых файлов'); return; }
  setFiles(imported, { name: imported[0].path.split('/')[0], type: 'import', label: 'Импорт папки' });
  event.target.value = '';
});

document.addEventListener('pointerdown', event => {
  const media = event.target.closest?.('.card-media');
  pointerStart = media && !event.target.closest('button') ? { x: event.clientX, y: event.clientY, id: media.dataset.id } : null;
});
document.addEventListener('pointerup', event => {
  if (!pointerStart) return;
  const deltaX = event.clientX - pointerStart.x;
  const deltaY = event.clientY - pointerStart.y;
  if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
    changeSlide(pointerStart.id, deltaX < 0 ? 1 : -1);
    document.addEventListener('click', stopSwipeClick, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stopSwipeClick, true), 350);
  }
  pointerStart = null;
});
document.addEventListener('pointercancel', () => { pointerStart = null; });

document.addEventListener('touchstart', event => {
  const feed = event.target.closest?.('#feed');
  pullState = feed && feed.scrollTop <= 0 && !feedRefreshing && !modal.open && event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY, distance: 0 } : null;
}, { passive: true });
document.addEventListener('touchmove', event => {
  if (!pullState) return;
  const deltaY = event.touches[0].clientY - pullState.y;
  const deltaX = Math.abs(event.touches[0].clientX - pullState.x);
  if (deltaY <= 0 || deltaX > deltaY || (document.querySelector('#feed')?.scrollTop || 0) > 0) {
    if (pullState.distance) { pullState.distance = 0; setPull(0); }
    return;
  }
  pullState.distance = Math.min(120, deltaY * 0.5);
  setPull(pullState.distance);
}, { passive: true });
document.addEventListener('touchend', () => {
  if (!pullState) return;
  const ready = pullState.distance >= 70;
  pullState = null;
  if (ready) refreshFeed(); else setPull(0);
});
document.addEventListener('touchcancel', () => { if (pullState) { pullState = null; setPull(0); } });
window.addEventListener('pagehide', () => { endView(); flushFeedEvents(true); });
window.addEventListener('resize', () => sizeFeed());

// iPhone keyboard: the visual viewport shrinks, the layout one does not. Pinned composers follow the keyboard
// and the bottom bar steps aside while typing.
// The on-screen keyboard is open when a text field has focus and the visible screen got shorter.
// A browser bar that collapses or a pinch zoom also shrink the visible screen, so alone they do not count:
// before, they hid the tab bar at random.
const typingTypes = ['text', 'search', 'email', 'url', 'tel', 'password', 'number'];
function typingField() {
  const element = document.activeElement;
  if (!element || element === document.body) return null;
  if (element.isContentEditable || element.tagName === 'TEXTAREA') return element;
  return element.tagName === 'INPUT' && typingTypes.includes(element.type || 'text') ? element : null;
}

let keyboardOpen = false;
function syncKeyboard() {
  const viewport = window.visualViewport;
  if (!viewport || !document.body?.classList) return;
  const field = typingField();
  const shrink = viewport.scale > 1.01 ? 0 : Math.max(0, Math.round(innerHeight - viewport.height - viewport.offsetTop));
  const open = Boolean(field) && shrink > 120;
  document.documentElement.style.setProperty('--kb', `${open ? shrink : 0}px`);
  document.body.classList.toggle('keyboard', open);
  // A field in a sheet stays above the keyboard: the sheet is lifted by CSS, this brings the field into view.
  if (open && !keyboardOpen && field.closest?.('dialog')) setTimeout(() => field.scrollIntoView?.({ block: 'nearest' }), 60);
  keyboardOpen = open;
}
window.visualViewport?.addEventListener('resize', syncKeyboard);
window.visualViewport?.addEventListener('scroll', syncKeyboard);
for (const name of ['focusin', 'focusout']) {
  document.addEventListener(name, () => { setTimeout(syncKeyboard, 50); setTimeout(syncKeyboard, 400); });
}
function stopSwipeClick(event) { event.preventDefault(); event.stopPropagation(); }

// The feed mode menu closes on any tap outside it, and on Escape.
document.addEventListener('click', event => {
  if (!event.target?.closest?.('.mode-menu, [data-action="feed-modes"]')) toggleModeMenu(false);
});

document.addEventListener('keydown', event => {
  const target = event.target;
  if (event.key === 'Escape') toggleModeMenu(false);
  if (target?.name === 'importUrl' && event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    const button = modal.querySelector?.('[data-action="import-link"]');
    if (button && !button.disabled) importLink(button);
    return;
  }
  if ((target?.id === 'prompt' || target?.name === 'task-prompt') && event.key === 'Enter' && !event.shiftKey && !event.isComposing && !isCompact()) {
    event.preventDefault();
    target.form?.requestSubmit?.();
    return;
  }
  if (document.querySelector('#viewer')?.open && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) { stepViewer(event.key === 'ArrowRight' ? 1 : -1); return; }
  if (modal.open || document.body.dataset.view !== 'feed') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) return;
  if (['ArrowDown', 'PageDown', 'j'].includes(event.key)) { event.preventDefault(); stepFeed(1); }
  else if (['ArrowUp', 'PageUp', 'k'].includes(event.key)) { event.preventDefault(); stepFeed(-1); }
  else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') changeSlide(currentFeedId(), event.key === 'ArrowRight' ? 1 : -1);
});

/* Sheets close with a swipe down (touch) or a pull down at the top (trackpad) */

const SHEET_CLOSE_DISTANCE = 120;
let sheetDrag = null;
let sheetDetent = 'full';
const sheetWheel = { amount: 0, last: 0, armed: false, timer: 0 };
let feedWheelMuteUntil = 0;

// The rest of a trackpad swipe that closed a sheet must not scroll or refresh the feed underneath.
// Only wheel events are swallowed: touch scrolling is never blocked, and the feed keeps its overflow,
// because switching a snapping scroller to overflow: hidden and back makes Safari lose its place.
function muteFeedWheel(ms) {
  feedWheelMuteUntil = Date.now() + ms;
}
document.addEventListener('wheel', event => {
  if (Date.now() < feedWheelMuteUntil && event.target.closest?.('#feed') && event.cancelable) event.preventDefault();
}, { passive: false });

function sheetHasDraft() {
  if (dialogContext?.kind === 'publish' && (publishMedia.some(item => item.blob) || postDraft?.blocks.some(block => !block.url && (block.text || block.items?.some(Boolean))))) return true;
  return Array.from(modal.querySelectorAll?.('input, textarea') || []).some(field => !['radio', 'checkbox', 'hidden', 'file', 'color'].includes(field.type) && field.value.trim() && field.value !== field.defaultValue);
}

function sheetBase() {
  return sheetDetent === 'half' ? Math.round(innerHeight * 0.3) : 0;
}

function setSheetOffset(offset, animate = false) {
  if (!modal.style) return;
  const y = sheetBase() + offset;
  modal.style.transition = animate ? 'transform .28s var(--ease)' : 'none';
  modal.style.transform = y ? `translateY(${y}px)` : '';
  modal.style.setProperty('--sheet-fade', String(Math.max(0, 1 - offset / 500)));
}

function setDetent(detent) {
  if (detent !== sheetDetent) haptic('select');
  sheetDetent = detent;
  modal.dataset.detent = detent;
  setSheetOffset(0, true);
}

function resetSheet() {
  clearTimeout(sheetWheel.timer);
  sheetDrag = null;
  sheetDetent = 'full';
  sheetWheel.amount = 0;
  modal.classList?.remove('sheet-closing');
  if (!modal.style) return;
  modal.style.transition = '';
  modal.style.transform = '';
  modal.style.opacity = '';
  modal.style.removeProperty('--sheet-fade');
}

// A full-height post first drops to 70%, a long or fast swipe closes it; other sheets close on a swipe.
function releaseSheet(distance, fast = false) {
  if (sheetDetent === 'full' && dialogContext?.kind === 'project' && isPhone()) {
    if (distance > innerHeight * 0.5 || (fast && distance > 220)) dismissSheet();
    else if (distance > 60 || (fast && distance > 20)) setDetent('half');
    else setSheetOffset(0, true);
    return;
  }
  if (distance > SHEET_CLOSE_DISTANCE || (fast && distance > 30)) dismissSheet();
  else setSheetOffset(0, true);
}

function dismissSheet() {
  if (sheetHasDraft()) { setSheetOffset(0, true); toast(dialogContext?.kind === 'publish' ? 'Черновик не сохранится — закрой крестиком' : 'Сначала отправь или сотри текст'); return; }
  closeAnimated();
}

// The X, the backdrop and swipes close with motion: the sheet slides down on phones, the card fades on computers.
function closeAnimated() {
  if (swapPlayerForReview()) return;
  const backToPost = dialogContext?.kind === 'publish' && dialogContext.id;
  if (!modal.open || backToPost || modal.classList.contains('sheet-closing') || !modal.style) { if (!modal.classList?.contains('sheet-closing')) closeDialog(); return; }
  modal.classList.add('sheet-closing');
  muteFeedWheel(1000);
  const phone = isPhone();
  modal.style.transition = phone ? 'transform .24s var(--ease)' : 'transform .18s ease-in, opacity .18s ease-in';
  modal.style.transform = phone ? `translateY(${innerHeight}px)` : 'translateY(18px) scale(.98)';
  if (!phone) modal.style.opacity = '0';
  setTimeout(() => {
    if (!modal.classList.contains('sheet-closing')) return;
    resetSheet();
    modal.style.opacity = '';
    closeDialog();
  }, phone ? 230 : 170);
}

const sheetDragExcluded = 'input, textarea, select, [contenteditable="true"], .workspace';
modal.addEventListener('touchstart', event => {
  const touch = event.touches[0];
  sheetDrag = event.touches.length === 1 && !modal.classList.contains('sheet-closing') && !event.target.closest?.(sheetDragExcluded)
    ? { x: touch.clientX, y: touch.clientY, lastY: touch.clientY, lastTime: event.timeStamp, distance: 0, speed: 0, active: false }
    : null;
}, { passive: true });
// At 70% the sheet itself follows the finger up to full height; at the top of the content a pull down
// moves the sheet down. Sideways gestures are left to the gallery.
modal.addEventListener('touchmove', event => {
  if (!sheetDrag) return;
  if (event.touches.length !== 1) { if (sheetDrag.active) setSheetOffset(0, true); sheetDrag = null; return; }
  const touch = event.touches[0];
  if (!sheetDrag.active) {
    const dy = touch.clientY - sheetDrag.y;
    const side = Math.abs(touch.clientX - sheetDrag.x);
    if (Math.abs(dy) < 6 && side < 6) return;
    if (side > Math.abs(dy)) { sheetDrag = null; return; }
    const expand = sheetDetent === 'half' && dy < 0 && modal.scrollTop <= 0;
    if (!expand && (modal.scrollTop > 0 || dy <= 0)) { sheetDrag.x = touch.clientX; sheetDrag.y = touch.clientY; return; }
    sheetDrag.active = true;
    sheetDrag.expand = expand;
    sheetDrag.y = touch.clientY;
  }
  if (event.cancelable) event.preventDefault();
  const elapsed = Math.max(1, event.timeStamp - sheetDrag.lastTime);
  sheetDrag.speed = (touch.clientY - sheetDrag.lastY) / elapsed;
  sheetDrag.lastY = touch.clientY;
  sheetDrag.lastTime = event.timeStamp;
  const dy = touch.clientY - sheetDrag.y;
  sheetDrag.distance = sheetDrag.expand ? Math.max(-sheetBase(), Math.min(40, dy)) : Math.max(0, dy);
  setSheetOffset(sheetDrag.distance);
}, { passive: false });
modal.addEventListener('touchend', () => {
  const drag = sheetDrag;
  sheetDrag = null;
  if (!drag?.active) return;
  if (drag.expand) {
    if (drag.distance < -50 || drag.speed < -0.4) setDetent('full');
    else if (drag.distance > 30) dismissSheet();
    else setSheetOffset(0, true);
    return;
  }
  releaseSheet(drag.distance, drag.speed > 0.6);
});
modal.addEventListener('touchcancel', () => { if (sheetDrag?.active) setSheetOffset(0, true); sheetDrag = null; });
modal.addEventListener('wheel', event => {
  const now = Date.now();
  if (now - sheetWheel.last > 300) sheetWheel.armed = modal.scrollTop <= 0 && !event.target.closest?.(sheetDragExcluded);
  sheetWheel.last = now;
  if (event.deltaY > 0 || event.ctrlKey || modal.scrollTop > 0) sheetWheel.armed = false;
  if (!sheetWheel.armed || modal.classList.contains('sheet-closing')) {
    if (sheetWheel.amount) { sheetWheel.amount = 0; setSheetOffset(0, true); }
    return;
  }
  sheetWheel.amount += -event.deltaY;
  setSheetOffset(Math.min(180, sheetWheel.amount * 0.3));
  clearTimeout(sheetWheel.timer);
  sheetWheel.timer = setTimeout(() => {
    const distance = Math.min(180, sheetWheel.amount * 0.3);
    sheetWheel.amount = 0;
    releaseSheet(distance);
  }, 260);
}, { passive: true });

modal.addEventListener('scroll', () => {
  if (sheetDetent === 'half' && modal.scrollTop > 2 && !sheetDrag?.active) setDetent('full');
}, { passive: true });
modal.addEventListener('focusin', event => {
  const block = event.target.closest?.('.peb');
  if (block) selectBlock(Number(block.dataset.block));
  if (sheetDetent === 'half' && event.target.matches?.('input, textarea')) setDetent('full');
});
modal.addEventListener('click', event => {
  const media = event.target.closest?.('.store-page .pb-media img');
  if (media) {
    const images = Array.from(modal.querySelectorAll('.store-page .pb-media img'));
    openViewer(images.map(image => `<img src="${escapeHtml(image.getAttribute('src'))}" alt="" draggable="false">`), images.indexOf(media));
    return;
  }
  const block = event.target.closest?.('.peb');
  if (block && !event.target.closest?.('[data-action]')) selectBlock(Number(block.dataset.block));
});
// Desktop: files can be dropped onto the publish form.
modal.addEventListener('dragover', event => {
  if (!event.target.closest?.('#publish-form') || !event.dataTransfer?.types?.includes?.('Files')) return;
  event.preventDefault();
  modal.querySelector?.('.drop, .pick-add')?.classList.add('dragging');
});
modal.addEventListener('dragleave', event => { if (event.target.closest?.('.drop, .pick-add')) event.target.closest('.drop, .pick-add').classList.remove('dragging'); });
modal.addEventListener('drop', event => {
  if (!event.target.closest?.('#publish-form') || !event.dataTransfer?.files?.length) return;
  event.preventDefault();
  modal.querySelector?.('.dragging')?.classList.remove('dragging');
  const host = event.target.closest('.pe-host');
  const file = event.dataTransfer.files[0];
  if (host && postDraft?.step === 3) addPageMedia(file, file.type.startsWith('video/') ? 'video' : 'image');
  else addPublishFiles(event.dataTransfer.files);
});

modal.addEventListener('click', event => { if (event.target === modal) closeAnimated(); });

// Chat gestures: double tap a message for ❤️, hold it (or right-click) for the reaction bar.
let chatTap = { id: '', time: 0 };
let chatHold = null;
document.addEventListener('click', event => {
  if (!event.target.closest?.('.react-bar')) closeReactBar();
  if (!event.target.closest?.('.chat-composer')) { const panel = document.querySelector('.chat-panel'); if (panel && !panel.hidden) panel.hidden = true; }
  const row = event.target.closest?.('.msg-row[data-msg]');
  if (!row || event.target.closest('[data-action]')) return;
  const now = Date.now();
  if (chatTap.id === row.dataset.msg && now - chatTap.time < 320) {
    chatTap = { id: '', time: 0 };
    row.querySelector('.bubble')?.classList.add('liked');
    reactTo(route().page, row.dataset.msg, '❤️');
  } else chatTap = { id: row.dataset.msg, time: now };
});
document.addEventListener('pointerdown', event => {
  const row = event.target.closest?.('.msg-row[data-msg]');
  clearTimeout(chatHold);
  if (row && !event.target.closest('[data-action]')) chatHold = setTimeout(() => openReactBar(row), 450);
});
['pointerup', 'pointercancel', 'pointermove'].forEach(name => document.addEventListener(name, event => { if (name !== 'pointermove' || Math.abs(event.movementY || 0) > 2) clearTimeout(chatHold); }));
document.addEventListener('contextmenu', event => {
  const row = event.target.closest?.('.msg-row[data-msg]');
  if (row) { event.preventDefault(); openReactBar(row); }
});
document.addEventListener('pointerdown', event => {
  clearTimeout(commentHold);
  const row = event.target.closest?.('.comment[data-comment]');
  if (!online || !row?.dataset.comment || event.button > 0 || event.target.closest('[data-action], a, input, textarea, audio, video')) return;
  commentHoldStart = { x: event.clientX, y: event.clientY };
  commentHold = setTimeout(() => openCommentMenu(row.dataset.project, row.dataset.comment, commentHoldStart), 480);
});
['pointerup', 'pointercancel'].forEach(name => document.addEventListener(name, () => clearTimeout(commentHold)));
document.addEventListener('pointermove', event => {
  if (commentHoldStart && Math.hypot(event.clientX - commentHoldStart.x, event.clientY - commentHoldStart.y) > 8) clearTimeout(commentHold);
});
document.addEventListener('contextmenu', event => {
  const row = event.target.closest?.('.comment[data-comment]');
  if (!online || !row?.dataset.comment) return;
  event.preventDefault();
  clearTimeout(commentHold);
  openCommentMenu(row.dataset.project, row.dataset.comment, { x: event.clientX, y: event.clientY });
});
modal.addEventListener('close', () => {
  closeCommentMenu();
  if (cardHost?.open) cardHost.close();
  resetSheet();
  modal.querySelectorAll?.('video').forEach(video => video.pause?.());
  document.querySelectorAll?.('.feed-item.in-view').forEach(syncFeedVideo);
});
modal.addEventListener('cancel', event => { event.preventDefault(); closeAnimated(); });
window.addEventListener('hashchange', () => {
  connectionVersion += 1;
  if (modal.open) modal.close();
  dialogContext = null;
  const before = { key: renderedView, view: renderedView.split(/[:/]/)[0] };
  render(false);
  animateRoute(before, { key: renderedView, view: renderedView.split(/[:/]/)[0] });
});
document.addEventListener('error', event => {
  if (event.target.matches?.('.scene.photo img')) event.target.parentElement.classList.add('image-unavailable');
}, true);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    endView();
    flushFeedEvents(true);
    return;
  }
  if (document.body.dataset.view === 'feed') beginView(document.querySelector('.feed-item.in-view'));
  if (document.visibilityState === 'visible' && online) {
    reloadAll({ rerender: document.body.dataset.view !== 'feed' && !modal.open });
    const current = route();
    if (current.section === 'ai' && current.page === 'w') loadWorkspace(current.extra, { force: true });
  }
});

/* One project across the feed, ИИ-мир and Steam: the author's hub on the post page */

let hubTab = 'feed';
const steamTexts = new Map();
const steamLabels = Object.fromEntries(steamStatuses);

function hubStat(iconName, value, label) {
  return `<span class="hub-stat">${icon(iconName)}<b>${value}</b><small>${label}</small></span>`;
}

function hubFeedHtml(project) {
  const stats = cleanStats(statsFor(project));
  const pid = escapeHtml(project.id);
  const testers = project.playtest?.open ? project.playtest.taken : testReports(project).length;
  return `<div class="hub-stats">${hubStat('bell', project.watchers || 0, 'следят')}${hubStat('repost', project.reposts || 0, 'репостов')}${hubStat('comment', commentCount(project), 'комментариев')}${hubStat('play', stats.plays, 'сыграли')}${hubStat('gamepad', stats.wishlists, 'в Steam')}<button class="hub-stat" data-action="hub-tab" data-id="${pid}" data-tab="testers">${icon('users')}<b>${testers}</b><small>${project.playtest?.open ? 'тестеров' : 'отчётов тестеров'}</small></button></div>${promotionHtml(project)}`;
}

function ownedWorkspaces() {
  return (ai.workspaces || []).filter(workspace => workspace.role === 'owner' && workspace.present !== false);
}

function linkedWorkspaceFor(project) {
  return project.workspaceId ? (ai.workspaces || []).find(workspace => workspace.id === project.workspaceId) || null : null;
}

function hubCodeHtml(project) {
  const pid = escapeHtml(project.id);
  const linked = linkedWorkspaceFor(project);
  if (!linked) {
    const owned = ownedWorkspaces();
    if (!owned.length) return `<p class="hub-hint">Подключи компьютер в ИИ-мире и свяжи пост с папкой проекта: отзывы игроков станут задачами для Claude Code или Codex, а готовые задачи — обновлениями в ленте.</p><a class="btn btn-ghost btn-sm" href="#/ai/connect/folder">${icon('monitor')} Подключить компьютер</a>`;
    return `<p class="hub-hint">С какой папкой связан этот пост? Отзывы станут задачами ИИ, а готовые задачи — обновлениями.</p><div class="hub-list">${owned.map(workspace => `<button class="set-row" data-action="hub-link" data-id="${pid}" data-workspace="${escapeHtml(workspace.id)}"><span class="row-mark">${icon('folder')}</span><span><b>${escapeHtml(workspace.name)}</b><small>${escapeHtml(workspace.device?.name || '')} · ${workspace.device?.online ? 'в сети' : 'не в сети'}</small></span>${icon('link')}</button>`).join('')}</div>`;
  }
  const task = linked.lastTask;
  const last = task ? `<div class="hub-task"><span class="hub-task-state ${escapeHtml(task.status)}"></span><span><b>${escapeHtml(task.prompt.split('\n')[0].slice(0, 90))}</b><small>${escapeHtml(statusNames[task.status] || task.status)} · ${timeAgo(task.createdAt) || ''}</small></span></div>` : '<p class="hub-hint">Задач пока не было.</p>';
  return `<a class="hub-ws" href="#/ai/w/${encodeURIComponent(linked.id)}"><span class="ws-head-icon">${icon('folder')}<i class="presence ${linked.device?.online ? 'on' : ''}"></i></span><span><b>${escapeHtml(linked.name)}</b><small>${escapeHtml(linked.device?.name || '')} · ${linked.device?.online ? 'в сети' : 'не в сети'} · задач: ${linked.taskCount || 0}</small></span>${icon('chevronRight')}</a>${last}<div class="hub-actions"><button class="btn btn-ghost btn-sm" data-action="hub-demo-task" data-id="${pid}">${icon('play')} ${project.demo ? 'Обновить веб-демо' : 'Собрать веб-демо'}</button>${commentCount(project) ? `<button class="btn btn-ghost btn-sm" data-action="hub-digest-task" data-id="${pid}">${icon('sparkle')} План по всем отзывам</button>` : ''}<button class="btn btn-ghost btn-sm" data-action="hub-link" data-id="${pid}" data-workspace="">${icon('close')} Отвязать</button></div><p class="hub-hint">Агент соберёт веб-версию и выложит её на GitHub Pages, itch.io или Netlify — ссылка сама предложится в пост. Удерживай комментарий игрока — его можно отдать агенту как есть или, с Плюсом, ИИ сначала разберёт его в контексте проекта.</p>`;
}

function projectReadiness(project) {
  const stats = cleanStats(statsFor(project));
  const quality = projectQuality({ ...project, votes: voteCount(project), saves: savesCount(project) }, stats);
  return steamReadiness(project, { watchers: project.watchers || 0, stats, retention: quality.impressions >= 20 ? quality.retention : 0, repo: project.repo, reports: testReports(project).length });
}

function hubSteamHtml(project) {
  const pid = escapeHtml(project.id);
  const steam = project.steam || { status: 'none' };
  const readiness = projectReadiness(project);
  const group = (kind, title, extra = '') => {
    const items = readiness.items.filter(item => item.kind === kind);
    if (!items.length) return extra;
    const rows = items.map(item => kind === 'manual'
      ? `<button class="ready-row ${item.done ? 'on' : ''}" data-action="hub-check" data-id="${pid}" data-item="${item.id}" aria-pressed="${item.done}">${icon(item.icon)}<span>${item.title}</span><i class="ready-tick">${icon('check')}</i></button>`
      : `<div class="ready-row ${item.done ? 'on' : ''}">${icon(item.icon)}<span>${item.title}${kind === 'feed' ? `<small>${item.value}${item.unit || ''} из ${item.goal}${item.unit || ''}</small><i class="ready-bar"><i style="width:${Math.round(item.share * 100)}%"></i></i>` : ''}</span><i class="ready-tick">${icon(item.done ? 'check' : 'minus')}</i></div>`).join('');
    return `<div class="ready-group"><h4>${title}</h4>${rows}${extra}</div>`;
  };
  const repoNote = project.repo ? `<small class="ready-note">Проверено ${timeAgo(project.repo.at) || 'только что'} · файлов: ${project.repo.files}</small>` : '';
  const repoButton = project.workspaceId ? `<button class="btn btn-ghost btn-sm" data-action="hub-repo-check" data-id="${pid}">${icon('refresh')} ${project.repo ? 'Проверить снова' : 'Проверить репозиторий'}</button>${repoNote}` : '<p class="hub-hint">Свяжи пост с папкой во вкладке «Код и ИИ» — и репозиторий проверится сам.</p>';
  const texts = steamTexts.get(project.id);
  const textBlock = texts ? `<div class="steam-texts"><div class="steam-text"><b>Короткое описание</b><p>${escapeHtml(texts.short)}</p><button class="text-link inline" data-action="copy" data-copy="${escapeHtml(texts.short)}">${icon('doc')} Скопировать</button></div><div class="steam-text"><b>Об игре</b>${texts.about.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}${texts.features.length ? `<ul>${texts.features.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>` : ''}<button class="text-link inline" data-action="copy" data-copy="${escapeHtml([...texts.about, ...texts.features.map(feature => `• ${feature}`)].join('\n\n'))}">${icon('doc')} Скопировать</button></div>${texts.tags.length ? `<div class="steam-text"><b>Теги</b><p>${texts.tags.map(escapeHtml).join(', ')}</p></div>` : ''}<small class="ready-note">${texts.source === 'ai' ? 'Написал Claude по посту' : 'Собрано из поста'}${texts.readme ? ' и README' : ''}</small></div>` : '';
  const date = steam.status === 'coming' ? `<label class="steam-date">${icon('clock')}<span>Дата выхода</span><input type="date" data-steam-date="${pid}" value="${steam.releaseAt ? new Date(steam.releaseAt).toISOString().slice(0, 10) : ''}"></label>` : '';
  const noticed = project.publisherNoticed ? `<div class="hub-notice">${icon('sparkle')}<span><b>Издатель заметил проект</b><small>Интерес в ленте высокий — подай заявку, её посмотрят первой</small></span></div>` : '';
  const apply = project.applicationId
    ? `<div class="hub-notice done">${icon('check')}<span><b>Заявка у издателя</b><small>Ответ придёт в чат от про.стим${hasPlusNow() ? ' · с Плюсом смотрят первой' : ''}</small></span></div>`
    : `<button class="btn btn-grad btn-block" data-action="application" data-id="${pid}">${icon('send')} Подать заявку издателю</button>${hasPlusNow() ? '<p class="hub-hint">С Плюсом заявку смотрят первой и бесплатно проверяют документы.</p>' : `<p class="hub-hint">С <button class="text-link inline" data-action="plus">Плюсом</button> заявку смотрят первой и бесплатно проверяют документы.</p>`}`;
  return `${noticed}<div class="seg steam-seg" role="radiogroup">${steamStatuses.map(([key, label]) => `<button role="radio" aria-checked="${steam.status === key}" class="${steam.status === key ? 'on' : ''}" data-action="hub-steam" data-id="${pid}" data-status="${key}">${label.replace('Готовлюсь к Steam', 'Готовлюсь').replace('Заявка у издателя', 'Заявка').replace('Скоро в Steam', 'Скоро').replace('Вышла в Steam', 'Вышла')}</button>`).join('')}</div>${date}<div class="ready-head"><span class="ready-ring" style="--p:${readiness.percent}"><b>${readiness.percent}%</b></span><span><b>Готовность к Steam</b><small>${readiness.done} из ${readiness.total}: чек-лист, отклик в ленте и репозиторий</small></span></div>${group('manual', 'Чек-лист')}${group('feed', 'Что показывает лента')}${group('repo', 'Репозиторий', '', '')}<div class="ready-group">${project.repo ? '' : '<h4>Репозиторий</h4>'}${repoButton}</div><div class="ready-group"><h4>Страница в Steam</h4><button class="btn btn-ghost btn-sm" data-action="hub-steam-texts" data-id="${pid}">${icon('wand')} ${texts ? 'Написать заново' : 'Тексты для страницы Steam'}</button>${textBlock}</div>${apply}`;
}

function projectHubHtml(project) {
  if (!online || !me || !isMine(project.handle)) return '';
  const fresh = playerFeedback(project).filter(comment => !comment.resolved && !comment.tasked).length;
  const newReports = testReports(project).filter(comment => comment.test?.current && !comment.accepted && !comment.tasked && !comment.resolved).length;
  const tabs = [['feed', 'flame', 'Лента'], ['reviews', 'star', 'Отзывы', fresh], ['testers', 'users', 'Тестеры', newReports], ['code', 'code', 'Код и ИИ'], ['steam', 'gamepad', 'Steam']];
  const body = hubTab === 'code' ? hubCodeHtml(project) : hubTab === 'steam' ? hubSteamHtml(project) : hubTab === 'reviews' ? hubFeedbackHtml(project) : hubTab === 'testers' ? hubTestersHtml(project) : hubFeedHtml(project);
  return `<section class="hub" data-hub="${escapeHtml(project.id)}"><div class="hub-tabs" role="tablist" aria-label="Проект">${tabs.map(([key, iconName, label, count]) => `<button role="tab" aria-selected="${hubTab === key}" class="${hubTab === key ? 'on' : ''}" data-action="hub-tab" data-id="${escapeHtml(project.id)}" data-tab="${key}">${icon(iconName)}<span>${label}</span>${count ? `<i class="tab-count">${count > 99 ? '99+' : count}</i>` : ''}</button>`).join('')}</div><div class="hub-body">${demoDraftHtml(project)}${body}</div></section>`;
}

// A web build the agent finished: one tap puts it into the post.
function demoDraftHtml(project) {
  const draft = project.demoDraft;
  if (!draft?.url) return '';
  let host = draft.url;
  try { host = new URL(draft.url).hostname; } catch {}
  return `<div class="hub-notice demo-draft">${icon('play')}<span><b>Веб-версия готова</b><small>${escapeHtml(host)}</small></span><button class="btn btn-grad btn-sm" data-action="demo-apply" data-id="${escapeHtml(project.id)}" data-url="${escapeHtml(draft.url)}">В пост</button><button class="icon-btn" data-action="demo-dismiss" data-id="${escapeHtml(project.id)}" aria-label="Скрыть">${icon('close')}</button></div>`;
}

let feedbackFilter = 'all';
let feedbackOpenOnly = true;
let helpersAll = false;
const kindOrder = feedbackKinds.map(([key]) => key);

// Comments and demo reviews from players, without the author's own replies.
function playerFeedback(project) {
  return projectComments(project).filter(comment => comment.id && !comment.mine && !comment.byAuthor && !hiddenLocally.has(`c:${comment.id}`));
}

// Who helped this project: the same points as the help level, counted for this post only.
function projectHelpers(project) {
  const people = new Map();
  for (const comment of playerFeedback(project)) {
    const key = comment.handle || comment.name;
    const entry = people.get(key) || { handle: comment.handle, name: comment.name, initials: comment.initials, color: comment.color, avatar: comment.avatar, points: 0, comments: 0, helped: 0, kinds: {}, reviewed: false };
    const { points, helpful } = commentHelp(comment);
    entry.points += points;
    entry.comments += 1;
    if (comment.review && !entry.reviewed) { entry.reviewed = true; entry.points += helpPoints.review; }
    if (helpful) { entry.helped += 1; entry.kinds[comment.kind] = (entry.kinds[comment.kind] || 0) + 1; }
    people.set(key, entry);
  }
  return [...people.values()].sort((a, b) => b.points - a.points || b.comments - a.comments);
}

function openFeedbackOf(project, kind) {
  return playerFeedback(project).filter(comment => !comment.resolved && !comment.tasked && comment.kind === kind);
}

function hubFeedbackHtml(project) {
  const pid = escapeHtml(project.id);
  const all = playerFeedback(project);
  if (!all.length) return `<p class="hub-hint">${project.demo ? 'Отзывов пока нет. Игроки оценят демо прямо из ленты — звёзды, отметки и пара слов появятся здесь.' : 'Отзывов пока нет. Добавь веб-демо — в него сыграют прямо с телефона и оставят отзыв. Собрать его может ИИ во вкладке «Код и ИИ».'}</p>`;
  const pool = feedbackOpenOnly ? all.filter(comment => !comment.resolved) : all;
  const count = key => pool.filter(comment => comment.kind === key).length;
  const shown = pool.filter(comment => feedbackFilter === 'all' || comment.kind === feedbackFilter)
    .sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || (b.createdAt || 0) - (a.createdAt || 0));
  const rating = project.demoRating;
  const latest = new Map();
  for (const comment of all.filter(item => item.review).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) latest.set(comment.handle || comment.id, comment.review);
  const spread = [5, 4, 3, 2, 1].map(step => [step, [...latest.values()].filter(review => review.stars === step).length]);
  const tagCounts = new Map();
  for (const review of latest.values()) for (const tag of review.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  const topTags = [...tagCounts].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const summary = rating?.count ? `<div class="fb-rating"><span class="fb-score"><b>${demoRatingText(project)}</b>${starsHtml(Math.round(rating.average))}<small>${rating.count} ${plural(rating.count, 'оценка', 'оценки', 'оценок')} демо</small></span><span class="fb-spread">${spread.map(([step, value]) => `<span><small>${step}</small><i><i style="width:${Math.round(value / Math.max(1, latest.size) * 100)}%"></i></i></span>`).join('')}</span></div>${topTags.length ? `<p class="fb-tags">Чаще отмечают: ${topTags.map(([tag, value]) => `<i class="${reviewTags.good.some(([key]) => key === tag) ? 'good' : 'bad'}">${escapeHtml(reviewTagNames[tag] || tag)} · ${value}</i>`).join('')}</p>` : ''}` : '';
  const helpers = projectHelpers(project);
  const helperRows = (helpersAll ? helpers : helpers.slice(0, 5)).map(person => {
    const global = person.handle ? userByHandle(person.handle)?.help : null;
    const kinds = Object.entries(person.kinds).sort((a, b) => b[1] - a[1]).map(([kind, value]) => `${(kindLabels[kind] || 'Другое').toLowerCase()}${value > 1 ? ` ×${value}` : ''}`).join(', ');
    const note = kinds ? `помог: ${kinds}` : `${person.comments} ${plural(person.comments, 'комментарий', 'комментария', 'комментариев')}${person.reviewed ? ', оценил демо' : ''}`;
    return `<button class="helper-row" ${person.handle ? `data-action="profile" data-handle="${escapeHtml(person.handle)}"` : 'disabled'}>${avatar(person)}<span><b>${escapeHtml(person.name)}${global?.level >= 2 ? `<i class="help-title">${escapeHtml(global.title)}</i>` : ''}</b><small>${escapeHtml(note)}</small></span><em>+${person.points}</em></button>`;
  }).join('');
  const helpersBlock = `<div class="hub-group"><h4>Кто помог</h4><div class="helpers">${helperRows}</div>${helpers.length > 5 ? `<button class="text-link inline" data-action="fb-helpers" data-id="${pid}">${helpersAll ? 'Свернуть' : `Все ${helpers.length}`}</button>` : ''}</div>`;
  const filters = `<div class="fb-kinds" role="radiogroup" aria-label="Что показать"><button role="radio" aria-checked="${feedbackFilter === 'all'}" class="${feedbackFilter === 'all' ? 'on' : ''}" data-action="fb-filter" data-id="${pid}" data-kind="all">Все <b>${pool.length}</b></button>${feedbackKinds.filter(([key]) => count(key) || feedbackFilter === key).map(([key, label]) => `<button role="radio" aria-checked="${feedbackFilter === key}" class="${feedbackFilter === key ? 'on' : ''} ${key}" data-action="fb-filter" data-id="${pid}" data-kind="${key}">${label} <b>${count(key)}</b></button>`).join('')}</div><button class="fb-open ${feedbackOpenOnly ? 'on' : ''}" data-action="fb-open" data-id="${pid}" aria-pressed="${feedbackOpenOnly}"><i class="toggle" aria-hidden="true"></i>Только неучтённые</button>`;
  const rows = shown.length ? shown.map(comment => {
    const text = comment.text || (comment.voice ? 'Голосовой комментарий' : comment.review ? 'Без текста' : '');
    const flag = comment.resolved ? `<span class="comment-flag ok">${icon('check')}Учтено</span>` : comment.tasked ? `<span class="comment-flag ai">${icon('sparkle')}У ИИ</span>` : comment.accepted ? `<span class="comment-flag ok">${icon('check')}Помог</span>` : '';
    return `<button class="fb-row" data-action="comment-menu" data-id="${escapeHtml(comment.id)}" data-project="${pid}"><span class="fb-main"><span class="fb-top"><b>${escapeHtml(comment.name)}</b>${comment.review ? starsHtml(comment.review.stars, 'small') : ''}${kindLabels[comment.kind] ? `<span class="kind-chip ${comment.label ? '' : 'auto'} ${escapeHtml(comment.kind)}">${kindLabels[comment.kind]}</span>` : ''}${flag}<small>${escapeHtml(timeAgo(comment.createdAt) || '')}</small></span><span class="fb-text">${escapeHtml(text)}</span>${comment.review?.tags?.length ? `<span class="fb-marks">${comment.review.tags.map(tag => escapeHtml(reviewTagNames[tag] || tag)).join(' · ')}</span>` : ''}</span>${icon('more')}</button>`;
  }).join('') : '<p class="hub-hint">Здесь пусто — попробуй другой фильтр.</p>';
  const batch = feedbackFilter !== 'all' && project.workspaceId ? openFeedbackOf(project, feedbackFilter) : [];
  const batchButton = batch.length >= 2 ? `<button class="btn btn-ghost btn-block" data-action="fb-task" data-id="${pid}" data-kind="${escapeHtml(feedbackFilter)}">${icon('sparkle')} Отдать ИИ ${batch.length} ${plural(batch.length, 'открытый', 'открытых', 'открытых')} одной задачей</button>` : '';
  return `${summary}${helpersBlock}<div class="hub-group"><h4>Все отзывы</h4>${filters}<div class="fb-list">${rows}</div>${batchButton}</div><p class="hub-hint">${icon('more')} Удерживай комментарий или нажми на отзыв: пометить, отметить «Помогло», отдать ИИ.</p>`;
}

function openFeedbackTask(projectId, kind) {
  const project = projectById(projectId);
  const chosen = project ? openFeedbackOf(project, kind) : [];
  if (!chosen.length) return;
  const workspace = linkedWorkspaceFor(project);
  const dialog = openLayer(`<div class="crop comment-task"><div class="crop-head"><button class="icon-btn" data-action="layer-close" aria-label="Отмена">${icon('close')}</button><b id="layer-title">${chosen.length} ${plural(chosen.length, 'отзыв', 'отзыва', 'отзывов')} в задачу</b><span></span></div><p class="hub-hint">Уйдёт в папку «${escapeHtml(workspace?.name || 'проекта')}»${workspace?.device?.name ? ` на компьютере «${escapeHtml(workspace.device.name)}»` : ''}${workspace?.device?.online === false ? ' — он сейчас не в сети, задача подождёт' : ''}. Текст можно поправить.</p><textarea class="field" rows="10" maxlength="8000" aria-label="Текст задачи">${escapeHtml(taskFromFeedback(project, chosen))}</textarea><div class="seg" role="radiogroup"><button role="radio" aria-checked="false" data-mode="read">Только план</button><button role="radio" aria-checked="true" class="on" data-mode="edit">Исправить</button></div><button class="btn btn-grad btn-block task-send">${icon('send')} Отправить в ИИ-мир</button></div>`, 'comment-task');
  let mode = 'edit';
  dialog.querySelectorAll('.seg button').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    dialog.querySelectorAll('.seg button').forEach(item => { item.classList.toggle('on', item === button); item.setAttribute('aria-checked', String(item === button)); });
  }));
  dialog.querySelector('.task-send').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await apiCall('POST', `/api/projects/${encodeURIComponent(projectId)}/feedback-task`, { ids: chosen.map(comment => comment.id), prompt: dialog.querySelector('textarea').value, mode });
      replaceProject(result.project);
      closeLayer();
      rerenderHub(projectId);
      toast('Задача ушла в ИИ-мир. Когда агент закончит, придёт уведомление');
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  });
}

async function hubDemoTask(id, button) {
  button.disabled = true;
  const result = await hubCall(id, 'demo-task', {});
  if (result?.task) toast('Агент собирает веб-версию. Когда ссылка будет готова, придёт уведомление');
  else button.disabled = false;
}

function rerenderHub(id) {
  const project = projectById(id);
  const hub = modal.querySelector?.(`.hub[data-hub="${id}"]`);
  if (project && hub) hub.outerHTML = projectHubHtml(project);
}

async function hubCall(id, path, body, done = '') {
  try {
    const result = await apiCall('POST', `/api/projects/${encodeURIComponent(id)}/${path}`, body);
    if (result.project) replaceProject(result.project);
    rerenderHub(id);
    if (done) toast(done);
    return result;
  } catch (error) {
    toast(error.message);
    return null;
  }
}

async function hubSteamTexts(id, button) {
  button.disabled = true;
  button.innerHTML = `${icon('refresh')} Пишем тексты…`;
  try {
    steamTexts.set(id, await apiCall('POST', `/api/projects/${encodeURIComponent(id)}/steam-texts`));
  } catch (error) {
    toast(error.message);
  }
  rerenderHub(id);
}

async function hubDigestTask(id) {
  const result = await hubCall(id, 'digest-task', { mode: 'read' });
  if (result?.task) toast('Отзывы ушли в ИИ-мир: агент составит план правок');
}

/* Playtests: the author hands players a task, a build, a prompt and maybe the project folder; reports come
   back step by step and go on like any feedback — accept, give to the AI, ship in an update */

function testReports(project) {
  return projectComments(project).filter(comment => comment.test);
}

const playtestReward = test => sparkRules.accepted.amount + (Number(test?.bounty) || 0);

function plusCompareHtml() {
  return `<table class="plus-compare"><thead><tr><th></th><th>Без Плюса</th><th>${icon('crown')} Плюс</th></tr></thead><tbody>${plusCompare.map(([label, free, plus]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(free)}</td><td>${escapeHtml(plus)}</td></tr>`).join('')}</tbody></table>`;
}

function playtestFactsHtml(test) {
  return [test.platform, test.version ? `версия ${test.version}` : '', `${test.taken} из ${test.slots} ${plural(test.slots, 'места', 'мест', 'мест')}`, test.reports ? `${test.reports} ${plural(test.reports, 'отчёт', 'отчёта', 'отчётов')}` : ''].filter(Boolean).map(escapeHtml).join(' · ');
}

// On the post, for players: what to test, the reward and one button.
function playtestCardHtml(project) {
  const test = project.playtest;
  if (!online || !test?.open || isMine(project.handle)) return '';
  const pid = escapeHtml(project.id);
  const left = Math.max(0, test.slots - test.taken);
  const state = test.reported ? 'отчёт отправлен' : test.joined ? 'ты тестер' : left ? 'нужны тестеры' : 'места закончились';
  const button = test.joined
    ? `<button class="btn btn-grad btn-block" data-action="playtest-open" data-id="${pid}">${icon(test.reported ? 'refresh' : 'check')} ${test.reported ? 'Изменить отчёт' : 'Открыть задание и отчитаться'}</button>`
    : left ? `<button class="btn btn-grad btn-block" data-action="playtest-join" data-id="${pid}">${icon('users')} Стать тестером</button>` : '';
  const steps = test.steps.slice(0, 4).map(step => `<li>${escapeHtml(step)}</li>`).join('') + (test.steps.length > 4 ? `<li class="more">и ещё ${test.steps.length - 4}</li>` : '');
  return `<section class="playtest-card"><div class="pt-head"><span class="pt-mark">${icon('check')}</span><span><small>Тест-задание · ${state}</small><b>${escapeHtml(test.title)}</b></span><em class="pt-reward" title="За принятый отчёт">${icon('sparkle')}+${playtestReward(test)}</em></div><ol class="pt-steps">${steps}</ol><p class="pt-meta">${playtestFactsHtml(test)}</p>${button}<p class="pt-note">Автор получит отчёт по шагам${test.access !== 'none' ? ' и откроет тебе папку проекта в ИИ-мире' : ''}. Примет — +${playtestReward(test)} искр${test.bounty ? ` (из них ${test.bounty} от автора)` : ''}, учтёт в обновлении — ещё +${sparkRules.fixed.amount}.</p></section>`;
}

function playtestChipHtml(project) {
  const test = project.playtest;
  if (!test?.open || isMine(project.handle) || (test.taken >= test.slots && !test.joined)) return '';
  return `<button class="test-chip" data-action="open-project" data-id="${escapeHtml(project.id)}">${icon('users')}<span>${test.joined ? 'Ты тестер' : 'Ищут тестеров'}</span><b>${icon('sparkle')}+${playtestReward(test)}</b></button>`;
}

async function joinPlaytest(projectId, button) {
  if (needLogin('Чтобы стать тестером, войди в аккаунт')) return;
  if (button) button.disabled = true;
  try {
    const result = await apiCall('POST', `/api/projects/${encodeURIComponent(projectId)}/playtest/join`);
    replaceProject(result.project);
    rerenderOpenProject(projectId);
    if (result.project.playtest?.workspaceId) refreshWorkspaces().catch(() => {});
    openPlaytest(projectId);
    haptic('success');
    toast('Ты в тестерах — вот задание');
  } catch (error) {
    if (button) button.disabled = false;
    toast(error.message);
  }
}

// The tester's sheet: the build and everything around it, then the report step by step.
function openPlaytest(projectId) {
  const project = projectById(projectId);
  const test = project?.playtest;
  if (!test?.joined) return;
  const previous = testReports(project).find(comment => comment.mine && comment.test?.current);
  const results = previous?.test?.results || test.steps.map(step => ({ step, ok: null, note: '' }));
  const build = test.build || '';
  const isDemo = build && build === project.demo;
  const open = build ? (isDemo ? `<button class="btn btn-primary btn-block" data-action="play-demo" data-id="${escapeHtml(project.id)}">${icon('play')} Играть в браузере</button>` : externalLink(build, 'btn btn-primary btn-block', `${icon('download')} Открыть билд`)) : '<p class="pt-note">Автор не дал ссылку на билд — спроси в комментариях.</p>';
  const facts = [['monitor', test.platform], ['tag', test.version ? `Версия ${test.version}` : '']].filter(([, value]) => value).map(([mark, value]) => `<span>${icon(mark)}${escapeHtml(value)}</span>`).join('');
  const workspace = test.workspaceId ? (ai.workspaces || []).find(item => item.id === test.workspaceId) : null;
  const folder = test.workspaceId ? `<a class="pt-folder" href="#/ai/w/${encodeURIComponent(test.workspaceId)}" data-action="layer-close">${icon('folder')}<span><b>Папка проекта в ИИ-мире</b><small>${test.access === 'run' ? 'Можно смотреть и ставить задачи ИИ' : 'Можно смотреть задачи и файлы'}${workspace?.device ? ` · ${workspace.device.online ? 'компьютер в сети' : 'компьютер не в сети'}` : ''}</small></span>${icon('chevronRight')}</a>` : '';
  const prompt = test.prompt ? `<div class="pt-prompt"><b>${icon('sparkle')} Промпт для ИИ</b><pre>${escapeHtml(test.prompt)}</pre><div class="pt-prompt-actions"><button class="btn btn-ghost btn-sm" data-action="copy" data-copy="${escapeHtml(test.prompt)}">${icon('doc')} Скопировать</button>${test.workspaceId && test.access === 'run' ? `<button class="btn btn-ghost btn-sm" data-action="playtest-run" data-id="${escapeHtml(project.id)}">${icon('send')} Запустить в папке</button>` : ''}</div></div>` : '';
  const rows = results.map((item, index) => `<div class="pt-step" data-step="${index}"><span class="pt-step-text"><i>${index + 1}</i>${escapeHtml(item.step)}</span><div class="pt-verdict" role="radiogroup" aria-label="Шаг ${index + 1}"><button type="button" role="radio" class="ok ${item.ok === true ? 'on' : ''}" aria-checked="${item.ok === true}" data-ok="1">${icon('check')}Прошло</button><button type="button" role="radio" class="bad ${item.ok === false ? 'on' : ''}" aria-checked="${item.ok === false}" data-ok="0">${icon('close')}Не прошло</button></div><input class="field pt-step-note" maxlength="300" placeholder="${item.ok === false ? 'Что пошло не так?' : 'Заметка — необязательно'}" aria-label="Заметка к шагу ${index + 1}" value="${escapeHtml(item.note || '')}"></div>`).join('');
  const agent = navigator.userAgent || '';
  const guess = /iphone|ipad/i.test(agent) ? 'iPhone, Safari' : /android/i.test(agent) ? 'Android' : /mac/i.test(agent) ? 'Mac' : /win/i.test(agent) ? 'Windows' : '';
  const dialog = openLayer(`<div class="crop playtest-sheet"><div class="crop-head"><button class="icon-btn" data-action="layer-close" aria-label="Закрыть">${icon('close')}</button><b id="layer-title">Тест-задание</b><span></span></div><div class="pt-scroll"><h3 class="pt-title">${escapeHtml(test.title)}</h3><p class="pt-sub">«${escapeHtml(project.title)}» · ${escapeHtml(project.author)}</p><section class="pt-env"><h4>Среда</h4>${open}${facts ? `<div class="pt-facts">${facts}</div>` : ''}${test.notes ? `<p class="pt-notes">${escapeHtml(test.notes)}</p>` : ''}${folder}${prompt}</section><section class="pt-report"><h4>Отчёт по шагам</h4>${rows}<textarea class="field pt-text" rows="3" maxlength="1200" placeholder="Общее впечатление, где застрял, что добавить" aria-label="Общий отзыв">${escapeHtml(previous?.test?.note || '')}</textarea><input class="field pt-platform" maxlength="60" placeholder="Где проверял: телефон, браузер, ПК" aria-label="Где проверял" value="${escapeHtml(previous?.test?.platform || guess)}"><div class="pt-shots"><label class="pt-shot-add">${icon('image')}<span>Скриншоты · до 4</span><input class="file-cover" type="file" accept="image/*" multiple data-pt-shots></label><div class="pt-shot-list"></div></div><p class="form-error" role="alert"></p><button class="btn btn-grad btn-block pt-send">${icon('send')} ${previous ? 'Обновить отчёт' : 'Отправить отчёт'}</button>${previous ? '' : `<button class="text-link pt-leave" data-action="playtest-leave" data-id="${escapeHtml(project.id)}">Отказаться от задания</button>`}</section></div></div>`, 'playtest');
  const shots = (previous?.images || []).map(url => ({ preview: uploadUrl(url) || url, url }));
  const drawShots = () => { dialog.querySelector('.pt-shot-list').innerHTML = shots.map((shot, index) => `<span class="pt-shot ${shot.url ? '' : 'loading'}"><img src="${escapeHtml(shot.preview)}" alt=""><button type="button" class="icon-btn" data-shot="${index}" aria-label="Убрать">${icon('close')}</button></span>`).join(''); };
  drawShots();
  dialog.querySelectorAll('.pt-step').forEach(row => row.querySelectorAll('[data-ok]').forEach(button => button.addEventListener('click', () => {
    const on = !button.classList.contains('on');
    haptic(on && button.dataset.ok === '0' ? 'warn' : 'select');
    row.querySelectorAll('[data-ok]').forEach(item => { item.classList.toggle('on', on && item === button); item.setAttribute('aria-checked', String(on && item === button)); });
    const note = row.querySelector('.pt-step-note');
    note.placeholder = on && button.dataset.ok === '0' ? 'Что пошло не так?' : 'Заметка — необязательно';
    if (on && button.dataset.ok === '0') note.focus({ preventScroll: true });
  })));
  dialog.querySelector('[data-pt-shots]').addEventListener('change', async event => {
    const files = [...event.target.files].filter(file => file.type.startsWith('image/')).slice(0, Math.max(0, 4 - shots.length));
    event.target.value = '';
    for (const file of files) {
      const shot = { preview: URL.createObjectURL(file), url: '' };
      shots.push(shot);
      drawShots();
      try {
        shot.url = await uploadBlob(file.type === 'image/gif' ? file : await imageToBlob(file, 1800), 'image');
      } catch (error) {
        shots.splice(shots.indexOf(shot), 1);
        toast(error.message);
      }
      drawShots();
    }
  });
  dialog.querySelector('.pt-shot-list').addEventListener('click', event => {
    const index = event.target.closest?.('[data-shot]')?.dataset.shot;
    if (index !== undefined) { shots.splice(Number(index), 1); drawShots(); }
  });
  dialog.querySelector('.pt-send').addEventListener('click', async event => {
    const button = event.currentTarget;
    const report = [...dialog.querySelectorAll('.pt-step')].map(row => {
      const chosen = row.querySelector('[data-ok].on');
      return { ok: chosen ? chosen.dataset.ok === '1' : null, note: row.querySelector('.pt-step-note').value };
    });
    const error = dialog.querySelector('.form-error');
    if (!report.some(item => item.ok !== null)) { error.textContent = 'Отметь хотя бы один шаг: прошло или нет'; return; }
    if (shots.some(shot => !shot.url)) { error.textContent = 'Подожди, скриншоты ещё загружаются'; return; }
    button.disabled = true;
    try {
      const result = await apiCall('POST', `/api/projects/${encodeURIComponent(projectId)}/playtest/report`, { results: report, text: dialog.querySelector('.pt-text').value, platform: dialog.querySelector('.pt-platform').value, images: shots.map(shot => shot.url) });
      replaceProject(result.project);
      closeLayer();
      rerenderOpenProject(projectId);
      toast(`Отчёт у автора. Примет — получишь ${sparkRules.accepted.amount} искр`);
      haptic('success');
    } catch (failure) {
      button.disabled = false;
      error.textContent = failure.message;
    }
  });
}

// The author writes or edits the playtest: steps, build, platform, notes for the setup, a prompt, folder access.
function openPlaytestEditor(projectId) {
  const project = projectById(projectId);
  if (!project) return;
  const current = project.playtest?.open ? project.playtest : null;
  const draft = current || playtestDraft(project);
  const linked = Boolean(project.workspaceId);
  const access = linked ? draft.access || 'none' : 'none';
  const balance = sparksBalance();
  const maxSlots = playtestSlots[hasPlusNow() ? 'plus' : 'free'];
  const accessRows = linked
    ? `<div class="pt-access" role="radiogroup">${playtestAccess.map(([key, label, hint]) => `<label class="pt-access-item"><input type="radio" name="access" value="${key}" ${access === key ? 'checked' : ''}><span><b>${label}</b><small>${hint}</small></span></label>`).join('')}</div><p class="pt-note">Доступ получают только те, кто взял задание, и он пропадает, когда ты закрываешь набор.</p>`
    : '<p class="pt-note">Свяжи пост с папкой во вкладке «Код и ИИ» — тогда тестерам можно будет открыть папку проекта.</p>';
  const dialog = openLayer(`<div class="crop playtest-editor"><div class="crop-head"><button class="icon-btn" data-action="layer-close" aria-label="Отмена">${icon('close')}</button><b id="layer-title">${current ? 'Тест-задание' : 'Новое тест-задание'}</b><span></span></div><form class="form pt-form"><label class="pt-label">Что проверить<input class="field" name="title" maxlength="100" required value="${escapeHtml(draft.title)}" placeholder="Например: первые 5 минут на телефоне"></label><label class="pt-label">Шаги · по одному в строке, до ${PLAYTEST_STEPS}<textarea class="field" name="steps" rows="5" maxlength="2200" required>${escapeHtml(draft.steps.join('\n'))}</textarea></label><h4 class="pt-group">Среда</h4><label class="pt-label">Билд или демо<input class="field" name="build" maxlength="500" value="${escapeHtml(draft.build || project.demo || '')}" placeholder="Демо, itch.io, TestFlight, APK, Google Drive" inputmode="url" autocapitalize="none" spellcheck="false"></label><div class="pt-pair"><label class="pt-label">Платформа<input class="field" name="platform" maxlength="60" value="${escapeHtml(draft.platform || '')}" placeholder="Android, iOS, ПК"></label><label class="pt-label">Версия<input class="field" name="version" maxlength="24" value="${escapeHtml(draft.version || '')}" placeholder="0.4.1"></label></div><label class="pt-label">Как поставить и что знать<textarea class="field" name="notes" rows="3" maxlength="1000" placeholder="Тестовый аккаунт, как установить, известные баги">${escapeHtml(draft.notes || '')}</textarea></label><label class="pt-label">Промпт для ИИ · необязательно<textarea class="field" name="prompt" rows="3" maxlength="2000" placeholder="Тестер скопирует его своему ИИ или запустит в папке проекта: «Собери билд под мою систему и проверь, что игра стартует»">${escapeHtml(draft.prompt || '')}</textarea></label><h4 class="pt-group">Папка проекта в ИИ-мире</h4>${accessRows}<h4 class="pt-group">Награда</h4><div class="seg pt-bounty" role="radiogroup" aria-label="Искры от тебя за принятый отчёт">${playtestBounties.map(value => `<label><input type="radio" name="bounty" value="${value}" ${Number(draft.bounty || 0) === value ? 'checked' : ''} ${value > balance && value !== Number(draft.bounty || 0) ? 'disabled' : ''}><span>${value ? `+${value}` : 'Нет'}</span></label>`).join('')}</div><p class="pt-note">Сверх обычных ${sparkRules.accepted.amount} искр тестер получит выбранную награду от тебя за каждый принятый отчёт. Она спишется с твоих искр (сейчас ${balance}). Задания с наградой стоят выше в списке.</p><label class="pt-label pt-slots">Мест для тестеров<input class="field" name="slots" type="number" min="1" max="${maxSlots}" value="${Math.min(maxSlots, Number(draft.slots) || 10)}"></label>${hasPlusNow() ? '' : `<p class="pt-note">Без Плюса — до ${playtestSlots.free} тестеров, с <button type="button" class="text-link inline" data-action="plus">Плюсом</button> — до ${playtestSlots.plus}.</p>`}<p class="form-error" role="alert"></p><button class="btn btn-grad btn-block" type="submit">${icon('send')} ${current ? 'Сохранить задание' : 'Открыть набор тестеров'}</button></form></div>`, 'playtest');
  dialog.querySelector('.pt-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await apiCall('POST', `/api/projects/${encodeURIComponent(projectId)}/playtest`, { title: data.get('title'), steps: data.get('steps'), build: data.get('build'), platform: data.get('platform'), version: data.get('version'), notes: data.get('notes'), prompt: data.get('prompt'), access: data.get('access') || 'none', slots: Number(data.get('slots')) || 10, bounty: Number(data.get('bounty')) || 0 });
      replaceProject(result.project);
      closeLayer();
      hubTab = 'testers';
      rerenderHub(projectId);
      toast(current ? 'Задание обновлено' : 'Набор открыт: пост помечен в ленте «Ищут тестеров»');
    } catch (error) {
      button.disabled = false;
      form.querySelector('.form-error').textContent = error.message;
    }
  });
}

function hubTestersHtml(project) {
  const pid = escapeHtml(project.id);
  const test = project.playtest?.open ? project.playtest : null;
  const reports = testReports(project);
  if (!test) {
    return `<p class="hub-hint">Дай игрокам задание: что проверить по шагам, ссылку на билд, промпт для ИИ и, если нужно, доступ к папке проекта в ИИ-мире. Отчёты придут сюда и в «Отзывы» — их можно принять, отдать ИИ и закрыть обновлением. Тестеры получают искры.</p><button class="btn btn-grad btn-block" data-action="playtest-edit" data-id="${pid}">${icon('plus')} Создать тест-задание</button>${reports.length ? `<p class="hub-hint">Отчётов по прошлым заданиям: ${reports.length}. Они во вкладке «Отзывы».</p>` : ''}`;
  }
  const rows = (test.testers || []).map(person => {
    const status = person.reportId
      ? `<span class="pt-tally"><i class="ok">${icon('check')}${person.passed || 0}</i><i class="bad">${icon('close')}${person.failed || 0}</i>${person.accepted ? `<i class="acc">${icon('sparkle')}</i>` : ''}</span>`
      : `<small class="pt-wait">ещё тестирует</small>`;
    const open = person.reportId ? `data-action="comment-menu" data-id="${escapeHtml(person.reportId)}" data-project="${pid}"` : `data-action="profile" data-handle="${escapeHtml(person.handle)}"`;
    return `<button class="helper-row" ${open}>${avatar(person)}<span><b>${escapeHtml(person.name)}</b><small>${person.reportId ? `отчёт ${escapeHtml(timeAgo(person.reportedAt) || '')}${person.accepted ? ' · принят' : ''}` : `взял ${escapeHtml(timeAgo(person.joinedAt) || 'только что')}`}</small></span>${status}</button>`;
  }).join('');
  const access = test.access !== 'none' ? ` · ${test.access === 'run' ? 'тестеры ставят задачи ИИ' : 'тестеры видят папку'}` : '';
  return `<div class="pt-hubhead"><span><b>${escapeHtml(test.title)}</b><small>${playtestFactsHtml(test)}${access}</small></span><button class="btn btn-ghost btn-sm" data-action="playtest-edit" data-id="${pid}">${icon('pen')} Изменить</button></div><div class="hub-group"><h4>Тестеры</h4>${rows ? `<div class="helpers">${rows}</div>` : '<p class="hub-hint">Пока никто не взял задание. Пост помечен в ленте «Ищут тестеров». Позови тех, кто уже комментирует: удерживай комментарий → «Позвать в тестеры».</p>'}</div>${rows ? `<p class="hub-hint">${icon('more')} Нажми на отчёт: «Помогло» даст тестеру ${sparkRules.accepted.amount} искр, «В задачу ИИ» отправит его агенту.</p>` : ''}<button class="btn btn-ghost btn-block" data-action="playtest-close" data-id="${pid}">${icon('close')} Закрыть набор</button>`;
}

async function playtestCall(projectId, path, body, done) {
  try {
    const result = await apiCall('POST', `/api/projects/${encodeURIComponent(projectId)}/${path}`, body);
    if (result.project) replaceProject(result.project);
    rerenderHub(projectId);
    rerenderOpenProject(projectId);
    if (done) toast(typeof done === 'function' ? done(result) : done);
    return result;
  } catch (error) {
    toast(error.message);
    return null;
  }
}

// Redraws the parts of the open post sheet that a playtest changes: its card and the comments.
function rerenderOpenProject(projectId) {
  if (!modal.open || dialogContext?.kind !== 'project' || dialogContext.id !== projectId) return;
  const project = projectById(projectId);
  const card = modal.querySelector?.('[data-playtest]');
  if (card && project) card.innerHTML = playtestCardHtml(project);
  rerenderComments(projectId);
}

// The prompt from the playtest goes into the task field of the project folder.
function runPlaytestPrompt(projectId) {
  const test = projectById(projectId)?.playtest;
  if (!test?.workspaceId || !test.prompt) return;
  ai.draft = test.prompt;
  closeLayer();
  if (modal.open) modal.close();
  location.hash = `#/ai/w/${encodeURIComponent(test.workspaceId)}`;
  toast('Промпт в поле задачи — проверь и отправь');
}

// Open playtests across the feed: where to earn sparks.
function openPlaytestsList() {
  // Tasks you took first, then the ones with Plus authors, then the biggest reward, then the freshest.
  const list = projects().filter(project => project.playtest?.open && !isMine(project.handle) && visibleInFeed(project))
    .sort((a, b) => Number(b.playtest.joined) - Number(a.playtest.joined) || Number(b.playtest.boosted) - Number(a.playtest.boosted) || playtestReward(b.playtest) - playtestReward(a.playtest) || (b.playtest.updatedAt || 0) - (a.playtest.updatedAt || 0));
  const rows = list.map(project => `<button class="set-row" data-action="open-project" data-id="${escapeHtml(project.id)}"><span class="row-mark">${icon(project.playtest.joined ? 'check' : 'users')}</span><span><b>${escapeHtml(project.playtest.title)}</b><small>«${escapeHtml(project.title)}» · ${playtestFactsHtml(project.playtest)}</small></span><em class="pt-reward">${icon('sparkle')}+${playtestReward(project.playtest)}</em></button>`).join('');
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Тест-задания</h2><p class="hub-hint">Авторы просят проверить игры и приложения по шагам. Отчёт, который автор примет, приносит ${sparkRules.accepted.amount} искр и награду автора, если он её назначил, а если по отчёту выйдет обновление — ещё ${sparkRules.fixed.amount}.</p>${rows ? `<div class="hub-list">${rows}</div>` : emptyState('users', 'Сейчас открытых заданий нет', '', 'Загляни позже или подпишись на авторов — новые задания придут в уведомлениях')}</div>`, { kind: 'playtests' });
}

/* A comment becomes an AI task; a finished task becomes an update */

function openCommentTask(projectId, commentId) {
  const project = projectById(projectId);
  const comment = project?.comments?.find(item => item.id === commentId);
  if (!project || !comment) return;
  const workspace = linkedWorkspaceFor(project);
  const dialog = openLayer(`<div class="crop comment-task"><div class="crop-head"><button class="icon-btn" data-action="layer-close" aria-label="Отмена">${icon('close')}</button><b id="layer-title">Задача для ИИ</b><span></span></div><p class="hub-hint">Уйдёт в папку «${escapeHtml(workspace?.name || 'проекта')}» на компьютере «${escapeHtml(workspace?.device?.name || '')}»${workspace?.device?.online ? '' : ' — он сейчас не в сети, задача подождёт'}.</p><textarea class="field" rows="7" maxlength="8000" aria-label="Текст задачи">${escapeHtml(taskFromComment(project, comment))}</textarea><div class="seg" role="radiogroup"><button role="radio" aria-checked="false" data-mode="read">Только разобраться</button><button role="radio" aria-checked="true" class="on" data-mode="edit">Разобраться и исправить</button></div><button class="btn btn-grad btn-block task-send">${icon('send')} Отправить в ИИ-мир</button></div>`, 'comment-task');
  let mode = 'edit';
  dialog.querySelectorAll('.seg button').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    dialog.querySelectorAll('.seg button').forEach(item => { item.classList.toggle('on', item === button); item.setAttribute('aria-checked', String(item === button)); });
  }));
  dialog.querySelector('.task-send').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      const result = await apiCall('POST', `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/task`, { prompt: dialog.querySelector('textarea').value, mode });
      replaceProject(result.project);
      closeLayer();
      rerenderComments(projectId);
      toast('Задача ушла в ИИ-мир, автору комментария — 10 искр');
    } catch (error) {
      event.currentTarget.disabled = false;
      toast(error.message);
    }
  });
}

async function taskToUpdate(taskId, projectId, button) {
  const project = projectById(projectId);
  const detail = [...(ai.details?.values?.() || [])].find(item => item?.tasks?.some(task => task.id === taskId));
  const task = detail?.tasks?.find(item => item.id === taskId);
  if (!project || !task) return;
  if (button) button.disabled = true;
  let commits = [];
  try { commits = (await apiCall('GET', `/api/workspaces/${encodeURIComponent(detail.id)}/git`))?.log || []; } catch {}
  if (button) button.disabled = false;
  openUpdateForm(projectId, { ...updateFromTask(task, commits), taskId });
}

function steamBadgeHtml(project) {
  const status = project.steam?.status;
  if (status === 'coming') return `<span class="steam-badge coming">${icon('gamepad')}Скоро в Steam${project.steam.releaseAt ? ` · ${shortDate(project.steam.releaseAt)}` : ''}</span>`;
  if (status === 'released') return `<span class="steam-badge">${icon('gamepad')}Вышла в Steam</span>`;
  return '';
}

/* Sparks and Plus across the three parts */

function sparksBalance() {
  return online && me ? Number(remote?.account?.sparks) || 0 : 0;
}

function boostGiftsHtml(project) {
  if (!online || !me) return '';
  const pid = escapeHtml(project.id);
  const gifts = [
    remote?.account?.plusCredit ? `<button class="gift-row" data-action="boost-gift" data-pay="plus" data-id="${pid}"><span class="plus-mark small">${icon('crown')}</span><span><b>Бесплатный день по Плюсу</b><small>Раз в месяц · до 300 показов</small></span>${icon('chevronRight')}</button>` : '',
    sparksBalance() >= sparkPrices.boostDay ? `<button class="gift-row" data-action="boost-gift" data-pay="sparks" data-id="${pid}"><span class="row-mark">${icon('sparkle')}</span><span><b>День за ${sparkPrices.boostDay} искр</b><small>У тебя ${sparksBalance()} искр</small></span>${icon('chevronRight')}</button>` : ''
  ].join('');
  return gifts ? `<div class="gifts">${gifts}</div>` : '';
}

async function boostGift(projectId, pay, button) {
  button.disabled = true;
  try {
    await apiCall('POST', '/api/promotions', { projectId, plan: 'day', pay });
    await reloadAll({ rerender: false });
    openProject(projectId);
    toast('Пост продвигается сутки');
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
}

function openSparks() {
  if (!me) return;
  const log = (remote?.account?.sparkLog || []).map(entry => `<div class="spark-row"><span>${escapeHtml(entry.label)}<small>${timeAgo(entry.at) || ''}</small></span><b class="${entry.amount < 0 ? 'minus' : ''}">${entry.amount > 0 ? '+' : ''}${entry.amount}</b></div>`).join('');
  const rules = Object.values(sparkRules).map(rule => `<li><b>+${rule.amount}</b><span>${escapeHtml(rule.label)}${rule.hint ? `<small>${escapeHtml(rule.hint)}</small>` : ''}</span></li>`).join('');
  const balance = sparksBalance();
  showDialog(`<div class="sheet-body sparks"><span class="spark-mark">${icon('sparkle')}</span><h2 id="modal-title">${balance} ${plural(balance, 'искра', 'искры', 'искр')}</h2><p class="hub-hint">Искры дают авторы за помощь: принятые отчёты о багах, полезные отзывы и закреплённые комментарии.</p><h3 class="set-title">Как получить</h3><ul class="spark-rules">${rules}</ul><button class="gift-row" data-action="playtests"><span class="row-mark">${icon('users')}</span><span><b>Тест-задания</b><small>Проверь игру по шагам — за принятый отчёт +${sparkRules.accepted.amount}</small></span>${icon('chevronRight')}</button><h3 class="set-title">На что потратить</h3><button class="gift-row" data-action="plus-sparks" ${balance >= sparkPrices.plusWeek ? '' : 'disabled'}><span class="plus-mark small">${icon('crown')}</span><span><b>Неделя Плюса</b><small>${sparkPrices.plusWeek} искр</small></span>${icon('chevronRight')}</button><div class="gift-row muted"><span class="row-mark">${icon('megaphone')}</span><span><b>День продвижения поста</b><small>${sparkPrices.boostDay} искр · кнопка «Продвинуть» на странице своего поста</small></span></div>${log ? `<h3 class="set-title">История</h3><div class="spark-log">${log}</div>` : ''}</div>`, { kind: 'sparks' });
}

async function plusForSparks(button) {
  button.disabled = true;
  try {
    await apiCall('POST', '/api/plus/sparks');
    await reloadAll({ rerender: false });
    closeDialog();
    render();
    toast('Плюс на неделю включён');
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
}

function mySteamProjectsHtml() {
  if (!online || !me) return '';
  const mine = projects().filter(project => isMine(project.handle) && project.category === 'games');
  if (!mine.length) return '';
  return `<section class="block my-steam"><h2 class="block-title">Мои игры на пути в Steam</h2>${mine.map(project => {
    const readiness = projectReadiness(project);
    return `<button class="set-row" data-action="hub-open" data-id="${escapeHtml(project.id)}"><span class="ready-ring small" style="--p:${readiness.percent}"><b>${readiness.percent}</b></span><span><b>${escapeHtml(project.title)}</b><small>${escapeHtml(steamLabels[project.steam?.status || 'none'])}${project.publisherNoticed ? ' · издатель заметил' : ''}</small></span>${icon('chevronRight')}</button>`;
  }).join('')}</section>`;
}

/* Feed modes: recommendations, following, discovery */

const FEED_MODE_KEY = 'prostim-feed-mode';
const feedModes = [['following', 'Подписки'], ['foryou', 'Для тебя'], ['discover', 'Открытия']];
let feedMode = (() => { try { const saved = storage.getItem(FEED_MODE_KEY); return feedModes.some(([key]) => key === saved) ? saved : 'foryou'; } catch { return 'foryou'; } })();
const feedKey = () => `${feedMode}:${feedCategory}`;

const feedModeHints = { following: ['users', 'Авторы и проекты, за которыми следишь'], foryou: ['sparkle', 'Рекомендации под твои интересы'], discover: ['search', 'Темы, которых ты ещё не видел'] };
const feedModeLabel = () => feedModes.find(([key]) => key === feedMode)?.[1] || 'Для тебя';

const feedModeOrder = ['foryou', 'following', 'discover'];

// Plain text that drops down under "Лента": no panel, a shadow keeps it readable over any picture.
function feedModeMenuHtml() {
  return `<i class="mode-scrim" aria-hidden="true"></i><div class="mode-menu" role="menu" aria-label="Что показывать в ленте" hidden><i class="mode-bar" aria-hidden="true"></i>${feedModeOrder.map((key, index) => `<button role="menuitemradio" aria-checked="${key === feedMode}" class="${key === feedMode ? 'on' : ''}" data-action="feed-mode" data-mode="${key}" style="--i:${index}">${feedModes.find(([id]) => id === key)[1]}</button>`).join('')}</div>`;
}

let modeMenuTimer = 0;

// The white underline under "Лента" drops down, stretching on the way like a drop, and lands under the
// current mode, while the modes fade in around it. Closing sends it back up under "Лента".
function placeModeBar(menu) {
  const bar = menu.querySelector('.mode-bar');
  const active = menu.querySelector('button.on') || menu.querySelector('button');
  const source = topbar.querySelector?.('.services-bar');
  if (!bar || !active) return;
  const box = menu.getBoundingClientRect();
  const from = source?.getBoundingClientRect?.();
  bar.style.setProperty('--to-x', `${Math.round(active.offsetLeft + active.offsetWidth / 2)}px`);
  bar.style.setProperty('--to-y', `${Math.round(active.offsetTop + active.offsetHeight - 4)}px`);
  bar.style.setProperty('--from-x', `${Math.round(from ? from.left + from.width / 2 - box.left : box.width / 2)}px`);
  bar.style.setProperty('--from-y', `${Math.round(from ? from.top - box.top : -12)}px`);
}

function toggleModeMenu(open) {
  const menu = topbar.querySelector?.('.mode-menu');
  const toggle = topbar.querySelector?.('[data-action="feed-modes"]');
  if (!menu || !toggle) return;
  const nav = topbar.querySelector?.('.services');
  const isOpen = !menu.hidden && !menu.classList.contains('closing');
  const show = open ?? !isOpen;
  if (show === isOpen) return;
  clearTimeout(modeMenuTimer);
  if (show) {
    menu.classList.remove('closing');
    menu.hidden = false;
    const link = toggle.getBoundingClientRect();
    const bar = topbar.getBoundingClientRect();
    menu.style.top = `${Math.round(link.bottom - bar.top + 6)}px`;
    menu.style.left = `${Math.round(link.left + link.width / 2 - bar.left - menu.offsetWidth / 2)}px`;
    placeModeBar(menu);
    nav?.classList.add('modes-open');
    topbar.classList.add('modes-open');
  } else {
    placeModeBar(menu);
    menu.classList.add('closing');
    topbar.classList.remove('modes-open');
    modeMenuTimer = setTimeout(() => { menu.hidden = true; menu.classList.remove('closing'); nav?.classList.remove('modes-open'); }, 340);
  }
  toggle.setAttribute('aria-expanded', String(show));
  toggle.classList.toggle('open', show);
}

const feedEntry = item => ({ id: item.project.id, reason: item.reason === 'repost' && item.by ? `repost:${item.by}` : item.reason });

// Following: posts of people I follow, projects I watch and reposts by people I follow, newest activity first.
function followingEntries(list) {
  const reposts = repostMap();
  const watching = watchingList();
  const taste = currentTaste();
  return list
    .filter(project => !isMine(project.handle) && (state.follows.includes(project.handle) || watching.includes(project.id) || reposts.has(project.id)))
    .map(project => ({ project, at: Math.max(Number(project.createdAt) || 0, Number(project.lastUpdateAt) || 0) }))
    .sort((left, right) => right.at - left.at)
    .map(({ project }) => ({
      id: project.id,
      reason: project.lastUpdateAt && project.lastUpdateAt > (taste.seen[project.id]?.last || 0) ? 'update' : reposts.has(project.id) && !state.follows.includes(project.handle) ? `repost:${reposts.get(project.id)}` : 'follow'
    }));
}

function setFeedMode(mode) {
  if (!feedModes.some(([key]) => key === mode)) return;
  const menu = topbar.querySelector?.('.mode-menu');
  if (menu && !menu.hidden && !menu.classList.contains('closing')) {
    menu.querySelectorAll('button').forEach(button => button.classList.toggle('on', button.dataset.mode === mode));
    toggleModeMenu(false);
    setTimeout(() => applyFeedMode(mode), 320);
    return;
  }
  applyFeedMode(mode);
}

function applyFeedMode(mode) {
  if (mode === feedMode && feedOrder) { refreshFeed(); return; }
  feedMode = mode;
  try { storage.setItem(FEED_MODE_KEY, mode); } catch {}
  endView();
  feedOrder = null;
  feedScrollTop = 0;
  render();
  document.querySelector('#feed')?.scrollTo?.({ top: 0 });
  toast(`Лента: ${feedModeLabel()}`);
}

/* First run after sign-up: what the person is into */

const onboardTags = ['Инди', 'Пиксель-арт', 'Roguelike', 'Кооператив', 'Хоррор', 'Головоломки', 'Стратегии', 'RPG', 'Платформер', 'Симулятор', 'Визуальная новелла', 'Шутер', 'Казуальные', 'Мобильные', 'VR', 'Мультиплеер', 'ИИ', 'Open source', 'Продуктивность', 'Дизайн', 'Музыка', 'Образование', 'Инструменты разработчика', 'Геймдев'];
const onboardGoals = [['play', 'Играю', 'gamepad'], ['make', 'Делаю игры', 'code'], ['apps', 'Делаю приложения', 'grid'], ['team', 'Ищу команду', 'users'], ['publish', 'Хочу издать игру', 'rocket']];
let onboard = null;

function onboardingTags() {
  const counts = new Map();
  for (const project of projects()) for (const tag of visibleTags(project)) counts.set(tag, (counts.get(tag) || 0) + 1);
  const catalog = [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([tag]) => tag);
  const seen = new Set();
  return [...onboardTags, ...catalog].filter(tag => { const key = tag.toLocaleLowerCase('ru'); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 32);
}

function onboardingPeople() {
  return (remote?.users || []).filter(user => !user.official && !isMine(user.handle) && !state.follows.includes(user.handle) && user.projects > 0)
    .sort((left, right) => (right.followers - left.followers) || (right.projects - left.projects)).slice(0, 8);
}

function openOnboarding() {
  onboard ||= { step: 1, categories: new Set(), goals: new Set(), tags: new Set(), follows: new Set() };
  const last = onboardingPeople().length ? 3 : 2;
  const step = Math.min(onboard.step, last);
  const pressed = (group, value) => onboard[group].has(value);
  const chip = (group, value, label, iconName = '') => `<button type="button" class="ob-chip ${pressed(group, value) ? 'on' : ''}" data-action="ob-pick" data-group="${group}" data-value="${escapeHtml(value)}" aria-pressed="${pressed(group, value)}">${iconName ? icon(iconName) : ''}${escapeHtml(label)}</button>`;
  let body;
  if (step === 1) {
    const hints = { games: 'Инди, демо и геймдев', apps: 'Сервисы и мобильные', tools: 'Для разработчиков и авторов' };
    body = `<h2 id="modal-title">Что тебе интересно?</h2><p class="fine">Так лента с первого дня покажет нужное, а дальше подстроится сама.</p><div class="ob-tiles">${Object.entries(categoryNames).map(([id, name]) => `<button type="button" class="ob-tile ${pressed('categories', id) ? 'on' : ''}" data-action="ob-pick" data-group="categories" data-value="${id}" aria-pressed="${pressed('categories', id)}">${icon(categoryIcons[id])}<b>${name}</b><small>${hints[id] || ''}</small></button>`).join('')}</div><h3 class="ob-sub">Чем занимаешься?</h3><div class="ob-chips">${onboardGoals.map(([value, label, iconName]) => chip('goals', value, label, iconName)).join('')}</div>`;
  } else if (step === 2) {
    body = `<h2 id="modal-title">Какие темы и жанры?</h2><p class="fine">Выбери несколько — чем больше, тем точнее первая лента.</p><div class="ob-chips">${onboardingTags().map(tag => chip('tags', tag.toLocaleLowerCase('ru'), tag)).join('')}</div>`;
  } else {
    body = `<h2 id="modal-title">Подпишись на авторов</h2><p class="fine">Их проекты и обновления будут во вкладке «Подписки».</p><div class="ob-people">${onboardingPeople().map(person => `<div class="ob-person">${avatar(person, 'lg')}<span><b>${escapeHtml(person.name)}</b><small>@${escapeHtml(person.handle)} · ${person.projects} ${plural(person.projects, 'проект', 'проекта', 'проектов')}</small></span><button type="button" class="follow-pill small ${pressed('follows', person.handle) ? 'on' : ''}" data-action="ob-pick" data-group="follows" data-value="${escapeHtml(person.handle)}" aria-pressed="${pressed('follows', person.handle)}">${pressed('follows', person.handle) ? 'Вы подписаны' : 'Подписаться'}</button></div>`).join('')}</div>`;
  }
  const dots = `<div class="ob-steps" aria-hidden="true">${Array.from({ length: last }, (_, index) => `<i class="${index + 1 === step ? 'on' : index + 1 < step ? 'done' : ''}"></i>`).join('')}</div>`;
  showDialog(`<div class="sheet-body onboarding">${dots}${body}<div class="ob-bar">${step > 1 ? `<button class="btn btn-ghost btn-square" data-action="ob-back" aria-label="Назад">${icon('chevronLeft')}</button>` : `<button class="btn btn-ghost" data-action="ob-skip">Пропустить</button>`}<button class="btn btn-grad" data-action="ob-next">${step < last ? `Дальше ${icon('chevronRight')}` : `${icon('check')} Готово`}</button></div></div>`, { kind: 'onboarding' });
  onboard.step = step;
  onboard.last = last;
}

function pickOnboarding(target) {
  if (!onboard) return;
  const group = onboard[target.dataset.group];
  const value = target.dataset.value;
  if (!group || !value) return;
  if (group.has(value)) group.delete(value); else group.add(value);
  const on = group.has(value);
  target.classList.toggle('on', on);
  target.setAttribute('aria-pressed', String(on));
  if (target.dataset.group === 'follows') target.textContent = on ? 'Вы подписаны' : 'Подписаться';
}

async function finishOnboarding(skip) {
  const payload = skip || !onboard ? { skip: true } : { categories: [...onboard.categories], goals: [...onboard.goals], tags: [...onboard.tags], follows: [...onboard.follows] };
  onboard = null;
  if (modal.open) modal.close();
  dialogContext = null;
  try { await apiCall('POST', '/api/me/onboarding', payload); } catch (error) { toast(error.message); }
  if (remote?.account) remote.account.onboarding = false;
  feedOrder = null;
  await reloadAll({ rerender: false });
  if (route().section !== 'feed') go('#/feed');
  render();
  if (!skip) toast('Лента настроена под тебя — дальше она будет учиться сама');
}

/* Comments: sorting and threads */

const COMMENT_SORT_KEY = 'prostim-comment-sort';
let commentSort = (() => { try { const saved = storage.getItem(COMMENT_SORT_KEY); return commentSorts.some(([key]) => key === saved) ? saved : 'best'; } catch { return 'best'; } })();
const openThreads = new Set();
let freshComment = '';

/* Settings: account, privacy, notifications, feed, look */

const THEME_KEY = 'prostim-theme';
const SAVER_KEY = 'prostim-saver';
const SOUND_KEY = 'prostim-sound';
const readSetting = (key, fallback) => { try { return storage.getItem(key) ?? fallback; } catch { return fallback; } };
let dataSaver = readSetting(SAVER_KEY, '0') === '1';

/* Haptics: a short tick under the finger. Android vibrates through the Vibration API. Safari on iPhone has
   no such API, but toggling an <input type="checkbox" switch> ticks the Taptic Engine (iOS 18 and newer),
   so a hidden switch is clicked for each tick. Off in the settings — off everywhere. */

const HAPTICS_KEY = 'prostim-haptics';
let hapticsOn = readSetting(HAPTICS_KEY, '1') !== '0';
const hapticPatterns = { select: [5], tap: [9], soft: [4], heavy: [16], success: [9, 70, 14], warn: [14, 60, 14], error: [24, 50, 24, 50, 24] };
const iosTicks = { select: 1, tap: 1, soft: 1, heavy: 1, success: 2, warn: 2, error: 3 };
let lastHaptic = 0;

const appleTouch = () => /iP(hone|ad|od)/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const hapticsSupported = () => typeof navigator.vibrate === 'function' || appleTouch();

function iosTick() {
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

function haptic(kind = 'tap') {
  if (!hapticsOn || typeof document.createElement !== 'function') return;
  const now = Date.now();
  // Ticks in a burst (a fast scroll past several cards) merge into one.
  if (now - lastHaptic < (kind === 'select' ? 60 : 30)) return;
  lastHaptic = now;
  try {
    if (appleTouch()) {
      iosTick();
      for (let index = 1; index < (iosTicks[kind] || 1); index += 1) setTimeout(iosTick, index * 95);
    } else navigator.vibrate?.(hapticPatterns[kind] || hapticPatterns.tap);
  } catch {}
}

// Which taps answer with which tick. Everything else stays silent: a buzz on every button tires.
const hapticActions = {
  vote: 'tap', save: 'tap', 'like-comment': 'tap', follow: 'tap', watch: 'tap', repost: 'tap', react: 'tap', copy: 'tap',
  'comment-accept': 'success', 'playtest-join': 'tap', 'pin-comment': 'tap', 'plus-trial': 'tap',
  'hub-tab': 'select', 'set-option': 'select', 'feed-mode': 'select', 'feed-modes': 'select', 'auth-mode': 'select', 'fb-filter': 'select', 'fb-open': 'select', pane: 'select', gallery: 'select', 'hub-check': 'select', 'hub-steam': 'select', 'comment-label': 'select', 'comment-sort': 'select',
  'delete-comment': 'warn', 'delete-project': 'warn', 'playtest-close': 'warn', block: 'warn'
};

// Navigation: the tab bar, the three parts at the top and the tabs inside a part tick softly.
document.addEventListener?.('click', event => {
  if (event.target?.closest?.('#dock a, #dock button, .services a, .subnav a, .ws-tabs button, .seg button')) haptic('select');
}, { capture: true });

// Switches in the settings and elsewhere.
document.addEventListener?.('change', event => {
  if (['checkbox', 'radio'].includes(event.target?.type) && !event.target.hasAttribute?.('switch')) haptic('select');
});

/* Motion on the Steam and ИИ-мир pages: objects behind the content drift at their own depth as the page
   scrolls, the hero drop and the neural core move faster than the text in front of them, blocks rise
   into place the first time they scroll in, and the scene leans after the mouse or the tilt of the
   phone. Everything is CSS transforms driven by three numbers on <html>: --sy (scroll), --px and --py
   (lean, from -1 to 1). With «reduce motion» the scene stands still. */

const motionPages = ['steam', 'ai'];
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
let ambient = null;
let motionFrame = 0;
let motionLean = { x: 0, y: 0 };
let revealRoute = '';
let revealObserver = null;

// Each object: where it floats (percent of the screen), how fast it follows the scroll (depth) and its look.
const ambientScenes = {
  steam: [
    ['drop far', 12, 18, 0.12], ['drop', 82, 34, 0.28], ['drop near', 70, 92, 0.55], ['drop far', 30, 120, 0.18],
    ['film', 88, 8, 0.2], ['film small', 6, 66, 0.4], ['shard', 58, 54, 0.34], ['shard alt', 18, 150, 0.46],
    ['glint', 24, 30, 0.22], ['glint', 64, 76, 0.3], ['glint', 90, 130, 0.38], ['glint', 40, 170, 0.26]
  ],
  ai: [
    ['orb violet', 86, 12, 0.14], ['orb cyan', 8, 58, 0.24], ['orb violet small', 74, 118, 0.36],
    ['net', 70, 40, 0.2], ['net alt', 12, 132, 0.3], ['ring', 92, 86, 0.18], ['ring small', 4, 18, 0.32],
    ['bit', 30, 22, 0.42], ['bit', 54, 64, 0.5], ['bit', 80, 150, 0.58], ['bit', 20, 104, 0.46], ['bit', 46, 186, 0.4]
  ]
};

// A tiny network: nodes joined by lines, drawn once per page.
function netSvg() {
  const nodes = [[12, 20], [44, 8], [78, 26], [64, 62], [28, 70], [90, 78], [50, 40]];
  const links = [[0, 1], [1, 2], [2, 6], [6, 0], [6, 3], [3, 4], [4, 0], [3, 5], [2, 5]];
  return `<svg viewBox="0 0 100 90" aria-hidden="true">${links.map(([a, b]) => `<line x1="${nodes[a][0]}" y1="${nodes[a][1]}" x2="${nodes[b][0]}" y2="${nodes[b][1]}"/>`).join('')}${nodes.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="${index === 6 ? 3.4 : 2.2}"/>`).join('')}</svg>`;
}

function ambientHtml(section) {
  return (ambientScenes[section] || []).map(([kind, left, top, depth], index) => `<i class="amb ${kind}" style="--x:${left}%;--y:${top}vh;--d:${depth};--i:${index}"><i>${kind.startsWith('net') ? netSvg() : ''}</i></i>`).join('');
}

// Sets the scene for the page: objects for Steam or ИИ-мир, nothing elsewhere.
function syncAmbient(view) {
  if (typeof document.createElement !== 'function' || !document.body?.insertBefore) return;
  const section = motionPages.includes(view) ? view : '';
  if (!section) revealRoute = '';
  if (!ambient) {
    ambient = document.createElement('div');
    ambient.id = 'ambient';
    ambient.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(ambient, main);
  }
  if (ambient.dataset.section !== section) {
    ambient.dataset.section = section;
    ambient.innerHTML = section ? ambientHtml(section) : '';
  }
  document.documentElement.classList.toggle('motion-page', Boolean(section) && !reducedMotion());
  updateMotion();
}

function updateMotion() {
  motionFrame = 0;
  const root = document.documentElement;
  if (!root?.style) return;
  root.style.setProperty('--sy', String(Math.round(window.scrollY || 0)));
  root.style.setProperty('--px', motionLean.x.toFixed(3));
  root.style.setProperty('--py', motionLean.y.toFixed(3));
}

function queueMotion() {
  if (motionFrame || !document.documentElement?.classList?.contains('motion-page')) return;
  motionFrame = requestAnimationFrame(updateMotion);
}

window.addEventListener?.('scroll', queueMotion, { passive: true });

// The mouse on a computer leans the scene a little.
document.addEventListener?.('pointermove', event => {
  if (event.pointerType !== 'mouse') return;
  motionLean = { x: (event.clientX / innerWidth) * 2 - 1, y: (event.clientY / innerHeight) * 2 - 1 };
  queueMotion();
}, { passive: true });

// The tilt of a phone does the same. Android gives it freely; iPhone asks for permission, so it is not
// asked for — on iPhone the scene follows the scroll only.
if (typeof window.DeviceOrientationEvent === 'function' && typeof window.DeviceOrientationEvent.requestPermission !== 'function') {
  window.addEventListener?.('deviceorientation', event => {
    if (event.gamma == null || event.beta == null) return;
    motionLean = { x: Math.max(-1, Math.min(1, event.gamma / 25)), y: Math.max(-1, Math.min(1, (event.beta - 50) / 25)) };
    queueMotion();
  }, { passive: true });
}

// Blocks rise into place the first time they scroll into view; a redraw of the same page keeps them put.
const revealSelector = ':is(.steam-hero, .ai-hero, .money-split, .block, .perk, .game-card, .ws-card, .how-node, .how .privacy, .studio-card, .blocks-2 > *, .tile-grid > *, .topic-row, .method)';

function revealBlocks(view) {
  revealObserver?.disconnect();
  revealObserver = null;
  if (!motionPages.includes(view) || reducedMotion() || typeof IntersectionObserver !== 'function' || !main.querySelectorAll) return;
  const key = location.hash;
  const again = revealRoute === key;
  revealRoute = key;
  if (again) return;
  // Only the innermost matches move: a grid stays, its cards rise one after another.
  const items = [...main.querySelectorAll(revealSelector)].filter(item => !item.querySelector(revealSelector));
  revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const item = entry.target;
      revealObserver?.unobserve(item);
      item.classList.add('in');
      // Once in place, the classes go: hover and press effects get their own transitions back.
      setTimeout(() => item.classList.remove('rv', 'in'), 1300);
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  items.forEach(item => {
    // Neighbours in one row arrive one after another.
    const siblings = [...(item.parentElement?.children || [])].filter(child => child.matches?.(revealSelector));
    item.style.setProperty('--rv', String(Math.min(5, Math.max(0, siblings.indexOf(item)))));
    item.classList.add('rv');
    revealObserver.observe(item);
  });
}

function currentTheme() {
  const value = readSetting(THEME_KEY, 'auto');
  return ['auto', 'dark', 'light'].includes(value) ? value : 'auto';
}

function applyTheme(value = currentTheme()) {
  document.documentElement?.setAttribute?.('data-theme', value);
  const light = value === 'light' || (value === 'auto' && Boolean(window.matchMedia?.('(prefers-color-scheme: light)').matches));
  document.querySelector('meta[name="theme-color"]')?.setAttribute?.('content', light ? '#f6f5f2' : '#0c0e0d');
}

function settingsSeg(name, options, current) {
  return `<div class="seg" role="radiogroup">${options.map(([value, label]) => `<button role="radio" aria-checked="${value === current}" class="${value === current ? 'on' : ''}" data-action="set-option" data-name="${name}" data-value="${value}">${label}</button>`).join('')}</div>`;
}

function settingsRow(attrs, iconName, title, hint = '', end = icon('chevronRight')) {
  return `<button class="set-row" ${attrs}><span class="row-mark">${icon(iconName)}</span><span><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</span>${end}</button>`;
}

function settingsToggle(key, iconName, title, hint, on) {
  return `<label class="toggle-row"><input type="checkbox" data-setting="${key}" ${on ? 'checked' : ''}><span>${icon(iconName)}<b>${title}</b><small>${hint}</small></span><i class="toggle" aria-hidden="true"></i></label>`;
}

function renderSettings() {
  if (online && !me) return `<div class="page narrow">${loginCard('Войди, чтобы настроить аккаунт, уведомления и приватность')}</div>`;
  const person = me || localMe;
  const section = (title, body) => body ? `<section class="set-section"><h2>${title}</h2>${body}</section>` : '';
  const privacy = remote?.account?.privacy || { messages: 'all', comments: 'all', reposts: true };
  const account = online ? [
    settingsRow('data-action="account-sheet"', 'send', 'Вход и почта', remote?.account?.email || 'Почта, Google, Apple, Яндекс ID, GitHub'),
    plusRowHtml(),
    settingsRow('data-action="sparks-sheet"', 'sparkle', 'Искры', `${sparksBalance()} ${plural(sparksBalance(), 'искра', 'искры', 'искр')} · награды за помощь авторам`)
  ].join('') : '';
  const blocked = blockedList();
  const privacyHtml = online ? `<div class="set-field"><b>Кто может писать мне</b>${settingsSeg('messages', [['all', 'Все'], ['following', 'Мои подписки'], ['nobody', 'Никто']], privacy.messages)}<small>Тот, кто уже написал тебе первым, сможет ответить</small></div><div class="set-field"><b>Кто комментирует мои проекты</b>${settingsSeg('comments', [['all', 'Все'], ['following', 'Мои подписки']], privacy.comments)}</div>${settingsToggle('reposts', 'repost', 'Показывать мои репосты', 'Вкладка «Репосты» в профиле и пометка в ленте у подписчиков', privacy.reposts !== false)}${settingsRow('data-action="blocked-sheet"', 'ban', 'Заблокированные', blocked.length ? `${blocked.length} ${plural(blocked.length, 'человек', 'человека', 'человек')}` : 'Никого')}` : '';
  const notices = online ? settingsRow('data-action="notify-settings"', 'bell', 'Уведомления', pushState.subscribed ? 'Push включены на этом устройстве' : 'Push, тихие часы и что присылать') : '';
  const feed = `${settingsRow('data-action="feed-prefs"', 'sparkle', 'Твоя лента', 'Темы и авторы: больше, меньше или никогда')}${settingsToggle('sound', 'music', 'Звук видео в ленте', 'Видео в ленте начинают играть со звуком', readSetting(SOUND_KEY, '0') === '1')}${settingsToggle('saver', 'download', 'Экономия трафика', 'Видео не играют сами, следующие посты не грузятся заранее', dataSaver)}${settingsRow('data-action="reset-taste"', 'refresh', 'Начать ленту заново', 'Забыть, что лента узнала о тебе', '')}`;
  const look = `<div class="set-field"><b>Тема</b>${settingsSeg('theme', [['auto', 'Как на устройстве'], ['dark', 'Тёмная'], ['light', 'Светлая']], currentTheme())}</div>${hapticsSupported() ? settingsToggle('haptics', 'phone', 'Отклик при нажатиях', 'Лёгкая вибрация на лайках, вкладках, отправке и ошибках', hapticsOn) : ''}`;
  const leave = online && me ? `<button class="set-row danger" data-action="logout"><span class="row-mark">${icon('external')}</span><span><b>Выйти из аккаунта</b></span></button>` : '';
  return `<div class="page narrow settings"><h1 class="sr-only">Настройки</h1><button class="set-profile" data-action="edit-profile">${avatar(person, 'lg')}<span><b>${escapeHtml(person.name)}</b><small>@${escapeHtml(person.handle === 'me' ? 'вы' : person.handle)} · Редактировать профиль</small></span>${icon('chevronRight')}</button>${section('Аккаунт', account)}${section('Конфиденциальность', privacyHtml)}${section('Уведомления', notices)}${section('Лента', feed)}${section('Оформление', look)}${section('Приложение', installHtml())}${leave ? `<section class="set-section">${leave}</section>` : ''}</div>`;
}

function rerenderSettings() {
  if (route().section === 'settings') main.innerHTML = renderSettings();
}

async function savePrivacy(patch) {
  if (!remote?.account) return;
  remote.account.privacy = { ...(remote.account.privacy || {}), ...patch };
  try {
    const result = await apiCall('PATCH', '/api/me', { privacy: patch });
    updateUser(result.me);
    toast('Сохранено');
  } catch (error) {
    toast(error.message);
  }
}

function chooseSetting(name, value) {
  if (name === 'theme') {
    try { storage.setItem(THEME_KEY, value); } catch {}
    applyTheme(value);
  } else if (name === 'messages' || name === 'comments') savePrivacy({ [name]: value });
  rerenderSettings();
}

function toggleSetting(key, on) {
  if (key === 'reposts') savePrivacy({ reposts: on });
  else if (key === 'saver') {
    dataSaver = on;
    try { storage.setItem(SAVER_KEY, on ? '1' : '0'); } catch {}
  } else if (key === 'haptics') {
    hapticsOn = on;
    try { storage.setItem(HAPTICS_KEY, on ? '1' : '0'); } catch {}
    if (on) haptic('success');
  } else if (key === 'sound') {
    feedMuted = !on;
    try { storage.setItem(SOUND_KEY, on ? '1' : '0'); } catch {}
  }
}

function openAccountSheet() {
  if (!me) return;
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Вход и почта</h2>${accountHtml() || '<p class="fine">Вход по почте и через сервисы на этом сервере не настроен.</p>'}</div>`, { kind: 'account' });
  clearInterval(authResendTimer);
  if (authFlow?.purpose === 'link') authResendTimer = setInterval(tickAuthResend, 1000);
}

function openBlockedSheet() {
  const blocked = blockedList();
  const rows = blocked.map(handle => `<div class="account-row">${icon('ban')}<span><b>@${escapeHtml(handle)}</b></span><button class="btn btn-ghost btn-sm" data-action="block" data-handle="${escapeHtml(handle)}">Разблокировать</button></div>`).join('');
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Заблокированные</h2>${rows ? `<div class="blocked-list">${rows}</div>` : '<p class="fine">Никого. Заблокировать можно в меню «…» на посте или в профиле.</p>'}</div>`, { kind: 'blocked' });
}

/* A second layer above the sheet: cropping a picture, choosing what stays in view */

let layer = null;

function openLayer(html, kind) {
  if (!layer) {
    layer = document.createElement('dialog');
    layer.className = 'layer';
    layer.setAttribute('aria-labelledby', 'layer-title');
    document.body.appendChild(layer);
  }
  layer.dataset.kind = kind;
  layer.innerHTML = html;
  if (!layer.open) layer.showModal();
  return layer;
}

function closeLayer() {
  if (layer?.open) layer.close();
}

function loadPicture(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не получилось открыть картинку'));
    image.src = src;
  });
}

// Drag to move, wheel, slider or two fingers to zoom; "Готово" draws the framed part into a file.
async function openCropper({ file, aspect = 1, round = false, size = 640, title = 'Кадрирование', onDone }) {
  const url = URL.createObjectURL(file);
  let image;
  try { image = await loadPicture(url); } catch (error) { URL.revokeObjectURL(url); toast(error.message); return; }
  const dialog = openLayer(`<div class="crop"><div class="crop-head"><button class="icon-btn" data-action="layer-close" aria-label="Отмена">${icon('close')}</button><b id="layer-title">${escapeHtml(title)}</b><button class="btn btn-grad btn-sm crop-done">Готово</button></div><div class="crop-stage ${round ? 'round' : ''}" style="aspect-ratio:${aspect}"><img class="crop-image" src="${url}" alt="" draggable="false"><i class="crop-grid" aria-hidden="true"></i></div><label class="crop-zoom">${icon('minus')}<input type="range" min="1" max="4" step="0.01" value="1" aria-label="Масштаб">${icon('plus')}</label><p class="fine">Двигай фото пальцем или мышью. Масштаб — ползунком, колёсиком или двумя пальцами.</p></div>`, 'crop');
  const stage = dialog.querySelector('.crop-stage');
  const picture = dialog.querySelector('.crop-image');
  const slider = dialog.querySelector('input[type="range"]');
  const view = { zoom: 1, x: 0, y: 0 };
  const box = () => stage.getBoundingClientRect();
  const base = () => Math.max(box().width / image.naturalWidth, box().height / image.naturalHeight);
  const paint = () => {
    const frame = box();
    const scale = base() * view.zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    view.x = Math.min(0, Math.max(frame.width - width, view.x));
    view.y = Math.min(0, Math.max(frame.height - height, view.y));
    picture.style.width = `${width}px`;
    picture.style.height = `${height}px`;
    picture.style.transform = `translate(${view.x}px, ${view.y}px)`;
    slider.value = String(view.zoom);
  };
  const zoomAt = (zoom, x, y) => {
    const before = base() * view.zoom;
    view.zoom = Math.max(1, Math.min(4, zoom));
    const after = base() * view.zoom;
    view.x = x - (x - view.x) / before * after;
    view.y = y - (y - view.y) / before * after;
    paint();
  };
  requestAnimationFrame(() => {
    const frame = box();
    const scale = base();
    view.x = (frame.width - image.naturalWidth * scale) / 2;
    view.y = (frame.height - image.naturalHeight * scale) / 2;
    paint();
  });
  const pointers = new Map();
  stage.addEventListener('pointerdown', event => {
    stage.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  stage.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const now = { x: event.clientX, y: event.clientY };
    if (pointers.size === 1) {
      view.x += now.x - previous.x;
      view.y += now.y - previous.y;
      pointers.set(event.pointerId, now);
      paint();
      return;
    }
    const [first, second] = [...pointers.values()];
    const before = Math.hypot(first.x - second.x, first.y - second.y) || 1;
    pointers.set(event.pointerId, now);
    const [left, right] = [...pointers.values()];
    const after = Math.hypot(left.x - right.x, left.y - right.y) || 1;
    const frame = box();
    zoomAt(view.zoom * after / before, (left.x + right.x) / 2 - frame.left, (left.y + right.y) / 2 - frame.top);
  });
  const release = event => pointers.delete(event.pointerId);
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const frame = box();
    zoomAt(view.zoom * Math.exp(-event.deltaY * 0.0015), event.clientX - frame.left, event.clientY - frame.top);
  }, { passive: false });
  slider.addEventListener('input', () => { const frame = box(); zoomAt(Number(slider.value), frame.width / 2, frame.height / 2); });
  dialog.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
  dialog.querySelector('.crop-done').addEventListener('click', () => {
    const frame = box();
    const scale = base() * view.zoom;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = Math.round(size / aspect);
    canvas.getContext('2d').drawImage(image, -view.x / scale, -view.y / scale, frame.width / scale, frame.height / scale, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      closeLayer();
      if (blob) onDone(blob); else toast('Не получилось сохранить кадр');
    }, 'image/jpeg', 0.9);
  });
}

// The visible part of a picture shown with object-fit: cover in a frame of the given ratio,
// in percent of the picture, for a focus point in percent.
function visibleArea(width, height, ratio, focus) {
  const [fx, fy] = focus || [50, 50];
  const own = width / height;
  if (own > ratio) {
    const share = ratio / own;
    return { left: (1 - share) * fx, top: 0, width: share * 100, height: 100 };
  }
  const share = own / ratio;
  return { left: 0, top: (1 - share) * fy, width: 100, height: share * 100 };
}

const feedFrames = [{ ratio: 9 / 16, label: 'В ленте', kind: 'in-feed' }, { ratio: 16 / 10, label: 'На странице поста', kind: 'on-page' }];

// Tap or drag on the picture: that point always stays in view. The bright frame shows what the feed
// shows, the dashed one what the post page shows; the previews below are the real crops.
async function openFocusEditor({ items, index = 0, frames = feedFrames, onChange }) {
  const list = items.filter(item => item.src);
  if (!list.length) return;
  let at = Math.max(0, Math.min(index, list.length - 1));
  const draw = async () => {
    const item = list[at];
    const isVideo = item.type === 'video';
    const media = isVideo ? `<video src="${escapeHtml(item.src)}#t=0.1" muted playsinline preload="metadata"></video>` : `<img src="${escapeHtml(item.src)}" alt="" draggable="false">`;
    const dialog = openLayer(`<div class="crop focus-editor"><div class="crop-head"><button class="icon-btn" data-action="layer-close" aria-label="Закрыть">${icon('close')}</button><b id="layer-title">Что попадёт в кадр</b><button class="btn btn-grad btn-sm focus-done">Готово</button></div><div class="focus-canvas">${media}${frames.map(frame => `<i class="focus-frame ${frame.kind}"><em>${frame.label}</em></i>`).join('')}<i class="focus-dot" aria-hidden="true"></i></div><div class="focus-previews">${frames.map(frame => `<figure class="${frame.kind}"><div class="focus-preview" style="aspect-ratio:${frame.ratio}">${isVideo ? `<video src="${escapeHtml(item.src)}#t=0.1" muted playsinline preload="metadata"></video>` : `<img src="${escapeHtml(item.src)}" alt="">`}</div><figcaption>${frame.label}</figcaption></figure>`).join('')}</div><p class="fine">Нажми или веди по фото — эта точка всегда останется в кадре.</p>${list.length > 1 ? `<div class="focus-nav"><button class="btn btn-ghost btn-sm focus-prev" ${at ? '' : 'disabled'}>${icon('chevronLeft')}</button><span>${at + 1} из ${list.length}</span><button class="btn btn-ghost btn-sm focus-next" ${at < list.length - 1 ? '' : 'disabled'}>${icon('chevronRight')}</button></div>` : ''}</div>`, 'focus');
    const canvas = dialog.querySelector('.focus-canvas');
    const element = canvas.querySelector('img, video');
    const size = await new Promise(resolve => {
      const done = () => resolve({ width: element.naturalWidth || element.videoWidth || 1, height: element.naturalHeight || element.videoHeight || 1 });
      if ((element.naturalWidth || element.videoWidth)) done();
      else element.addEventListener(isVideo ? 'loadedmetadata' : 'load', done, { once: true });
    });
    canvas.style.aspectRatio = `${size.width} / ${size.height}`;
    const paint = () => {
      const focus = item.focus || [50, 50];
      frames.forEach((frame, number) => {
        const area = visibleArea(size.width, size.height, frame.ratio, focus);
        const box = canvas.querySelectorAll('.focus-frame')[number];
        Object.assign(box.style, { left: `${area.left}%`, top: `${area.top}%`, width: `${area.width}%`, height: `${area.height}%` });
      });
      Object.assign(canvas.querySelector('.focus-dot').style, { left: `${focus[0]}%`, top: `${focus[1]}%` });
      dialog.querySelectorAll('.focus-preview img, .focus-preview video').forEach(preview => { preview.style.objectPosition = `${focus[0]}% ${focus[1]}%`; });
    };
    paint();
    let dragging = false;
    const place = event => {
      const box = canvas.getBoundingClientRect();
      item.focus = [Math.round(Math.max(0, Math.min(100, (event.clientX - box.left) / box.width * 100))), Math.round(Math.max(0, Math.min(100, (event.clientY - box.top) / box.height * 100)))];
      paint();
    };
    canvas.addEventListener('pointerdown', event => { dragging = true; canvas.setPointerCapture?.(event.pointerId); place(event); });
    canvas.addEventListener('pointermove', event => { if (dragging) place(event); });
    canvas.addEventListener('pointerup', () => { dragging = false; onChange?.(); });
    dialog.querySelector('.focus-done').addEventListener('click', () => { closeLayer(); onChange?.(); });
    dialog.querySelector('.focus-prev')?.addEventListener('click', () => { at -= 1; draw(); });
    dialog.querySelector('.focus-next')?.addEventListener('click', () => { at += 1; draw(); });
  };
  draw();
}

function openMediaFocus(index) {
  const items = publishMedia.map(item => Object.assign(item, { src: item.preview || item.url }));
  openFocusEditor({ items, index, onChange: () => renderPicker() });
}

function openBlockFocus(index) {
  const block = postDraft?.blocks[index];
  if (!block?.ratio) return;
  const [width, height] = block.ratio.split(':').map(Number);
  const item = { type: 'image', src: block.preview || uploadUrl(block.url), focus: block.focus };
  openFocusEditor({ items: [item], frames: [{ ratio: width / height, label: imageRatios[block.ratio], kind: 'in-feed' }], onChange: () => { block.focus = item.focus; rerenderBlock(index); } });
}

/* Notifications: the activity list, web push and installing the app */

const noticeIcons = { follow: 'user', like: 'up', repost: 'repost', comment: 'comment', reply: 'comment', 'comment-like': 'heart', pin: 'pin', update: 'bell', post: 'sparkle', accepted: 'check', tasked: 'sparkle', fixed: 'check', review: 'star', 'task-done': 'code', 'demo-ready': 'play', publisher: 'crown', steam: 'gamepad', tester: 'users', 'test-report': 'check', 'tester-invite': 'sparkle' };
const pushState = { subscribed: false, checked: false };
const PUSH_ASK_KEY = 'prostim-push-ask';
let workerRegistration = null;

const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof PushManager === 'function' && typeof Notification === 'function';
const isIos = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const isStandalone = () => Boolean(window.matchMedia?.('(display-mode: standalone)').matches || (typeof navigator !== 'undefined' && navigator.standalone));

function activityUnread() {
  return online && me ? remote?.activity?.unread || 0 : 0;
}

function bellHtml() {
  if (!online || !me) return '';
  const unread = activityUnread();
  return `<a class="top-bell" href="#/activity" aria-label="Уведомления${unread ? `, новых: ${unread}` : ''}">${icon('bell')}${unread ? `<i class="count-badge">${unread > 99 ? '99+' : unread}</i>` : ''}</a>`;
}

function userById(id) {
  return remote?.users?.find(user => user.id === id) || null;
}

function noticeRowHtml(item) {
  const actor = userById(item.actor);
  const project = item.projectId ? projectById(item.projectId) : null;
  const href = String(item.url || '#/activity').replace(/^\//, '');
  const kind = noticeIcons[item.type] || 'bell';
  const face = actor ? avatar(actor, 'lg') : `<span class="notice-mark">${icon(kind)}</span>`;
  return `<a class="notice-row ${item.read ? '' : 'unread'}" href="${escapeHtml(href)}"><span class="notice-face">${face}<i class="notice-kind ${escapeHtml(item.type)}">${icon(kind)}</i></span><span class="notice-text">${escapeHtml(item.text)}<small>${escapeHtml(timeAgo(item.at) || '')}</small></span>${project ? `<span class="notice-thumb">${scene(project, 0, 'still')}</span>` : ''}</a>`;
}

function renderActivity() {
  if (!online) return `<div class="page narrow">${emptyState('bell', 'Уведомления работают, когда сайт подключён к серверу')}</div>`;
  if (!me) return `<div class="page narrow">${loginCard('Войди, чтобы видеть подписчиков, ответы и обновления проектов')}</div>`;
  const fresh = activity.items.filter(item => !item.read);
  const older = activity.items.filter(item => item.read);
  const list = !activity.loaded ? `<div class="notice-loading">${logoLoaderHtml()}</div>`
    : activity.items.length ? `${fresh.length ? `<h2 class="row-title">Новые</h2>${fresh.map(noticeRowHtml).join('')}` : ''}${older.length ? `<h2 class="row-title">Раньше</h2>${older.map(noticeRowHtml).join('')}` : ''}`
      : emptyState('bell', 'Пока тихо', '<a class="btn btn-ghost" href="#/feed">В ленту</a>', 'Здесь появятся подписчики, ответы, поддержка и обновления проектов, за которыми ты следишь');
  return `<div class="page narrow activity"><h1 class="sr-only">Уведомления</h1><div id="push-banner">${pushBannerHtml()}</div><div class="notice-list">${list}</div></div>`;
}

function pushBannerHtml() {
  if (!online || !me) return '';
  if (!pushSupported()) {
    return isIos() && !isStandalone() ? `<div class="push-banner">${icon('phone')}<span><b>Уведомления на iPhone</b><small>Добавь про.стим на экран «Домой» — и ответы будут приходить, даже когда сайт закрыт</small></span><button class="btn btn-ghost btn-sm" data-action="install-app">Как</button></div>` : '';
  }
  if (Notification.permission === 'denied') return `<div class="push-banner muted">${icon('bell')}<span><b>Уведомления запрещены в браузере</b><small>Их можно разрешить в настройках сайта</small></span></div>`;
  if (pushState.subscribed || !pushState.checked) return '';
  return `<div class="push-banner">${icon('bell')}<span><b>Не пропускай ответы</b><small>Комментарии, подписчики и обновления — даже когда сайт закрыт</small></span><button class="btn btn-grad btn-sm" data-action="push-on">Включить</button></div>`;
}

async function registerWorker() {
  if (!canReachServer || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (!workerRegistration) {
    try { workerRegistration = await navigator.serviceWorker.register('/sw.js'); } catch { workerRegistration = null; }
    navigator.serviceWorker.addEventListener?.('message', event => {
      if (event.data?.type !== 'open' || !event.data.url) return;
      const url = new URL(event.data.url, location.href);
      if (url.origin === location.origin) location.hash = url.hash || '#/activity';
    });
  }
  return workerRegistration;
}

async function checkPush() {
  if (!pushSupported()) { pushState.checked = true; return; }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    pushState.subscribed = Boolean(await registration?.pushManager?.getSubscription());
  } catch { pushState.subscribed = false; }
  pushState.checked = true;
  const banner = document.querySelector('#push-banner');
  if (banner) banner.innerHTML = pushBannerHtml();
}

async function loadActivity() {
  if (!online || !me || activity.loading) return;
  activity.loading = true;
  try {
    const data = await apiCall('GET', '/api/notifications');
    activity.items = data.items || [];
    if (data.unread) await apiCall('POST', '/api/notifications/read').catch(() => {});
    remote.activity = { unread: 0 };
    navigator.clearAppBadge?.()?.catch?.(() => {});
  } catch (error) {
    toast(error.message);
  }
  activity.loaded = true;
  activity.loading = false;
  if (route().section === 'activity') {
    main.innerHTML = renderActivity();
    renderChrome('activity', route());
  }
  checkPush();
}

function onNotify(data) {
  if (!remote) return;
  remote.activity = { unread: Number(data.unread) || 0 };
  if (route().section === 'activity') loadActivity();
  else renderChrome(document.body.dataset.section || 'feed', route());
}

function urlBase64ToBytes(value) {
  const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function enablePush(button = null) {
  if (needLogin('Чтобы получать уведомления, войди в аккаунт')) return false;
  if (!pushSupported()) {
    if (isIos() && !isStandalone()) openInstall(); else toast('Этот браузер не умеет push-уведомления');
    return false;
  }
  if (!remote?.config?.push) { toast('Сервер пока не настроил уведомления'); return false; }
  if (button) button.disabled = true;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      toast(permission === 'denied' ? 'Уведомления запрещены — их можно разрешить в настройках сайта' : 'Уведомления не включены');
      return false;
    }
    await registerWorker();
    const registration = await navigator.serviceWorker.ready;
    const key = urlBase64ToBytes(remote.config.push);
    let subscription = await registration.pushManager.getSubscription();
    const current = subscription?.options?.applicationServerKey ? new Uint8Array(subscription.options.applicationServerKey) : null;
    if (subscription && current && (current.length !== key.length || current.some((byte, index) => byte !== key[index]))) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const result = await apiCall('POST', '/api/push/subscribe', { ...subscription.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (remote.account) remote.account.pushDevices = result.devices;
    pushState.subscribed = true;
    pushState.checked = true;
    toast('Уведомления включены 🔔');
    return true;
  } catch (error) {
    toast(error.message || 'Не получилось включить уведомления');
    return false;
  } finally {
    if (button) button.disabled = false;
    refreshPushViews();
  }
}

async function disablePush() {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      const result = await apiCall('POST', '/api/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => null);
      if (result && remote.account) remote.account.pushDevices = result.devices;
      await subscription.unsubscribe();
    }
    pushState.subscribed = false;
    toast('Уведомления на этом устройстве выключены');
  } catch (error) {
    toast(error.message);
  }
  refreshPushViews();
}

function refreshPushViews() {
  const banner = document.querySelector('#push-banner');
  if (banner) banner.innerHTML = pushBannerHtml();
  if (dialogContext?.kind === 'notify') openNotifySettings();
}

// A gentle question at the moment it makes sense (after a comment, a follow, a message), not on arrival.
function maybeAskPush(text) {
  if (!online || !me || !pushSupported() || Notification.permission !== 'default' || pushState.subscribed) return;
  let last = 0;
  try { last = Number(storage.getItem(PUSH_ASK_KEY)) || 0; } catch {}
  if (Date.now() - last < 3 * 864e5) return;
  try { storage.setItem(PUSH_ASK_KEY, String(Date.now())); } catch {}
  document.querySelector('.push-ask')?.remove?.();
  document.body.insertAdjacentHTML?.('beforeend', `<div class="push-ask" role="dialog" aria-label="Уведомления">${icon('bell')}<span>${escapeHtml(text)}</span><button class="btn btn-grad btn-sm" data-action="ask-push-yes">Включить</button><button class="icon-btn" data-action="ask-push-no" aria-label="Не сейчас">${icon('close')}</button></div>`);
  setTimeout(() => document.querySelector('.push-ask')?.remove?.(), 15000);
}

function installHtml() {
  if (isStandalone()) return `<div class="account-row">${icon('phone')}<span><b>Приложение установлено</b><small>про.стим открывается с иконки, как обычное приложение</small></span>${icon('check')}</div>`;
  if (installPrompt) return `<button class="plus-row" data-action="install-app"><span class="row-mark">${icon('download')}</span><span><b>Установить приложение</b><small>Иконка на экране, отдельное окно и уведомления</small></span>${icon('chevronRight')}</button>`;
  if (isIos()) return `<div class="install-steps"><b>Как установить на iPhone и iPad</b><ol><li>Открой про.стим в Safari</li><li>Нажми ${icon('upload')} «Поделиться» внизу экрана</li><li>Выбери «На экран „Домой“»</li><li>Открой про.стим с новой иконки и включи уведомления</li></ol></div>`;
  return `<p class="fine">В Chrome, Edge и Яндекс Браузере: значок установки в адресной строке или меню ⋮ → «Установить приложение». На Android — меню ⋮ → «Добавить на главный экран».</p>`;
}

async function installApp() {
  if (!installPrompt) { openInstall(); return; }
  installPrompt.prompt?.();
  const choice = await installPrompt.userChoice?.catch?.(() => null);
  installPrompt = null;
  if (choice?.outcome === 'accepted') toast('про.стим установлен');
  refreshPushViews();
}

function openInstall() {
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Установить про.стим</h2>${installHtml()}</div>`, { kind: 'install' });
}

function openNotifySettings() {
  if (needLogin('Чтобы настроить уведомления, войди в аккаунт') || !me) return;
  const prefs = remote?.account?.notify || {};
  const groups = [['messages', 'inbox', 'Сообщения', 'Новые сообщения в чатах'], ['comments', 'comment', 'Комментарии', 'Комментарии, ответы, ♥ и закрепы'], ['likes', 'up', 'Поддержка и репосты', 'Кто поддержал и поделился'], ['follows', 'user', 'Подписчики', 'Новые подписчики'], ['updates', 'bell', 'Обновления', 'Новые проекты авторов и обновления тех проектов, за которыми следишь']];
  const toggle = (key, iconName, label, hint, on) => `<label class="toggle-row"><input type="checkbox" data-notify="${key}" ${on ? 'checked' : ''}><span>${icon(iconName)}<b>${label}</b><small>${hint}</small></span><i class="toggle" aria-hidden="true"></i></label>`;
  const toggles = groups.map(([key, iconName, label, hint]) => toggle(key, iconName, label, hint, prefs[key] !== false)).join('') + toggle('quiet', 'clock', 'Тихие часы', 'С 23:00 до 8:00 без push — всё дождётся в списке', prefs.quiet === true);
  let device;
  if (!pushSupported()) device = isIos() && !isStandalone() ? `<p class="fine">На iPhone push приходят только из установленного приложения — смотри ниже, как его поставить.</p>` : `<p class="fine">Этот браузер не умеет push-уведомления. Список уведомлений всё равно работает.</p>`;
  else if (Notification.permission === 'denied') device = `<p class="fine">Уведомления запрещены в настройках браузера для этого сайта. Разреши их там и вернись сюда.</p>`;
  else if (pushState.subscribed) device = `<div class="push-device">${icon('check')}<span><b>Включены на этом устройстве</b><small>Всего устройств с уведомлениями: ${remote?.account?.pushDevices || 1}</small></span></div><div class="push-buttons"><button class="btn btn-ghost btn-sm" data-action="push-test">Проверить</button><button class="btn btn-ghost btn-sm" data-action="push-off">Выключить здесь</button></div>`;
  else device = `<button class="btn btn-grad btn-block" data-action="push-on">${icon('bell')} Включить уведомления</button>`;
  showDialog(`<div class="sheet-body notify-settings"><h2 id="modal-title">Уведомления</h2><section class="account-block"><h3>Это устройство</h3>${device}</section><section class="account-block"><h3>Что присылать</h3>${toggles}</section><section class="account-block"><h3>Приложение</h3>${installHtml()}</section></div>`, { kind: 'notify' });
}

async function saveNotifyPref(key, on) {
  if (!remote?.account) return;
  remote.account.notify = { ...(remote.account.notify || {}), [key]: on };
  try { await apiCall('PATCH', '/api/me', { notify: { [key]: on } }); } catch (error) { toast(error.message); }
}

/* Lists the server keeps for me */

const watchingList = () => online ? remote?.watching || [] : [];
const repostedList = () => online ? remote?.reposted || [] : [];
const blockedList = () => online ? remote?.blocked || [] : [];
const PREFS_KEY = 'prostim-feed-prefs-v1';

function feedPrefs() {
  if (online && me) return remote.feedPrefs ||= emptyFeedPrefs();
  if (!localFeedPrefs) {
    try { localFeedPrefs = cleanFeedPrefs(JSON.parse(storage.getItem(PREFS_KEY) || 'null')); } catch { localFeedPrefs = emptyFeedPrefs(); }
  }
  return localFeedPrefs;
}

function visibleInFeed(project) {
  return Boolean(project) && !hiddenLocally.has(project.id) && !blockedList().includes(project.handle) && !hiddenByPrefs(project, feedPrefs());
}

// Posts reposted by people I follow: project id → the first such person.
function repostMap() {
  const map = new Map();
  if (!online) return map;
  for (const project of remote?.projects || []) {
    const by = (project.reposters || []).find(handle => state.follows.includes(handle) && !isMine(handle));
    if (by) map.set(project.id, by);
  }
  return map;
}

/* Project updates and following one project */

function updatesHtml(project) {
  const mine = isMine(project.handle);
  const list = project.updates || [];
  if (!list.length && !(mine && online)) return '';
  const rows = list.slice(0, 12).map(update => `<article class="update">${update.version ? `<span class="update-version">${escapeHtml(update.version)}</span>` : `<span class="update-version dot"></span>`}<div class="update-body"><b>${escapeHtml(update.title)}</b><small>${escapeHtml(timeAgo(update.createdAt) || '')}</small>${update.text ? `<p>${escapeHtml(update.text).replace(/\n/g, '<br>')}</p>` : ''}${uploadUrl(update.image) ? `<img src="${uploadUrl(update.image)}" alt="" loading="lazy">` : ''}</div>${mine && online ? `<button class="icon-btn" data-action="delete-update" data-id="${escapeHtml(project.id)}" data-update="${escapeHtml(update.id)}" aria-label="Удалить обновление">${icon('trash')}</button>` : ''}</article>`).join('');
  const add = mine && online ? `<button class="btn btn-ghost btn-sm" data-action="new-update" data-id="${escapeHtml(project.id)}">${icon('plus')} Обновление</button>` : '';
  return `<section class="updates"><div class="updates-head"><h3 class="sheet-sub">Обновления${list.length ? ` <span>${list.length}</span>` : ''}</h3>${add}</div>${rows || '<p class="fine">Расскажи, что нового: версия, фичи, исправления. Все, кто следит за проектом, получат уведомление.</p>'}</section>`;
}

function cardUpdateHtml(project) {
  const update = project.updates?.[0];
  if (!update || Date.now() - update.createdAt > 14 * 864e5) return '';
  return `<button class="card-update" data-action="open-project" data-id="${escapeHtml(project.id)}">${icon('sparkle')}<span>${update.version ? `<b>${escapeHtml(update.version)}</b> · ` : ''}${escapeHtml(update.title)}</span><small>${escapeHtml(timeAgo(update.createdAt) || '')}</small></button>`;
}

function watchButton(project) {
  if (!online || isMine(project.handle)) return '';
  const on = watchingList().includes(project.id);
  return `<button class="btn btn-ghost watch-btn ${on ? 'on' : ''}" data-action="watch" data-id="${escapeHtml(project.id)}" aria-pressed="${on}">${icon('bell')} ${on ? 'Следишь' : 'Следить'}</button>`;
}

async function toggleWatch(id, button) {
  if (needLogin('Чтобы следить за обновлениями, войди в аккаунт')) return;
  try {
    const result = await apiCall('POST', `/api/projects/${encodeURIComponent(id)}/watch`);
    remote.watching = result.watching ? [...new Set([...(remote.watching || []), id])] : (remote.watching || []).filter(item => item !== id);
    const project = projectById(id);
    if (project) project.watchers = result.watchers;
    toast(result.watching ? 'Пришлём уведомление о каждом обновлении' : 'Больше не следишь за проектом');
    if (result.watching) maybeAskPush('Сообщать об обновлениях проекта?');
    if (dialogContext?.kind === 'project' && dialogContext.id === id) openProject(id);
    else if (dialogContext?.kind === 'post-menu') closeDialog();
    else if (button?.isConnected) button.innerHTML = `${icon('bell')} ${result.watching ? 'Следишь' : 'Следить'}`;
  } catch (error) {
    toast(error.message);
  }
}

function openUpdateForm(id, draft = null) {
  const project = projectById(id);
  if (!project) return;
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Обновление «${escapeHtml(project.title)}»</h2>${draft?.taskId ? `<p class="hub-hint">${icon('sparkle')} Черновик из задачи ИИ: проверь и поправь перед публикацией.</p>` : ''}<form id="update-form" class="form" data-id="${escapeHtml(id)}" data-task="${escapeHtml(draft?.taskId || '')}"><div class="update-fields"><input class="field" name="version" maxlength="24" placeholder="Версия" aria-label="Версия"><input class="field" name="title" maxlength="100" placeholder="Что нового — коротко" aria-label="Что нового" required value="${escapeHtml(draft?.title || '')}"></div><textarea class="field" name="text" rows="7" maxlength="2000" placeholder="Подробнее: новые уровни, исправления, планы" aria-label="Подробнее">${escapeHtml(draft?.text || '')}</textarea><label class="update-image">${icon('image')}<span>Картинка · необязательно</span><input class="file-cover" type="file" accept="image/*" data-update-image></label><p class="form-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">${icon('send')} Опубликовать обновление</button><p class="fine">Уведомление получат все, кто следит за проектом${project.watchers ? ` — сейчас их ${project.watchers}` : ''}.</p></form></div>`, { kind: 'update', id });
}

async function attachUpdateImage(input) {
  const file = input.files?.[0];
  const form = input.closest?.('form');
  const label = input.closest?.('.update-image')?.querySelector?.('span');
  if (!file || !form) return;
  if (label) label.textContent = 'Загружаем…';
  try {
    const blob = file.size > 2 * 1024 * 1024 ? await imageToBlob(file) : file;
    form.dataset.image = await uploadBlob(blob, 'image');
    if (label) label.textContent = `${file.name} ✓`;
  } catch (error) {
    if (label) label.textContent = error.message;
  }
}

async function deleteUpdate(id, updateId) {
  if (!confirm('Удалить это обновление?')) return;
  try {
    replaceProject((await apiCall('DELETE', `/api/projects/${encodeURIComponent(id)}/updates/${encodeURIComponent(updateId)}`)).project);
    openProject(id);
  } catch (error) {
    toast(error.message);
  }
}

/* Menus: a post and a person */

function menuItem(action, iconName, label, extra = '', danger = false) {
  return `<button class="menu-item ${danger ? 'danger' : ''}" data-action="${action}" ${extra}>${icon(iconName)}<span>${label}</span></button>`;
}

function openPostMenu(id) {
  const project = projectById(id);
  if (!project) return;
  const mine = isMine(project.handle);
  const pid = escapeHtml(id);
  const handle = escapeHtml(project.handle);
  const topics = [[`cat:${project.category}`, categoryNames[project.category]], ...visibleTags(project).slice(0, 3).map(tag => [`tag:${tag.toLocaleLowerCase('ru')}`, `#${tag}`])].filter(([, label]) => label);
  const rows = [
    mine ? '' : menuItem('not-interested', 'eyeOff', 'Не интересно', `data-id="${pid}"`),
    ...(mine ? [] : topics.map(([key, label]) => menuItem('pref-set', 'minus', `Меньше про ${escapeHtml(label)}`, `data-key="${escapeHtml(key)}" data-kind="less" data-id="${pid}"`))),
    mine ? '' : menuItem('pref-set', 'eyeOff', `Не показывать посты @${handle}`, `data-key="author:${handle}" data-kind="hidden" data-id="${pid}"`),
    online && !mine ? menuItem('watch', 'bell', watchingList().includes(id) ? 'Не следить за обновлениями' : 'Следить за обновлениями', `data-id="${pid}"`) : '',
    online && !mine ? menuItem('repost', 'repost', repostedList().includes(id) ? 'Убрать репост' : 'Репост к себе', `data-id="${pid}"`) : '',
    menuItem('copy-link', 'link', 'Скопировать ссылку', `data-id="${pid}"`),
    menuItem('feed-prefs', 'gear', 'Настроить ленту'),
    online && !mine ? menuItem('report', 'flag', 'Пожаловаться', `data-kind="project" data-id="${pid}"`, true) : '',
    online && !mine ? menuItem('block', 'ban', blockedList().includes(project.handle) ? `Разблокировать @${handle}` : `Заблокировать @${handle}`, `data-handle="${handle}"`, true) : ''
  ].join('');
  showDialog(`<div class="sheet-body menu-sheet"><div class="menu-head"><span class="menu-art">${scene(project, 0, 'still')}</span><span><b id="modal-title">${escapeHtml(project.title)}</b><small>@${handle}</small></span></div><div class="menu-list">${rows}</div></div>`, { kind: 'post-menu', id });
}

function openUserMenu(handle) {
  const person = userByHandle(handle);
  if (!person) return;
  const safe = escapeHtml(handle);
  const blocked = blockedList().includes(handle);
  const rows = [
    menuItem('pref-set', 'eyeOff', feedPrefs().hidden.includes(`author:${handle}`) ? 'Снова показывать в ленте' : 'Не показывать в ленте', `data-key="author:${safe}" data-kind="${feedPrefs().hidden.includes(`author:${handle}`) ? '' : 'hidden'}"`),
    menuItem('report', 'flag', 'Пожаловаться', `data-kind="user" data-handle="${safe}"`, true),
    menuItem('block', 'ban', blocked ? 'Разблокировать' : 'Заблокировать', `data-handle="${safe}"`, true)
  ].join('');
  showDialog(`<div class="sheet-body menu-sheet"><div class="menu-head">${avatar(person, 'lg')}<span><b id="modal-title">${escapeHtml(person.name)}</b><small>@${safe}</small></span></div><div class="menu-list">${rows}</div></div>`, { kind: 'user-menu', id: handle });
}

/* Your feed: topics, tags and authors to see more of, less of, or never */

const prefLabel = key => {
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const value = key.slice(at + 1);
  return kind === 'cat' ? categoryNames[value] || value : kind === 'author' ? `@${value}` : `#${value}`;
};

function prefTopics() {
  const map = new Map(Object.entries(categoryNames).map(([id, name]) => [`cat:${id}`, name]));
  for (const project of projects()) {
    for (const tag of visibleTags(project)) map.set(`tag:${tag.toLocaleLowerCase('ru')}`, `#${tag}`);
    if (!isMine(project.handle)) map.set(`author:${project.handle}`, `@${project.handle}`);
  }
  return [...map.entries()];
}

function suggestHtml(query) {
  const needle = query.trim().toLocaleLowerCase('ru').replace(/^[#@]/, '');
  const prefs = feedPrefs();
  const list = prefTopics().filter(([, label]) => !needle || label.toLocaleLowerCase('ru').includes(needle)).slice(0, needle ? 10 : 6);
  const names = { more: 'Больше', less: 'Меньше', hidden: 'Скрыть' };
  return list.map(([key, label]) => `<div class="pref-row"><b>${escapeHtml(label)}</b><span class="pref-actions">${Object.entries(names).map(([kind, name]) => {
    const on = prefs[kind].includes(key);
    return `<button class="${kind} ${on ? 'on' : ''}" data-action="pref-set" data-key="${escapeHtml(key)}" data-kind="${on ? '' : kind}" aria-pressed="${on}">${name}</button>`;
  }).join('')}</span></div>`).join('') || '<p class="fine">Такой темы пока нет в ленте</p>';
}

function openFeedPrefs() {
  const prefs = feedPrefs();
  const chip = key => `<span class="pref-chip">${escapeHtml(prefLabel(key))}<button data-action="pref-set" data-key="${escapeHtml(key)}" data-kind="" aria-label="Убрать ${escapeHtml(prefLabel(key))}">${icon('close')}</button></span>`;
  const section = (kind, title, hint) => `<section class="pref-section ${kind}"><h3>${title}</h3>${prefs[kind].length ? `<div class="pref-chips">${prefs[kind].map(chip).join('')}</div>` : `<p class="fine">${hint}</p>`}</section>`;
  const learned = topInterests(currentTaste(), 8);
  const learnedHtml = learned.length ? `<section class="pref-section"><h3>Что лента узнала сама</h3><div class="pref-chips">${learned.map(item => `<span class="pref-chip learned">${escapeHtml(prefLabel(`${item.kind}:${item.value}`))}</span>`).join('')}</div></section>` : '';
  showDialog(`<div class="sheet-body feed-prefs"><h2 id="modal-title">Твоя лента</h2><p class="fine">Лента учится сама по тому, что ты смотришь, — а здесь можно сказать прямо.</p><label class="search-box">${icon('search')}<input data-pref-search value="${escapeHtml(prefQuery)}" placeholder="Тема, #тег или @автор" aria-label="Найти тему" autocomplete="off"></label><div class="pref-suggest" id="pref-suggest">${suggestHtml(prefQuery)}</div>${section('more', 'Показывать больше', 'Нажми «Больше» у темы или автора')}${section('less', 'Показывать меньше', 'Такие посты будут реже')}${section('hidden', 'Не показывать', 'Скрытые темы и авторы не появятся в ленте')}${learnedHtml}<button class="btn btn-ghost btn-block" data-action="reset-taste">${icon('refresh')} Начать ленту с чистого листа</button></div>`, { kind: 'feed-prefs' });
}

async function setPref(key, kind, id = '') {
  if (!key) return;
  const next = withFeedPref(feedPrefs(), key, kind);
  if (online && me) {
    remote.feedPrefs = next;
    try { remote.feedPrefs = cleanFeedPrefs((await apiCall('POST', '/api/me/feed-prefs', next)).feedPrefs); } catch (error) { toast(error.message); }
  } else {
    localFeedPrefs = next;
    try { storage.setItem(PREFS_KEY, JSON.stringify(next)); } catch {}
  }
  const label = prefLabel(key);
  if (kind === 'hidden') dropHiddenFromFeed();
  if (dialogContext?.kind === 'feed-prefs') { openFeedPrefs(); return; }
  if (id && activeView?.id === id && kind) trackSignal(projectById(id), 'hide');
  closeDialog();
  toast(kind === 'hidden' ? `Больше не покажем ${label}` : kind === 'less' ? `Меньше про ${label}` : kind === 'more' ? `Больше про ${label}` : `${label}: как раньше`);
}

function dropHiddenFromFeed() {
  if (feedOrder) feedOrder.entries = feedOrder.entries.filter(entry => !entry.id || visibleInFeed(projectById(entry.id)));
  document.querySelectorAll?.('.feed-item[data-project]').forEach(item => {
    if (!visibleInFeed(projectById(item.dataset.project))) item.remove?.();
  });
}

/* Reports and blocks */

function openReport(kind, id, projectId = '') {
  if (needLogin('Чтобы пожаловаться, войди в аккаунт') || !id) return;
  const what = { project: 'пост', comment: 'комментарий', user: 'пользователя', message: 'сообщение' }[kind] || 'контент';
  const reasons = reportReasons.map(([key, label]) => `<label class="report-reason"><input type="radio" name="reason" value="${key}"><span>${label}</span></label>`).join('');
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Пожаловаться на ${what}</h2><form id="report-form" class="form" data-kind="${escapeHtml(kind)}" data-id="${escapeHtml(id)}" data-project="${escapeHtml(projectId)}"><div class="report-reasons">${reasons}</div><textarea class="field" name="note" rows="3" maxlength="500" placeholder="Подробности · необязательно" aria-label="Подробности"></textarea><p class="form-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">${icon('flag')} Отправить жалобу</button><p class="fine">Автор не узнает, кто пожаловался.${kind === 'project' ? ' Пост сразу пропадёт из твоей ленты.' : kind === 'comment' ? ' Комментарий сразу скроется у тебя.' : ''}</p></form></div>`, { kind: 'report', id });
}

function hideReported(kind, id, projectId) {
  if (kind === 'project') {
    hiddenLocally.add(id);
    dropHiddenFromFeed();
  } else if (kind === 'comment') {
    hiddenLocally.add(`c:${id}`);
    if (projectId) rerenderComments(projectId);
  }
}

async function toggleBlock(handle) {
  if (!handle || needLogin('Чтобы блокировать, войди в аккаунт')) return;
  const blocked = blockedList().includes(handle);
  if (!blocked && !confirm(`Заблокировать @${handle}? Посты и комментарии пропадут у тебя из ленты, а писать и комментировать тебе будет нельзя. Разблокировать можно в профиле или в настройках.`)) return;
  try {
    await apiCall('POST', `/api/users/${encodeURIComponent(handle)}/block`);
    if (modal.open) modal.close();
    dialogContext = null;
    feedOrder = null;
    await reloadAll();
    toast(blocked ? `@${handle} разблокирован` : `@${handle} заблокирован`);
  } catch (error) {
    toast(error.message);
  }
}

/* Sharing: into a chat as a card, to your followers as a repost, or out of the site */

function projectLink(id) {
  const address = new URL(location.href);
  address.search = '';
  address.hash = `/project/${encodeURIComponent(id)}`;
  return address.href;
}

function shareTargets() {
  const list = [];
  const seen = new Set();
  const add = person => {
    if (!person?.handle || seen.has(person.handle) || isMine(person.handle) || person.official || blockedList().includes(person.handle)) return;
    seen.add(person.handle);
    list.push(person);
  };
  for (const thread of threads()) if (!thread.blocked && !thread.blockedMe) add(thread);
  for (const handle of state.follows) add(userByHandle(handle));
  return list.slice(0, 18);
}

function openShare(id) {
  const project = projectById(id);
  if (!project) return;
  if (id.startsWith('local-')) { toast('Проект пока только в твоём браузере'); return; }
  const people = online && me ? shareTargets() : [];
  const safe = escapeHtml(id);
  const peopleHtml = people.length
    ? `<div class="share-people">${people.map(person => `<button class="share-person" data-action="share-to" data-id="${safe}" data-handle="${escapeHtml(person.handle)}">${avatar(person, 'lg')}<span>${escapeHtml(person.name || person.handle)}</span></button>`).join('')}</div>`
    : online && me ? '<p class="fine">Подпишись на авторов или начни переписку — и посты можно будет отправлять прямо в чат.</p>' : '';
  const url = encodeURIComponent(projectLink(id));
  const text = encodeURIComponent(`${project.title} — ${project.summary}`);
  const reposted = repostedList().includes(id);
  const actions = [
    online && me && !isMine(project.handle) ? `<button class="share-action ${reposted ? 'on' : ''}" data-action="repost" data-id="${safe}">${icon('repost')}<span>${reposted ? 'В репостах' : 'Репост'}</span></button>` : '',
    `<button class="share-action" data-action="copy-link" data-id="${safe}">${icon('link')}<span>Ссылка</span></button>`,
    `<a class="share-action tg" href="https://t.me/share/url?url=${url}&amp;text=${text}" target="_blank" rel="noopener noreferrer">${icon('send')}<span>Telegram</span></a>`,
    `<a class="share-action vk" href="https://vk.com/share.php?url=${url}" target="_blank" rel="noopener noreferrer">${icon('users')}<span>VK</span></a>`,
    typeof navigator !== 'undefined' && navigator.share ? `<button class="share-action" data-action="share-native" data-id="${safe}">${icon('share')}<span>Ещё</span></button>` : ''
  ].join('');
  showDialog(`<div class="sheet-body share-sheet"><h2 id="modal-title">Поделиться</h2>${peopleHtml}<div class="share-actions">${actions}</div></div>`, { kind: 'share', id });
}

async function shareTo(id, handle, button) {
  if (!handle || button.classList.contains('sent') || button.classList.contains('sending')) return;
  button.classList.add('sending');
  try {
    remote.threads = (await apiCall('POST', `/api/messages/${encodeURIComponent(handle)}`, { project: id })).threads;
    button.classList.add('sent');
    const label = button.querySelector?.('span');
    if (label) label.textContent = 'Отправлено';
    trackSignal(projectById(id), 'share');
  } catch (error) {
    toast(error.message);
  }
  button.classList.remove('sending');
}

async function toggleRepost(id) {
  if (needLogin('Чтобы репостить, войди в аккаунт')) return;
  try {
    const result = await apiCall('POST', `/api/projects/${encodeURIComponent(id)}/repost`);
    replaceProject(result.project);
    remote.reposted = result.reposted ? [...new Set([...(remote.reposted || []), id])] : (remote.reposted || []).filter(item => item !== id);
    if (result.reposted) trackSignal(projectById(id), 'repost');
    toast(result.reposted ? 'Репост: пост увидят твои подписчики' : 'Репост убран');
    if (dialogContext?.kind === 'share') openShare(id); else closeDialog();
  } catch (error) {
    toast(error.message);
  }
}

/* Feed: the next posts start loading while this one is on screen */

function preloadAhead(item) {
  if (dataSaver) return;
  let next = item?.nextElementSibling;
  for (let step = 0; step < 2 && next; step += 1, next = next.nextElementSibling) {
    next.querySelectorAll?.('img[loading="lazy"]').forEach(image => { image.loading = 'eager'; });
    next.querySelectorAll?.('video[data-feed-video]').forEach(video => { if (video.preload !== 'auto') video.preload = 'auto'; });
    const project = projectById(next.dataset?.project);
    if (!project || typeof Image !== 'function') continue;
    for (const media of projectMedia(project).slice(1, 3)) {
      if (media.type !== 'image') continue;
      const image = new Image();
      image.decoding = 'async';
      image.src = media.url;
    }
  }
}

/* A demo that runs in the browser, inside the post */

function openPlayer(id) {
  const project = projectById(id);
  const url = cleanDemoUrl(project?.demo);
  if (!url) return;
  trackSignal(project, 'play');
  playerOpenedAt = Date.now();
  document.querySelectorAll?.('video[data-feed-video]').forEach(video => video.pause?.());
  const host = new URL(url).hostname.replace(/^www\./, '');
  const steam = (project.links || []).map(linkKind).find(link => link?.kind === 'steam');
  const frame = project.demoBlocked
    ? `<div class="player-blocked">${icon('gamepad')}<b>Сайт демо не разрешает встраивать себя</b><p>Открой его в отдельной вкладке — там всё работает.</p><a class="btn btn-grad" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${icon('external')} Открыть демо</a></div>`
    : `<iframe src="${escapeHtml(url)}" title="Демо: ${escapeHtml(project.title)}" allow="autoplay; fullscreen; gamepad; pointer-lock; accelerometer; gyroscope" allowfullscreen sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-orientation-lock" referrerpolicy="no-referrer"></iframe>`;
  const extra = [
    online && !isMine(project.handle) ? `<button class="btn btn-grad btn-sm" data-action="review-demo" data-id="${escapeHtml(id)}">${icon('star')} ${myReview(project) ? 'Изменить отзыв' : 'Оценить'}</button>` : '',
    steam ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(steam.url)}" target="_blank" rel="noopener noreferrer" data-action="post-link" data-id="${escapeHtml(id)}">${icon('gamepad')} В желаемое Steam</a>` : '',
    online && !isMine(project.handle) ? `<button class="btn btn-ghost btn-sm" data-action="watch" data-id="${escapeHtml(id)}">${icon('bell')} ${watchingList().includes(id) ? 'Следишь' : 'Следить'}</button>` : '',
    `<button class="btn btn-ghost btn-sm" data-action="vote" data-id="${escapeHtml(id)}" aria-pressed="${state.votes.includes(id)}">${icon('up')} Поддержать</button>`
  ].join('');
  showDialog(`<div class="player"><div class="player-bar"><span class="player-title"><b id="modal-title">${escapeHtml(project.title)}</b><small>${escapeHtml(host)}</small></span><button class="icon-btn" data-action="player-full" aria-label="Во весь экран">${icon('monitor')}</button><a class="icon-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть в новой вкладке">${icon('external')}</a></div><div class="player-frame">${frame}</div><div class="player-foot"><span>Понравилось?</span>${extra}</div></div>`, { kind: 'player', id });
}

/* Demo reviews: stars, quick marks and a few words, right after playing */

let playerOpenedAt = 0;
const reviewAsked = new Set();
const REVIEW_AFTER_MS = 15000;
const reviewTagNames = Object.fromEntries([...reviewTags.good, ...reviewTags.bad]);

function myReview(project) {
  return [...projectComments(project)].reverse().find(comment => comment.mine && comment.review) || null;
}

function demoRatingText(project) {
  const rating = project?.demoRating;
  return rating?.count ? String(rating.average.toFixed(1)).replace('.', ',') : '';
}

function starsHtml(stars, className = '') {
  return `<span class="stars ${className}" role="img" aria-label="${stars} из 5">${[1, 2, 3, 4, 5].map(step => icon('star', step <= stars ? 'on' : '')).join('')}</span>`;
}

// Leaving the player after a real try asks for a review once; a player who already rated is not asked.
function reviewDue(id) {
  const project = projectById(id);
  return Boolean(online && me && project?.demo && !isMine(project.handle) && !reviewAsked.has(id) && !myReview(project) && Date.now() - playerOpenedAt >= REVIEW_AFTER_MS);
}

function swapPlayerForReview() {
  if (dialogContext?.kind !== 'player' || !reviewDue(dialogContext.id)) return false;
  openReview(dialogContext.id, true);
  return true;
}

function openReview(id, afterPlay = false) {
  const project = projectById(id);
  if (!project || needLogin('Чтобы оценить демо, войди в аккаунт')) return;
  reviewAsked.add(id);
  const before = myReview(project);
  let stars = before?.review?.stars || 0;
  const picked = new Set(before?.review?.tags || []);
  const chips = (list, group) => `<div class="review-tags ${group}">${list.map(([key, label]) => `<button type="button" class="${picked.has(key) ? 'on' : ''}" aria-pressed="${picked.has(key)}" data-tag="${key}">${label}</button>`).join('')}</div>`;
  showDialog(`<div class="sheet-body review-sheet"><span class="review-orb">${icon('gamepad')}</span><h2 id="modal-title">${afterPlay ? 'Как тебе' : 'Оцени'} «${escapeHtml(project.title)}»?</h2><p class="hub-hint">Автор видит каждый отзыв и может сразу отдать его ИИ в работу. Учтут в обновлении — получишь ${sparkRules.fixed.amount} искр.</p><div class="review-stars" role="radiogroup" aria-label="Оценка">${[1, 2, 3, 4, 5].map(step => `<button type="button" role="radio" aria-checked="${step === stars}" aria-label="${step} из 5" data-star="${step}">${icon('star')}</button>`).join('')}</div><small class="review-word" aria-live="polite"></small><h4 class="review-head">Что понравилось</h4>${chips(reviewTags.good, 'good')}<h4 class="review-head">Что мешало</h4>${chips(reviewTags.bad, 'bad')}<textarea class="field" rows="3" maxlength="1200" placeholder="Где застрял, что добавить, что понравилось больше всего?" aria-label="Отзыв"></textarea><button class="btn btn-grad btn-block review-send" ${stars ? '' : 'disabled'}>${icon('send')} ${before ? 'Обновить отзыв' : 'Отправить отзыв'}</button><button class="text-link review-skip" data-action="close-modal">Не сейчас</button></div>`, { kind: 'review', id });
  const sheet = modal.querySelector('.review-sheet');
  const words = ['', 'Совсем не зашло', 'Так себе', 'Нормально', 'Хорошо', 'Отлично!'];
  const paint = () => {
    sheet.querySelectorAll('.review-stars button').forEach(button => {
      const step = Number(button.dataset.star);
      button.classList.toggle('on', step <= stars);
      button.setAttribute('aria-checked', String(step === stars));
    });
    sheet.querySelector('.review-word').textContent = words[stars];
    sheet.querySelector('.review-send').disabled = !stars;
  };
  paint();
  sheet.querySelectorAll('.review-stars button').forEach(button => button.addEventListener('click', () => { stars = Number(button.dataset.star); haptic(stars >= 4 ? 'tap' : 'select'); paint(); }));
  sheet.querySelectorAll('.review-tags button').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.tag;
    if (picked.has(key)) picked.delete(key); else picked.add(key);
    button.classList.toggle('on', picked.has(key));
    button.setAttribute('aria-pressed', String(picked.has(key)));
  }));
  sheet.querySelector('.review-send').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await apiCall('POST', `/api/projects/${encodeURIComponent(id)}/comments`, { text: sheet.querySelector('textarea').value, review: { stars, tags: [...picked] } });
      replaceProject(result.project);
      toast('Спасибо! Отзыв ушёл автору');
      if (route().section === 'project') openProject(id);
      else closeDialog();
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  });
}

async function checkDemoField(input) {
  const status = input.parentElement?.querySelector?.('.demo-state');
  const value = input.value.trim();
  if (!status) return;
  if (!value) { status.className = 'demo-state'; status.textContent = 'Кнопка «Играть» появится на карточке, игра запустится прямо в посте'; return; }
  const url = cleanDemoUrl(value);
  if (!url) { status.className = 'demo-state bad'; status.textContent = 'Нужна ссылка https:// на веб-версию или код iframe'; return; }
  status.className = 'demo-state';
  status.textContent = 'Проверяем…';
  try {
    const result = await apiCall('POST', '/api/demo-check', { url });
    status.className = `demo-state ${result.embeddable === false ? 'bad' : 'ok'}`;
    status.textContent = result.embeddable === false ? 'Этот сайт запрещает встраивание — откроем демо в новой вкладке' : result.embeddable ? '✓ Запустится прямо в посте' : 'Не получилось проверить — попробуем запустить в посте';
  } catch (error) {
    status.className = 'demo-state bad';
    status.textContent = error.message;
  }
}

/* A post from a link: Steam, itch.io, GitHub, stores and sites */

function fillDraft(form, draft) {
  const fill = (name, value) => {
    const field = form.elements?.[name];
    if (field && !field.value.trim() && value) { field.value = value; if (field.tagName === 'TEXTAREA') autosize(field); }
  };
  fill('title', draft.title);
  fill('summary', draft.summary);
  fill('tags', (draft.tags || []).join(', '));
  if (draft.category) { const radio = form.querySelector?.(`input[name="category"][value="${draft.category}"]`); if (radio) radio.checked = true; }
  const choose = (name, values) => {
    const boxes = [...(form.querySelectorAll?.(`input[name="${name}"]`) || [])];
    if (!values.length || boxes.some(box => box.checked)) return;
    for (const box of boxes) box.checked = values.includes(box.value);
  };
  choose('platforms', draft.platforms || []);
  choose('stage', draft.stage ? [draft.stage] : []);
  choose('pricing', draft.pricing ? [draft.pricing] : []);
  if (postDraft) {
    for (const link of draft.links || []) {
      if (postDraft.links.includes(link)) continue;
      const empty = postDraft.links.indexOf('');
      if (empty >= 0) postDraft.links[empty] = link; else if (postDraft.links.length < POST_LINK_LIMIT) postDraft.links.push(link);
    }
    const rows = modal.querySelector?.('.link-rows');
    if (rows) rows.innerHTML = linkRowsHtml();
    if (!postDraft.blocks.length && draft.page?.length) postDraft.blocks = draft.page.map(block => ({ ...block, ...(block.items ? { items: [...block.items] } : {}) }));
  }
}

async function importLink(button) {
  const form = modal.querySelector?.('#publish-form');
  const input = form?.elements?.importUrl;
  const status = modal.querySelector?.('.import-state');
  const say = text => { if (status) status.textContent = text; };
  const url = normalizeUrl(input?.value || '');
  if (!form || !url) { say('Вставь ссылку, например store.steampowered.com/app/…'); input?.focus?.(); return; }
  button.disabled = true;
  say('Читаем страницу…');
  try {
    const { draft } = await apiCall('POST', '/api/link-preview', { url });
    fillDraft(form, draft);
    const done = `Заполнили по ${draft.source}${draft.ai ? ' · текст помог написать ИИ' : ''}`;
    const images = publishMedia.length ? [] : (draft.images || []).slice(0, 6);
    for (const [index, image] of images.entries()) {
      say(`${done} · забираем картинки: ${index + 1} из ${images.length}…`);
      try {
        const saved = (await apiCall('POST', '/api/uploads/remote', { url: image })).url;
        publishMedia.push({ id: `m${++mediaSeq}`, type: 'image', kind: 'image', url: saved, preview: saved, status: 'done' });
        renderPicker();
      } catch {}
    }
    say(`${done}${publishMedia.length ? ` · картинок: ${publishMedia.length}` : ''}${draft.page?.length ? ' · страница поста' : ''}. Проверь и поправь`);
  } catch (error) {
    say(error.message);
  }
  button.disabled = false;
}

/* Comments: replies, likes, pins, voice and a summary of the thread */

function commentHtml(project, comment, reply = false) {
  const ownProject = isMine(project.handle);
  const person = comment.handle ? userByHandle(comment.handle) : null;
  const name = comment.handle ? `<button class="text-link inline" data-action="profile-card" data-handle="${escapeHtml(comment.handle)}">${escapeHtml(comment.name)}</button>${plusBadge(person)}` : escapeHtml(comment.name);
  const rawFace = ringAvatar({ initials: comment.initials || comment.name.slice(0, 1), color: comment.color || (comment.name === 'Вы' ? '#e5e1d8' : '#cfd9c4'), avatar: comment.avatar }, '', person);
  const face = comment.handle && online ? `<button class="face-btn" data-action="profile-card" data-handle="${escapeHtml(comment.handle)}" aria-label="Карточка ${escapeHtml(comment.name)}">${rawFace}</button>` : rawFace;
  const id = escapeHtml(comment.id || '');
  const pid = escapeHtml(project.id);
  const live = online && Boolean(comment.id);
  const actions = live ? `<div class="comment-actions">${me ? `<button data-action="reply-comment" data-id="${id}" data-project="${pid}" data-name="${escapeHtml(comment.name)}">Ответить</button>` : ''}<button class="comment-more" data-action="comment-menu" data-id="${id}" data-project="${pid}" aria-haspopup="menu" aria-label="Ещё действия с комментарием">${icon('more')}<span>Ещё</span></button></div>` : '';
  const like = live ? `<button class="comment-like ${comment.liked ? 'on' : ''}" data-action="like-comment" data-id="${id}" data-project="${pid}" aria-pressed="${Boolean(comment.liked)}" aria-label="Нравится">${icon('heart')}${comment.likes ? `<b>${comment.likes}</b>` : ''}</button>` : '';
  const help = person?.help?.level >= 2 && !comment.byAuthor ? `<span class="help-title" title="Помощь авторам: ${person.help.points}">${escapeHtml(person.help.title)}</span>` : '';
  const label = comment.label && kindLabels[comment.label]
    ? commentTagHtml(comment.label)
    : ownProject && !comment.mine && kindLabels[comment.kind] ? commentTagHtml(comment.kind, true) : '';
  const helped = !comment.byAuthor && (comment.accepted || comment.tasked || comment.resolved)
    ? `<span class="helped-line">${icon('check')}<b>${comment.label === 'solution' && comment.accepted ? 'Решение помогло' : 'Помог проекту'}</b>${comment.resolved ? '<small>учтено в обновлении</small>' : comment.tasked ? '<small>автор отдал ИИ в работу</small>' : ''}</span>` : '';
  return `<div class="comment ${reply ? 'reply' : ''} ${comment.pinned ? 'pinned' : ''}" data-comment="${id}" data-project="${pid}">${face}<div class="comment-body">${comment.pinned ? `<span class="pin-mark">${icon('pin')} Закреплено автором</span>` : ''}<b>${name}</b>${comment.byAuthor ? '<span class="author-badge">Автор</span>' : ''}${help}${label}<small>${escapeHtml(comment.time || timeAgo(comment.createdAt) || 'сейчас')}</small>${comment.test ? testReportHtml(comment) : comment.text || comment.mention ? `<p>${comment.mention ? `<button class="mention" data-action="profile" data-handle="${escapeHtml(comment.mention)}">@${escapeHtml(comment.mention)}</button> ` : ''}${escapeHtml(comment.text || '')}</p>` : ''}${comment.review ? reviewLineHtml(comment.review) : ''}${comment.voice ? voiceHtml(comment.voice, comment.duration) : ''}${helped}${actions}</div>${like}</div>`;
}

// A tester's report in the thread: the playtest, each step with its mark and note, the words, the screenshots.
function testReportHtml(comment) {
  const test = comment.test;
  const steps = test.results.map((item, index) => `<li class="${item.ok === true ? 'ok' : item.ok === false ? 'bad' : 'skip'}">${icon(item.ok === true ? 'check' : item.ok === false ? 'close' : 'minus')}<span>${index + 1}. ${escapeHtml(item.step)}${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}</span></li>`).join('');
  const shots = (comment.images || []).map(url => uploadUrl(url)).filter(Boolean).map(src => `<button class="bubble-image" data-action="view-chat-image" data-src="${src}" aria-label="Открыть скриншот"><img src="${src}" alt="Скриншот" loading="lazy"></button>`).join('');
  return `<div class="test-report"><span class="test-head">${icon('users')}<span>${escapeHtml(test.title)}</span><b class="ok">${icon('check')}${test.passed}</b>${test.failed ? `<b class="bad">${icon('close')}${test.failed}</b>` : ''}</span><ol>${steps}</ol>${test.note ? `<p>${escapeHtml(test.note)}</p>` : ''}${test.platform ? `<small class="test-where">${icon('monitor')}${escapeHtml(test.platform)}</small>` : ''}${shots ? `<div class="test-shots">${shots}</div>` : ''}</div>`;
}

const kindLabels = Object.fromEntries(commentLabels);
const labelInfo = {
  bug: ['bug', 'Что-то сломано или работает не так'],
  idea: ['bulb', 'Что добавить или поменять'],
  review: ['star', 'Впечатления от игры'],
  question: ['question', 'Нужен ответ автора или игроков'],
  solution: ['check', 'Ответ, который решает проблему']
};

// The type of a comment: a small coloured tag; a guess from the words is shown only to the author, dimmed.
function commentTagHtml(kind, guess = false) {
  return `<span class="ctag ${escapeHtml(kind)} ${guess ? 'guess' : ''}" ${guess ? 'title="Определено по тексту"' : ''}>${icon(labelInfo[kind]?.[0] || 'comment')}${kindLabels[kind] || 'Другое'}</span>`;
}

/* The comment menu: hold a comment (or right-click it, or tap ···) */

let commentMenuHost = null;
let commentMenuAt = 0;
let commentHold = null;
let commentHoldStart = null;

function closeCommentMenu() {
  if (commentMenuHost?.open) commentMenuHost.close();
}

const finePointer = () => Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) && !isPhone();

function openCommentMenu(projectId, commentId, point = null) {
  const project = projectById(projectId);
  const list = project ? projectComments(project) : [];
  const comment = list.find(item => item.id === commentId);
  if (!online || !comment) return;
  const own = isMine(project.handle);
  const root = comment.replyTo ? list.find(item => item.id === comment.replyTo) : null;
  const attrs = `data-id="${escapeHtml(comment.id)}" data-project="${escapeHtml(project.id)}"`;
  const quick = (action, iconName, label, extra = '', on = false) => `<button role="menuitem" class="${on ? 'on' : ''}" data-action="${action}" ${attrs} ${extra}>${icon(iconName)}<span>${label}</span></button>`;
  const row = (action, iconName, label, extra = '', className = '') => `<button role="menuitem" class="${className}" data-action="${action}" ${attrs} ${extra}>${icon(iconName)}<span>${label}</span></button>`;
  const canLabel = me && (comment.mine || own);
  const canAccept = me && !comment.mine && (own || root?.mine);
  const quickRow = [
    me ? quick('reply-comment', 'comment', 'Ответить', `data-name="${escapeHtml(comment.name)}"`) : '',
    me ? quick('like-comment', 'heart', comment.liked ? 'Нравится' : 'Нравится', '', comment.liked) : '',
    comment.text ? quick('copy', 'doc', 'Копировать', `data-copy="${escapeHtml(comment.text)}"`) : '',
    canAccept ? quick('comment-accept', 'check', 'Помогло', '', comment.accepted) : ''
  ].filter(Boolean);
  const current = comment.label || '';
  const typeRow = canLabel ? `<button class="cmenu-type" data-cmenu="kinds">${current ? commentTagHtml(current) : `<span class="ctag none">${icon('tag')}Без типа</span>`}<span>${current ? 'Изменить тип' : comment.mine ? 'Что это: баг, идея, решение…' : 'Указать тип отзыва'}</span>${icon('chevronRight')}</button>` : '';
  const authorRows = own ? [
    !comment.replyTo ? row('pin-comment', 'pin', comment.pinned ? 'Открепить' : 'Закрепить сверху') : '',
    !comment.mine && project.workspaceId ? row('comment-task', 'code', comment.tasked ? 'Ещё задачу ИИ' : 'В задачу ИИ как есть') : '',
    !comment.mine && comment.handle && !comment.test ? row('playtest-invite', 'users', 'Позвать в тестеры', `data-handle="${escapeHtml(comment.handle)}"`) : '',
    !comment.mine ? `<button role="menuitem" class="cmenu-plus" data-action="comment-prompt" ${attrs}>${icon('sparkle')}<span>Промпт с ИИ<small>разберёт отзыв в контексте проекта</small></span><i class="plus-chip">${icon('crown')}Плюс</i></button>` : ''
  ].join('') : '';
  const dangerRows = [
    comment.mine || own ? row('delete-comment', 'trash', 'Удалить', '', 'danger') : '',
    me && !comment.mine && !own ? row('report', 'flag', 'Пожаловаться', 'data-kind="comment"', 'danger') : ''
  ].join('');
  const text = comment.text || (comment.voice ? 'Голосовой комментарий' : comment.review ? `Оценка демо: ${comment.review.stars} из 5` : '');
  const main = `<div class="cmenu-preview"><b>${escapeHtml(comment.name)}</b>${text ? `<p>${escapeHtml(text)}</p>` : ''}</div>${quickRow.length ? `<div class="cmenu-quick" style="--n:${quickRow.length}">${quickRow.join('')}</div>` : ''}${typeRow ? `<div class="cmenu-group">${typeRow}</div>` : ''}${authorRows ? `<div class="cmenu-group"><small class="cmenu-head">Автору проекта</small>${authorRows}</div>` : ''}${dangerRows ? `<div class="cmenu-group">${dangerRows}</div>` : ''}`;
  const kinds = `<div class="cmenu-panel"><div class="cmenu-bar"><button class="icon-btn" data-cmenu="main" aria-label="Назад">${icon('chevronLeft')}</button><b>${comment.mine ? 'Что это за комментарий?' : 'Тип отзыва'}</b><span></span></div><p class="cmenu-note">${comment.mine ? 'Тип увидят все — так автор быстрее найдёт баги и решения.' : 'Поправь, если игрок ошибся: по типу отзывы собираются во вкладке «Отзывы».'}</p>${commentLabels.map(([key, label]) => `<button role="menuitemradio" aria-checked="${current === key}" class="cmenu-kind ${key} ${current === key ? 'on' : ''}" data-action="comment-label" ${attrs} data-label="${key}"><i class="kind-dot">${icon(labelInfo[key][0])}</i><span><b>${label}</b><small>${labelInfo[key][1]}</small></span>${current === key ? icon('check') : ''}</button>`).join('')}${current ? `<button class="cmenu-clear" data-action="comment-label" ${attrs} data-label="">${icon('close')}Убрать тип</button>` : ''}</div>`;
  if (!commentMenuHost) {
    commentMenuHost = document.createElement('dialog');
    commentMenuHost.className = 'cmenu-host';
    commentMenuHost.setAttribute('aria-label', 'Действия с комментарием');
    commentMenuHost.addEventListener('click', event => {
      if (Date.now() - commentMenuAt < 350) return;
      const nav = event.target.closest?.('[data-cmenu]');
      if (nav) { showCommentPanel(nav.dataset.cmenu); return; }
      if (event.target === commentMenuHost || event.target.closest?.('[data-action]')) closeCommentMenu();
    });
    commentMenuHost.addEventListener('close', () => document.querySelectorAll('.comment.held').forEach(item => item.classList.remove('held')));
    document.body.appendChild(commentMenuHost);
  }
  commentMenuHost.panels = { main, kinds };
  commentMenuHost.innerHTML = `<div class="cmenu ${finePointer() ? 'desk' : ''}" role="menu" tabindex="-1" autofocus>${main}</div>`;
  document.querySelectorAll(`.comment[data-comment="${globalThis.CSS?.escape ? CSS.escape(comment.id) : comment.id}"]`).forEach(item => item.classList.add('held'));
  if (!commentMenuHost.open) commentMenuHost.showModal();
  commentMenuAt = Date.now();
  commentMenuHost.point = point;
  placeCommentMenu();
  haptic('heavy');
}

function showCommentPanel(name) {
  const menu = commentMenuHost?.querySelector('.cmenu');
  if (!menu || !commentMenuHost.panels?.[name]) return;
  menu.innerHTML = commentMenuHost.panels[name];
  menu.classList.toggle('sub', name !== 'main');
  placeCommentMenu(true);
}

// A phone shows the menu across the middle near the finger; a mouse gets a context menu at the cursor.
function placeCommentMenu(keep = false) {
  const menu = commentMenuHost?.querySelector('.cmenu');
  if (!menu) return;
  const width = menu.offsetWidth || 280;
  const height = menu.offsetHeight || 320;
  const point = commentMenuHost.point || { x: innerWidth / 2, y: innerHeight / 2 };
  let left;
  let top;
  if (finePointer()) {
    left = point.x + width + 12 <= innerWidth ? point.x : Math.max(12, point.x - width);
    top = point.y + height + 12 <= innerHeight ? point.y : Math.max(12, point.y - height);
    menu.style.transformOrigin = `${left < point.x ? 'right' : 'left'} ${top < point.y ? 'bottom' : 'top'}`;
  } else {
    // Always the same place under the thumb, like a share sheet: nothing to look for.
    menu.classList.add('dock');
    menu.style.left = '';
    menu.style.top = '';
    return;
  }
  if (keep && menu.style.top) top = Math.min(parseFloat(menu.style.top), Math.max(12, innerHeight - height - 12));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

async function labelComment(projectId, id, label) {
  try {
    const result = await apiCall('POST', `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(id)}/label`, { label });
    replaceProject(result.project);
    rerenderComments(projectId);
    rerenderHub(projectId);
    toast(label ? `Помечено: «${kindLabels[label]}»` : 'Пометка снята');
  } catch (error) {
    toast(error.message);
  }
}

// Plus: the AI reads the post, README, files and thread and writes a task; it goes to the folder at once.
async function openCommentPrompt(projectId, commentId) {
  const project = projectById(projectId);
  const comment = project?.comments?.find(item => item.id === commentId);
  if (!project || !comment) return;
  if (!hasPlusNow()) {
    openPaywall('prompt', () => openCommentPrompt(projectId, commentId));
    return;
  }
  if (!project.workspaceId) {
    toast('Сначала свяжи пост с папкой в ИИ-мире: блок проекта → «Код и ИИ»');
    hubTab = 'code';
    rerenderHub(projectId);
    return;
  }
  const workspace = linkedWorkspaceFor(project);
  const text = comment.text || (comment.review ? `Оценка демо: ${comment.review.stars} из 5` : 'Голосовой комментарий');
  const dialog = openLayer(`<div class="crop comment-task prompt-task"><div class="crop-head"><button class="icon-btn" data-action="layer-close" aria-label="Отмена">${icon('close')}</button><b id="layer-title">Промпт с ИИ</b><span class="plus-chip">${icon('crown')} Плюс</span></div><div class="prompt-quote"><b>${escapeHtml(comment.name)}</b><p>${escapeHtml(text)}</p></div><div class="prompt-state"><i class="spin"></i><span>ИИ читает README, файлы проекта и обсуждение…</span></div><textarea class="field" rows="10" maxlength="8000" aria-label="Текст задачи" hidden></textarea><small class="prompt-source"></small><div class="seg" role="radiogroup"><button role="radio" aria-checked="false" data-mode="read">Только план</button><button role="radio" aria-checked="true" class="on" data-mode="edit">Исправить</button></div><button class="btn btn-grad btn-block task-send" disabled>${icon('send')} Отправить и открыть папку</button></div>`, 'comment-task');
  let mode = 'edit';
  dialog.querySelectorAll('.seg button').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    dialog.querySelectorAll('.seg button').forEach(item => { item.classList.toggle('on', item === button); item.setAttribute('aria-checked', String(item === button)); });
  }));
  const field = dialog.querySelector('textarea');
  const state = dialog.querySelector('.prompt-state');
  const send = dialog.querySelector('.task-send');
  try {
    const result = await apiCall('POST', `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/prompt`);
    if (!dialog.open || !dialog.querySelector('.prompt-task')) return;
    field.value = result.prompt;
    field.hidden = false;
    state.remove();
    send.disabled = false;
    const seen = [result.context?.readme ? 'README' : '', result.context?.files ? `${result.context.files} ${plural(result.context.files, 'файл', 'файла', 'файлов')} в корне` : '', result.context?.thread > 1 ? `ветка из ${result.context.thread}` : ''].filter(Boolean).join(' · ');
    dialog.querySelector('.prompt-source').textContent = `${result.source === 'ai' ? 'Написал Claude' : 'Собрано по шаблону — ИИ сейчас недоступен'}${seen ? `. Учтено: ${seen}` : ''}${result.context?.readme || result.context?.files ? '' : '. Компьютер не в сети — README и файлы не прочитаны'}. Текст можно поправить.`;
  } catch (error) {
    state.innerHTML = `${icon('close')}<span>${escapeHtml(error.message)}</span>`;
    return;
  }
  send.addEventListener('click', async () => {
    send.disabled = true;
    try {
      const result = await apiCall('POST', `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/task`, { prompt: field.value, mode });
      replaceProject(result.project);
      closeLayer();
      toast('Задача ушла агенту — открываю папку проекта');
      location.hash = `#/ai/w/${encodeURIComponent(result.workspaceId)}`;
    } catch (error) {
      send.disabled = false;
      toast(error.message);
    }
  });
}

function reviewLineHtml(review) {
  const good = new Set(reviewTags.good.map(([key]) => key));
  return `<span class="review-line">${starsHtml(review.stars)}${(review.tags || []).map(tag => `<i class="${good.has(tag) ? 'good' : 'bad'}">${escapeHtml(reviewTagNames[tag] || tag)}</i>`).join('')}</span>`;
}

function commentsInner(project) {
  const all = projectComments(project).filter(comment => !hiddenLocally.has(`c:${comment.id}`));
  const pid = escapeHtml(project.id);
  const threads = sortComments(all, commentSort);
  const list = threads.length
    ? threads.map(({ comment, replies }) => {
      const open = replies.length <= 2 || openThreads.has(comment.id);
      const shown = open ? replies : replies.slice(0, 1);
      const hidden = replies.length - shown.length;
      return `<div class="thread">${commentHtml(project, comment)}${shown.map(reply => commentHtml(project, reply, true)).join('')}${hidden ? `<button class="thread-more" data-action="thread-open" data-id="${escapeHtml(comment.id)}" data-project="${pid}">${icon('chevronDown')} Ещё ${hidden} ${plural(hidden, 'ответ', 'ответа', 'ответов')}</button>` : ''}</div>`;
    }).join('')
    : `<p class="comments-empty">${icon('comment')} Будь первым</p>`;
  const sorter = threads.length > 1 ? `<div class="comment-sort" role="radiogroup" aria-label="Порядок комментариев">${commentSorts.map(([key, label]) => `<button role="radio" aria-checked="${key === commentSort}" class="${key === commentSort ? 'on' : ''}" data-action="comment-sort" data-sort="${key}" data-id="${pid}">${label}</button>`).join('')}</div>` : '';
  const digest = online && all.length >= 3 ? `<div class="digest" data-digest="${pid}"><button class="digest-btn" data-action="digest" data-id="${pid}">${icon('sparkle')}<span><b>О чём пишут</b><small>Короткий пересказ ${all.length} ${plural(all.length, 'комментария', 'комментариев', 'комментариев')}</small></span>${icon('chevronRight')}</button></div>` : '';
  const replying = replyTarget?.projectId === project.id ? replyTarget : null;
  const voice = online && me && typeof MediaRecorder === 'function' ? `<button type="button" class="cbtn ${hasPlusNow() ? '' : 'locked'}" data-action="voice-rec" data-id="${pid}" aria-label="${hasPlusNow() ? 'Записать голосовой комментарий' : 'Голосовые комментарии — в Плюсе'}">${icon('mic')}${hasPlusNow() ? '' : `<i class="lock-crown">${icon('crown')}</i>`}</button>` : '';
  const placeholder = online && !me ? 'Войди, чтобы комментировать' : replying ? `Ответ ${replying.name}…` : 'Комментарий…';
  return `${digest}${sorter}<div class="comments">${list}</div><form id="comment-form" data-id="${pid}" class="composer sticky comment-composer">${replying ? `<div class="reply-bar">${icon('comment')}<span>Ответ <b>${escapeHtml(replying.name)}</b></span><button type="button" data-action="reply-cancel" aria-label="Отменить ответ">${icon('close')}</button></div>` : ''}<input type="hidden" name="replyTo" value="${escapeHtml(replying?.id || '')}"><input name="text" maxlength="1200" placeholder="${escapeHtml(placeholder)}" aria-label="Комментарий" autocomplete="off">${voice}<button type="submit" aria-label="Отправить">${icon('send')}</button></form>`;
}

function rerenderComments(id) {
  const project = projectById(id);
  const zone = modal.querySelector?.(`.comments-zone[data-comments="${id}"]`);
  if (project && zone) {
    zone.innerHTML = commentsInner(project);
    const count = zone.previousElementSibling?.matches?.('.sheet-sub') ? zone.previousElementSibling.querySelector('span') : null;
    if (count) count.textContent = commentCount(project);
  } else if (dialogContext?.kind === 'project' && dialogContext.id === id) openProject(id);
  else if (dialogContext?.kind === 'comments' && dialogContext.id === id) openComments(id);
}

async function likeComment(projectId, id, button) {
  if (needLogin('Чтобы ставить ♥, войди в аккаунт')) return;
  const comment = projectById(projectId)?.comments?.find(item => item.id === id);
  try {
    const result = await apiCall('POST', `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(id)}/like`);
    if (comment) Object.assign(comment, { liked: result.liked, likes: result.likes });
    if (button?.isConnected) {
      button.classList.toggle('on', result.liked);
      button.setAttribute('aria-pressed', String(result.liked));
      button.innerHTML = `${icon('heart')}${result.likes ? `<b>${result.likes}</b>` : ''}`;
    }
  } catch (error) {
    toast(error.message);
  }
}

async function commentAction(method, projectId, id, path) {
  try {
    const result = await apiCall(method, `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(id)}${path ? `/${path}` : ''}`);
    replaceProject(result.project);
    if (result.bounty === 'paid') { toast('Тестер получил искры и твою награду'); reloadAll({ rerender: false }); }
    else if (result.bounty === 'short') toast('Отчёт принят, но на твою награду не хватило искр');
    refresh();
    rerenderComments(projectId);
    rerenderHub(projectId);
  } catch (error) {
    toast(error.message);
  }
}

async function showDigest(id, button) {
  const host = modal.querySelector?.(`.digest[data-digest="${id}"]`);
  if (!host) return;
  button.disabled = true;
  host.classList.add('loading');
  try {
    const digest = await apiCall('GET', `/api/projects/${encodeURIComponent(id)}/comments/summary`);
    const project = projectById(id);
    const toAi = project && isMine(project.handle) && project.workspaceId ? `<button class="btn btn-ghost btn-sm" data-action="hub-digest-task" data-id="${escapeHtml(id)}">${icon('sparkle')} Разобрать в ИИ-мире</button>` : '';
    host.innerHTML = `<div class="digest-card">${icon('sparkle')}<div><b>О чём пишут${digest.source === 'ai' ? ' <i class="ai-tag">ИИ</i>' : ''}</b><p>${escapeHtml(digest.summary)}</p>${digest.points?.length ? `<ul>${digest.points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}${toAi}</div></div>`;
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
  host.classList.remove('loading');
}

let voiceRec = null;
let voicePlayer = null;

async function startVoice(projectId) {
  if (needLogin('Чтобы оставить голосовой, войди в аккаунт') || voiceRec) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast('Нет доступа к микрофону — разреши его в настройках сайта'); return; }
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(item => MediaRecorder.isTypeSupported?.(item)) || '';
  const recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
  const chunks = [];
  voiceRec = { recorder, chunks, stream, projectId, start: Date.now(), timer: 0, send: false };
  recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
  recorder.onstop = () => finishVoice();
  recorder.start(250);
  const form = modal.querySelector?.('#comment-form');
  form?.classList.add('recording');
  form?.insertAdjacentHTML?.('afterbegin', `<div class="voice-rec"><i class="rec-dot"></i><b class="rec-time">0:00</b><span>Говори — до двух минут</span><button type="button" class="btn btn-ghost btn-sm" data-action="voice-cancel">Отмена</button><button type="button" class="btn btn-grad btn-sm" data-action="voice-stop">${icon('send')} Отправить</button></div>`);
  voiceRec.timer = setInterval(() => {
    if (!voiceRec) return;
    const seconds = Math.floor((Date.now() - voiceRec.start) / 1000);
    const clock = modal.querySelector?.('.rec-time');
    if (clock) clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (seconds >= 120) stopVoice(true);
  }, 250);
}

function stopVoice(send) {
  if (!voiceRec) return;
  voiceRec.send = send;
  clearInterval(voiceRec.timer);
  try { voiceRec.recorder.stop(); } catch { finishVoice(); }
}

async function finishVoice() {
  const record = voiceRec;
  voiceRec = null;
  if (!record) return;
  record.stream.getTracks().forEach(track => track.stop());
  const form = modal.querySelector?.('#comment-form');
  form?.classList.remove('recording');
  form?.querySelector?.('.voice-rec')?.remove?.();
  if (!record.send) return;
  const duration = Math.round((Date.now() - record.start) / 1000);
  if (duration < 1 || !record.chunks.length) { toast('Слишком коротко'); return; }
  const blob = new Blob(record.chunks, { type: (record.recorder.mimeType || 'audio/webm').split(';')[0] });
  try {
    toast('Отправляем голосовое…');
    const url = await uploadBlob(blob, 'audio');
    const replyTo = replyTarget?.projectId === record.projectId ? replyTarget.id : '';
    const { project } = await apiCall('POST', `/api/projects/${encodeURIComponent(record.projectId)}/comments`, { voice: url, duration, replyTo });
    replyTarget = null;
    replaceProject(project);
    trackSignal(project, 'comment');
    refresh();
    rerenderComments(project.id);
    toast('Голосовой комментарий отправлен');
  } catch (error) {
    toast(error.message);
  }
}

function voiceHtml(url, duration = 0) {
  const src = uploadUrl(url);
  if (!src) return '';
  let seed = 0;
  for (const char of src) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const bars = Array.from({ length: 26 }, (_, index) => `<i style="--h:${25 + ((seed >> (index % 24)) + index * 37) % 75}%"></i>`).join('');
  const seconds = Math.max(0, Math.round(Number(duration) || 0));
  return `<button class="voice-note" data-action="play-voice" data-src="${src}" aria-label="Голосовой комментарий, ${seconds} с">${icon('play', 'v-play')}${icon('pause', 'v-pause')}<span class="voice-wave">${bars}</span><small>${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</small></button>`;
}

function playVoice(button) {
  const src = button.dataset.src;
  if (voicePlayer && voicePlayer.dataset?.src === src && !voicePlayer.paused) { voicePlayer.pause(); return; }
  voicePlayer?.pause();
  document.querySelectorAll?.('.voice-note.playing').forEach(item => item.classList.remove('playing'));
  voicePlayer = new Audio(src);
  voicePlayer.dataset.src = src;
  button.classList.add('playing');
  const bars = [...(button.querySelectorAll?.('.voice-wave i') || [])];
  const paint = share => { const lit = Math.round(share * bars.length); bars.forEach((bar, index) => bar.classList.toggle('on', index < lit)); };
  voicePlayer.ontimeupdate = () => paint(voicePlayer.duration && Number.isFinite(voicePlayer.duration) ? voicePlayer.currentTime / voicePlayer.duration : 0);
  voicePlayer.onpause = () => button.classList.remove('playing');
  voicePlayer.onended = () => { button.classList.remove('playing'); paint(0); };
  voicePlayer.play().catch(() => { button.classList.remove('playing'); toast('Не получилось воспроизвести'); });
}

if (typeof window.addEventListener === 'function') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault?.();
    installPrompt = event;
  });
}

async function boot() {
  applyTheme();
  if (isIos() && isStandalone()) document.documentElement?.classList?.add?.('ios-app');
  window.matchMedia?.('(prefers-color-scheme: light)')?.addEventListener?.('change', () => applyTheme());
  if (readSetting(SOUND_KEY, '0') === '1') feedMuted = false;
  if (canReachServer) {
    main.innerHTML = `<div class="boot">${logoLoaderHtml()}</div>`;
    try {
      await loadBootstrap();
      online = true;
    } catch {
      online = false;
    }
  }
  render();
  if (online) connectEvents();
  registerWorker().then(() => checkPush());
  if (online && remote?.account?.onboarding) openOnboarding();
  // Back from Google / Yandex / GitHub: show what went wrong, or greet, and tidy the address.
  const params = typeof URLSearchParams === 'function' ? new URLSearchParams(location.search || '') : null;
  if (params?.has('auth_error')) toast(params.get('auth_error'));
  if (params?.has('payment') && online) checkReturnedPayment(params.get('payment'));
  if (params?.has('auth_error') || params?.has('payment')) history.replaceState?.(null, '', `${location.pathname}${location.hash}`);
}

boot();
