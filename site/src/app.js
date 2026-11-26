import { demoProjects, demoFiles, initialTopics, steamDocuments, steamSteps, readinessItems, demoThreads, studio, publisherServices, payoutFlow, payoutFacts, roadmap, steamFaq, PUBLISHER_FEE, publisherPerks } from './data.js';
import { icon, logoMark } from './icons.js';
import { STORAGE_KEY, escapeHtml, safeUrl, toggleMembership, loadState, filterProjects } from './state.js';
import { trustLevels } from './trust.js';
import { renderRun, runMeta, isActive, modeNames, modeHints, unifiedDiffHtml } from './timeline.js';
import { emptyTaste, emptyStats, cleanTaste, cleanStats, recordSignal, recordStat, rankFeed, projectQuality, expectedDwell, topInterests, tasteConfidence, statSignals } from './recommend.js';

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
let projectOpenedFromApp = false;
let lastService = 'feed';
let renderedView = '';
let workspacePane = 'assistant';
let openStep = steamSteps[0].id;
let authMode = 'register';
let publishMedia = [];
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
const FEED_ROUNDS = 4;
let localTaste = emptyTaste();
let localStats = {};
let feedOrder = null;
let feedSeed = Math.floor(Math.random() * 1e6);
let pinnedProjectId = '';
let activeView = null;
let feedEvents = [];
let feedFlushTimer;
let tasteSaveTimer;
let feedRefreshing = false;
let pullState = null;
let wheelPull = { amount: 0, armed: false, last: 0, timer: null };
const reasonLabels = { new: ['sparkle', 'Новое'], taste: ['flame', 'Для тебя'], follow: ['users', 'Подписки'], popular: ['up', 'Популярное'], again: ['refresh', 'Снова'], discover: ['search', 'Открытие'], mine: ['user', 'Твой проект'] };
try {
  const savedTaste = JSON.parse(storage.getItem(TASTE_KEY) || '{}');
  localTaste = cleanTaste(savedTaste.taste);
  localStats = Object.fromEntries(Object.entries(savedTaste.stats || {}).map(([id, value]) => [id, cleanStats(value)]));
} catch {}
const ai = { workspaces: [], details: new Map(), trees: new Map(), git: new Map(), errors: new Map(), loading: new Set(), file: null, pair: null, pairAllow: 'edit', pairOs: /Win/.test(globalThis.navigator?.userAgent || '') ? 'win' : 'unix', paired: null, draft: '', mode: 'edit', engine: {}, continueChat: true, expanded: new Set(), treeFilter: '', sending: false };

const photos = {
  forest: 'https://images.squarespace-cdn.com/content/v1/616632df4479e534656ecf49/294a683d-1d98-44ae-8cf9-1ad265169dea/marita-kavelashvili-ugnrXk1129g-unsplash.jpg',
  coast: 'https://images.unsplash.com/photo-1681316152147-e8dffd56404c?fm=jpg&q=80&w=1800'
};
const categoryNames = { games: 'Игры', apps: 'Приложения', tools: 'Инструменты' };
const categoryIcons = { games: 'gamepad', apps: 'grid', tools: 'code' };
const services = [['feed', 'Лента'], ['steam', 'Steam'], ['ai', 'ИИ-мир']];
const sectionTitles = { feed: 'Лента', steam: 'Steam', ai: 'ИИ-мир', search: 'Обзор', inbox: 'Входящие', me: 'Профиль', u: 'Автор' };
const localMe = { handle: 'me', name: 'Вы', author: 'Вы', initials: 'Я', color: '#c4f56f' };
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
  const photo = uploadUrl(person?.avatar);
  return `<span class="avatar ${className} ${photo ? 'photo' : ''}" style="--avatar:${color}">${photo ? `<img src="${photo}" alt="" loading="lazy">` : escapeHtml(person?.initials || (person?.name || 'Я').slice(0, 1))}</span>`;
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
    topbar.innerHTML = `<nav class="services" aria-label="Сервисы">${services.map(([id, label]) => `<a href="#/${id}" class="${id === view ? 'active' : ''}" ${id === view ? 'aria-current="page"' : ''} ${id === 'feed' && view === 'feed' ? 'data-action="home"' : ''}>${label}</a>`).join('')}</nav>`;
  } else {
    const thread = view === 'inbox' && current.page ? threadById(current.page) : null;
    const title = thread ? thread.name : view === 'u' ? `@${current.page}` : view === 'me' && online && !me ? 'Вход' : sectionTitles[view];
    const back = thread || view === 'u';
    topbar.innerHTML = `${back ? `<button class="top-back" data-action="back" aria-label="Назад">${icon('chevronLeft')}</button>` : ''}<span class="top-title">${escapeHtml(title)}</span>`;
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
    : `<a class="dock-item ${active ? 'active' : ''}" href="${href}" ${active ? 'aria-current="page"' : ''} ${id === 'home' ? 'data-action="home"' : ''}>${id === 'me' && me ? avatar(me, 'dock-avatar') : icon(iconName)}<span class="label">${label}</span>${badge ? `<i class="badge" aria-label="Непрочитанных: ${badge}">${badge}</i>` : ''}</a>`).join('')}<div class="dock-foot">${online ? (me ? `@${escapeHtml(me.handle)}` : 'Гость') : 'Локальный режим'} · Молдова</div>`;
}

function afterRender(view, changedPage, current) {
  endView();
  feedObserver?.disconnect();
  feedObserver = null;
  if (view === 'ai') afterAiRender(current, changedPage);
  if (view === 'u' && current.extra === 'reviews') loadReviews(current.page);
  if (view === 'me' && current.page === 'reviews' && me) loadReviews(me.handle);
  if (view !== 'feed') {
    if (changedPage && !(view === 'ai' && current.page === 'w' && !current.more)) window.scrollTo?.(0, view === 'inbox' && route().page ? document.body.scrollHeight || 0 : 0);
    return;
  }
  const feed = document.querySelector('#feed');
  if (!feed) return;
  feed.scrollTop = feedScrollTop;
  feed.addEventListener('scroll', () => { feedScrollTop = feed.scrollTop; }, { passive: true });
  feed.addEventListener('wheel', onFeedWheel, { passive: true });
  if (typeof IntersectionObserver === 'function' && feed.querySelectorAll) {
    feed.classList.add('io');
    feedObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.classList.toggle('in-view', entry.isIntersecting);
        syncFeedVideo(entry.target);
        if (entry.isIntersecting) {
          beginView(entry.target);
          extendFeedNear(entry.target);
        } else if (activeView?.item === entry.target) endView();
      }
    }, { root: feed, threshold: 0.55 });
    observeFeedItems(feed);
  }
}

function observeFeedItems(feed) {
  feed.querySelectorAll('.feed-item:not([data-observed])').forEach(item => {
    item.dataset.observed = '1';
    feedObserver?.observe(item);
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
  if (item.classList.contains('in-view') && !modal.open) video.play?.().catch(() => {}); else video.pause?.();
}

function mediaHtml(item, title, mode) {
  if (item.type === 'video') {
    const poster = uploadUrl(item.poster);
    if (mode === 'still') return poster ? `<div class="scene photo upload"><img src="${poster}" alt="${escapeHtml(title)}" loading="lazy" draggable="false"><span class="play-mark">${icon('play')}</span></div>` : `<div class="scene photo upload"><video src="${item.url}#t=0.5" muted playsinline preload="metadata"></video><span class="play-mark">${icon('play')}</span></div>`;
    if (mode === 'player') return `<div class="scene photo upload player"><video src="${item.url}" ${poster ? `poster="${poster}"` : ''} controls playsinline preload="metadata"></video></div>`;
    return `<div class="scene photo upload video"><video src="${item.url}" ${poster ? `poster="${poster}"` : ''} muted loop playsinline preload="metadata" data-feed-video></video><button class="sound-btn" data-action="toggle-sound" aria-label="${feedMuted ? 'Включить звук' : 'Выключить звук'}">${feedMuted ? '🔇' : '🔊'}</button></div>`;
  }
  return `<div class="scene photo upload"><img src="${item.url}" alt="${escapeHtml(title || 'Скриншот проекта')}" loading="lazy" draggable="false"></div>`;
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
  const kind = slideKinds(project)[slide] || 'cover';
  const type = ['forest', 'coast', 'board', 'analytics'].includes(project.scene) ? project.scene : 'board';
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
  return { taste: currentTaste(), stats: Object.fromEntries(projects().map(project => [project.id, statsFor(project)])), seed, follows: state.follows, me: myHandle(), pinned };
}

function feedPool() {
  const list = filterProjects(projects(), { category: feedCategory });
  return { list: list.length ? list : projects(), empty: !list.length };
}

function buildFeedOrder() {
  const { list, empty } = feedPool();
  const ranked = rankFeed(list, rankOptions(feedSeed, pinnedProjectId));
  feedOrder = { key: feedCategory, rounds: 1, done: false, entries: [...(empty ? [{ sep: 'empty' }] : []), ...ranked.map(item => ({ id: item.project.id, reason: item.reason }))] };
}

// The catalogue is small: after the last post another round starts, with what was just seen pushed back.
function extendFeedNear(item) {
  const feed = document.querySelector('#feed');
  const items = feed?.querySelectorAll?.('.feed-item');
  if (!items?.length || !feedOrder || feedOrder.done) return;
  if (Array.prototype.indexOf.call(items, item) < items.length - 2) return;
  const { list } = feedPool();
  let added;
  if (feedOrder.rounds >= FEED_ROUNDS || !list.length) {
    added = [{ sep: 'final' }];
    feedOrder.done = true;
  } else {
    feedOrder.rounds += 1;
    // Everything already in the feed counts as seen now, even if it is still on screen or just ahead.
    const taste = currentTaste();
    const shown = { ...taste, seen: { ...taste.seen } };
    const now = Date.now();
    feedOrder.entries.forEach(entry => { if (entry.id && !shown.seen[entry.id]) shown.seen[entry.id] = { n: 1, last: now, done: 0 }; });
    added = rankFeed(list, { ...rankOptions(feedSeed + feedOrder.rounds), taste: shown }).map(entry => ({ id: entry.project.id, reason: 'again' }));
    const lastId = [...feedOrder.entries].reverse().find(entry => entry.id)?.id;
    if (added.length > 1 && added[0].id === lastId) [added[0], added[1]] = [added[1], added[0]];
    if (feedOrder.rounds === 2) added.unshift({ sep: 'end' });
  }
  feedOrder.entries.push(...added);
  feed.insertAdjacentHTML?.('beforeend', added.map(feedEntryHtml).join(''));
  observeFeedItems(feed);
}

function feedEndHtml(kind) {
  if (kind === 'empty') return `<section class="feed-item feed-end"><div class="end-card"><span class="end-icon muted">${icon(categoryIcons[feedCategory] || 'search')}</span><h2>Здесь пока пусто</h2><p>Ниже — проекты из других разделов</p><div class="end-actions"><a class="btn btn-ghost" href="#/feed">Вся лента</a><button class="btn btn-primary" data-action="publish">${icon('plus')} Опубликовать</button></div><span class="end-hint">${icon('chevronDown')}</span></div></section>`;
  const final = kind === 'final';
  return `<section class="feed-item feed-end"><div class="end-card"><span class="end-icon">${icon('check')}</span><h2>${final ? 'На сегодня всё' : 'Новое закончилось'}</h2><p>${final ? 'Загляни позже или покажи свой проект' : 'Дальше — лучшее из того, что ты видел'}</p><div class="end-actions"><button class="btn btn-primary" data-action="feed-refresh">${icon('refresh')} Обновить</button><button class="btn btn-ghost" data-action="publish">${icon('plus')} Свой проект</button></div>${final ? '' : `<span class="end-hint">${icon('chevronDown')}</span>`}</div></section>`;
}

function feedEntryHtml(entry) {
  if (entry.sep) return feedEndHtml(entry.sep);
  const project = projectById(entry.id);
  return project ? feedItem(project, entry.reason) : '';
}

function renderFeed() {
  if (!feedOrder || feedOrder.key !== feedCategory) buildFeedOrder();
  const items = feedOrder.entries.map(feedEntryHtml).join('') || `<section class="feed-item">${emptyState('search', 'Здесь пока пусто', `<button class="btn btn-primary" data-action="publish">${icon('plus')} Опубликовать первым</button>`)}</section>`;
  const chip = feedCategory === 'all' ? '' : `<a class="filter-chip" href="#/feed" aria-label="Сбросить фильтр «${categoryNames[feedCategory]}»">${icon(categoryIcons[feedCategory])}${categoryNames[feedCategory]}${icon('close')}</a>`;
  return `<h1 class="sr-only">Лента проектов</h1><div class="ptr" aria-hidden="true"><span>${icon('refresh')}</span></div><div class="feed" id="feed">${items}</div>${chip}<div class="feed-nav"><button data-action="feed-step" data-direction="-1" aria-label="Предыдущий проект">${icon('chevronUp')}</button><button data-action="feed-refresh" aria-label="Обновить ленту">${icon('refresh')}</button><button data-action="feed-step" data-direction="1" aria-label="Следующий проект">${icon('chevronDown')}</button></div>`;
}

function feedItem(project, reason = '') {
  const id = escapeHtml(project.id);
  return `<section class="feed-item" data-project="${id}" aria-label="${escapeHtml(project.title)}"><article class="card"><div class="card-media" data-action="media" data-id="${id}" data-reason="${escapeHtml(reason)}">${mediaInner(project, reason)}</div><div class="rail" data-rail="${id}">${railInner(project)}</div></article></section>`;
}

function reasonChip(reason) {
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
  document.body.classList?.toggle('ptr-ready', distance >= 70);
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
  navigator.vibrate?.(10);
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
    ? `<button class="slide-arrow prev" data-action="slide" data-direction="-1" data-id="${id}" aria-label="Предыдущий слайд" ${slide === 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button><button class="slide-arrow next" data-action="slide" data-direction="1" data-id="${id}" aria-label="Следующий слайд" ${slide === count - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>`
    : '';
  const dots = count > 1 ? `<div class="slide-dots" role="img" aria-label="Слайд ${slide + 1} из ${count}">${Array.from({ length: count }, (_, index) => `<i class="${index === slide ? 'on' : ''}"></i>`).join('')}</div>` : '';
  const author = userByHandle(project.handle);
  return `${scene(project, slide)}<div class="card-shade"></div>${controls}<div class="card-info">${dots}${reasonChip(reason)}<button class="card-author" data-action="profile" data-handle="${escapeHtml(project.handle)}">${isMine(project.handle) ? 'Вы' : `@${escapeHtml(project.handle)}`}${trustBadge(author, true)}<span> · ${escapeHtml(categoryNames[project.category])}</span></button><button class="card-title" data-action="open-project" data-id="${id}">${escapeHtml(project.title)}</button><p class="card-summary">${escapeHtml(project.summary)}</p><div class="card-tags">${(project.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div></div>`;
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
  return `<div class="rail-author"><button class="rail-avatar" data-action="profile" data-handle="${handle}" aria-label="Автор: ${escapeHtml(project.author)}">${avatar(project)}</button>${follow}</div>${railButton('vote', id, 'up', voteCount(project), voted, 'Поддержать', pop === 'vote')}${railButton('comments', id, 'comment', commentCount(project), false, 'Комментарии')}${railButton('save', id, 'bookmark', '', saved, saved ? 'Убрать из сохранённого' : 'Сохранить', pop === 'save')}${railButton('share', id, 'share', '', false, 'Поделиться')}`;
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
  const next = Math.max(0, Math.min(count - 1, current + direction));
  if (next === current) return;
  slides.set(id, next);
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
  if (on) navigator.vibrate?.(8);
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
  const list = filterProjects(projects(), { search });
  return list.length ? thumbsHtml(list) : emptyState('search', 'Ничего не нашли');
}

function followPill(handle, className = '') {
  const followed = state.follows.includes(handle);
  return `<button class="follow-pill ${followed ? 'on' : ''} ${className}" data-action="follow" data-handle="${escapeHtml(handle)}" aria-pressed="${followed}">${followed ? `${icon('check')} Вы подписаны` : 'Подписаться'}</button>`;
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
  return `<div class="page"><h1 class="sr-only">Обзор</h1><label class="search-box">${icon('search')}<input type="search" name="search" placeholder="Игры, приложения, авторы" aria-label="Поиск" value="${escapeHtml(search)}" autocomplete="off"></label><div class="cat-tiles">${tiles}</div><h2 class="row-title">Авторы</h2><div class="creators" id="search-authors">${creatorsHtml()}</div><h2 class="row-title">Проекты</h2><div id="search-results">${searchResults()}</div></div>`;
}

function creatorsHtml() {
  const authors = authorsList();
  if (!authors.length) return `<p class="muted-line">Авторов не нашли</p>`;
  return authors.map(project => `<div class="creator"><button class="creator-link" data-action="profile" data-handle="${escapeHtml(project.handle)}">${avatar(project, 'lg')}<b>${escapeHtml(project.author)}</b>${project.person ? trustBadge(project.person, true) || `<small class="creator-sub">@${escapeHtml(project.handle)}</small>` : ''}</button>${followPill(project.handle, 'small')}</div>`).join('');
}

/* Inbox */

function renderInbox(id) {
  if (online && !me) return `<div class="page narrow">${loginCard('Войди, чтобы переписываться с авторами и получать ответы издателя')}</div>`;
  if (id) {
    const thread = threadById(id);
    if (!thread) return `<div class="page">${emptyState('inbox', 'Чат не найден', '<a class="btn btn-ghost" href="#/inbox">Все чаты</a>')}</div>`;
    const log = thread.all.map(message => `<div class="bubble ${message.from === 'me' ? 'me' : 'them'}">${escapeHtml(message.text)}${message.time ? `<small>${escapeHtml(message.time)}</small>` : ''}</div>`).join('');
    const profile = thread.handle && !thread.official ? `<button class="text-link" data-action="profile" data-handle="${escapeHtml(thread.handle)}">Профиль</button>` : '';
    const composer = thread.official ? '<p class="chat-hint">Это служебный чат: сюда приходят ответы про заявки</p>' : `<div class="chat-composer"><form id="dm-form" class="composer" data-id="${escapeHtml(thread.id)}"><input name="text" placeholder="Сообщение…" aria-label="Сообщение" maxlength="2000" autocomplete="off" required><button type="submit" aria-label="Отправить">${icon('send')}</button></form></div>`;
    return `<div class="page chat-page"><h1 class="sr-only">Чат: ${escapeHtml(thread.name)}</h1><div class="chat-head">${avatar(thread, 'xl')}<b>${escapeHtml(thread.name)}</b>${profile}</div><div class="chat-log">${log || '<p class="chat-hint">Напиши первое сообщение 👋</p>'}</div>${composer}</div>`;
  }
  const list = threads();
  const rows = list.map(thread => {
    const last = thread.all[thread.all.length - 1];
    const unread = threadUnread(thread);
    return `<a class="thread-row ${unread ? 'unread' : ''}" href="#/inbox/${encodeURIComponent(thread.id)}">${avatar(thread, 'lg')}<span class="thread-text"><b>${escapeHtml(thread.name)}${thread.official ? ` <span class="verified">${icon('check')}</span>` : ''}</b><small>${last ? `${last.from === 'me' ? 'Вы: ' : ''}${escapeHtml(last.text)}` : 'Нет сообщений'}</small></span><span class="thread-meta"><small>${escapeHtml(last?.time || '')}</small>${unread ? '<i class="dot-badge" aria-label="Новое"></i>' : ''}</span></a>`;
  }).join('');
  return `<div class="page narrow"><h1 class="sr-only">Входящие</h1><div class="thread-list">${rows || emptyState('inbox', 'Пока нет переписок', '<a class="btn btn-ghost" href="#/search">Найти авторов</a>', 'Напиши автору из его профиля')}</div></div>`;
}

/* Auth */

function authFormHtml(mode) {
  const register = mode === 'register';
  return `<div class="auth-tabs" role="tablist"><button class="${register ? 'on' : ''}" data-action="auth-mode" data-id="register" role="tab" aria-selected="${register}">Регистрация</button><button class="${register ? '' : 'on'}" data-action="auth-mode" data-id="login" role="tab" aria-selected="${!register}">Вход</button></div><form id="auth-form" class="form" data-mode="${mode}">${register ? '<input name="name" maxlength="40" placeholder="Имя" aria-label="Имя" autocomplete="name" required>' : ''}<label class="handle-field"><span>@</span><input name="handle" maxlength="20" placeholder="ник" aria-label="Ник" autocomplete="username" autocapitalize="none" spellcheck="false" pattern="[A-Za-z0-9_]{3,20}" required></label><input name="password" type="password" minlength="6" maxlength="200" placeholder="Пароль" aria-label="Пароль" autocomplete="${register ? 'new-password' : 'current-password'}" required><p class="form-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">${register ? 'Создать аккаунт' : 'Войти'}</button>${register ? '<p class="fine">Ник: латиница, цифры и _. Его видят другие люди.</p>' : ''}</form>`;
}

function loginCard(text) {
  return `<section class="auth-card"><span class="brand-mark big">${logoMark}</span><h2>Войди в про.стим</h2><p class="lead">${escapeHtml(text)}</p>${authFormHtml(authMode)}</section>`;
}

function renderAuthPage() {
  return `<div class="page narrow">${loginCard('Публикуй проекты, получай оценки доверия и подключай свой компьютер к ИИ-миру')}</div>`;
}

function openAuth(mode = 'register', reason = '') {
  authMode = mode;
  showDialog(`<div class="sheet-body"><h2 id="modal-title">${mode === 'register' ? 'Создай аккаунт' : 'Вход'}</h2>${reason ? `<p class="lead">${escapeHtml(reason)}</p>` : ''}${authFormHtml(mode)}</div>`, { kind: 'auth' });
}

/* Profile and reputation */

function personFor(handle) {
  if (online) return userByHandle(handle);
  if (handle === 'me') return localMe;
  const project = projects().find(item => item.handle === handle);
  return project ? { handle, name: project.author, initials: project.initials, color: project.color } : null;
}

function levelHtml(person) {
  if (!online || person.official) return '';
  return `<div class="level" title="Опыт за проекты, поддержки, подписчиков и отзывы"><span>Ур. ${person.level} · ${escapeHtml(person.levelName)}</span><i style="--p:${Math.round(person.levelProgress * 100)}%"></i><small>${person.xp} XP</small></div>`;
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
    ? [[person.projects ?? owned.length, 'проектов'], [person.followers ?? 0, 'подписчиков'], [person.following ?? 0, 'подписок'], [person.ratingCount ? String(person.ratingAverage).replace('.', ',') : '—', 'рейтинг']]
    : mine
      ? [[owned.length, 'проектов'], [state.follows.length, 'подписок'], [state.saved.length, 'сохранено']]
      : [[owned.length, 'проектов'], [owned.reduce((sum, project) => sum + voteCount(project), 0), 'поддержали'], [owned.reduce((sum, project) => sum + commentCount(project), 0), 'комментариев']];
  const actions = mine
    ? `<button class="btn btn-primary btn-sm" data-action="publish">${icon('plus')} Проект</button><button class="btn btn-ghost btn-sm" data-action="application">${icon('gamepad')} Заявка в Steam</button>${online ? `<button class="btn btn-ghost btn-sm btn-square" data-action="edit-profile" aria-label="Изменить профиль">${icon('pen')}</button>` : ''}`
    : `${followPill(handle, 'btn-sm')}${person.official ? '' : `<a class="btn btn-ghost btn-sm" href="#/inbox/${encodeURIComponent(handle)}">${icon('inbox')} Написать</a>`}${online && !person.official ? `<button class="btn btn-ghost btn-sm" data-action="rate" data-handle="${escapeHtml(handle)}">${myRating ? `★ ${myRating.score} · Изменить` : '★ Оценить'}</button>` : ''}`;
  const tabs = mine
    ? [['', 'grid', 'Проекты'], ['saved', 'bookmark', 'Сохранённое'], ['follows', 'users', 'Подписки'], ['applications', 'doc', 'Заявки'], ...(online ? [['reviews', 'comment', 'Отзывы']] : [])]
    : online ? [['', 'grid', 'Проекты'], ['reviews', 'comment', 'Отзывы']] : [];
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
      ? applications.map((application, index) => `<div class="app-row"><span class="doc-icon small">${icon('gamepad')}</span><span><b>${escapeHtml(application.title)}</b><small>${escapeHtml(application.status || application.stage || 'Черновик')}${application.createdAt ? ` · ${timeAgo(application.createdAt)}` : ''}</small></span><button class="icon-btn" data-action="download-application" data-index="${index}" aria-label="Скачать заявку">${icon('download')}</button></div>`).join('')
      : emptyState('gamepad', 'Заявок пока нет', `<button class="btn btn-primary" data-action="application">${icon('send')} Подать заявку</button>`);
  } else if (activeTab === 'reviews') {
    content = reviewsHtml(handle);
  } else {
    content = owned.length ? thumbsHtml(owned) : emptyState('sparkle', mine ? 'Покажи первый проект' : 'Проектов пока нет', mine ? `<button class="btn btn-primary" data-action="publish">${icon('plus')} Опубликовать</button>` : '');
  }
  const base = mine ? '#/me' : `#/u/${encodeURIComponent(handle)}`;
  const tabBar = tabs.length ? `<nav class="ptabs" aria-label="Разделы профиля">${tabs.map(([id, iconName, label]) => `<a href="${base}${id ? `/${id}` : ''}" class="${id === activeTab ? 'active' : ''}" aria-label="${label}" title="${label}" ${id === activeTab ? 'aria-current="page"' : ''}>${icon(iconName)}</a>`).join('')}</nav>` : '<div class="ptabs-line"></div>';
  const badges = `${person.demo ? '<span class="tag">демо-аккаунт</span>' : ''}${trustBadge(person)}`;
  const footer = mine && online ? `<div class="profile-foot"><button class="text-link" data-action="logout">Выйти из аккаунта</button></div>` : '';
  return `<div class="page narrow profile"><div class="profile-head">${avatar(person, 'xxl')}<h1>${escapeHtml(person.name || person.author)}</h1><p class="handle">@${escapeHtml(handle === 'me' ? 'вы' : handle)}</p>${badges ? `<div class="profile-badges">${badges}</div>` : ''}${person.bio ? `<p class="bio">${escapeHtml(person.bio)}</p>` : ''}<div class="stats">${stats.map(([value, label]) => `<span><b>${value}</b>${label}</span>`).join('')}</div>${levelHtml(person)}<div class="profile-actions">${actions}</div></div>${mine ? interestsCardHtml() : ''}${tabBar}<div class="ptab-panel">${content}</div>${footer}</div>`;
}

function openRate(handle) {
  if (needLogin('Чтобы оценивать людей, войди в аккаунт')) return;
  const person = userByHandle(handle);
  if (!person) return;
  const current = remote.myRatings?.[handle];
  const score = current?.score || 0;
  showDialog(`<div class="sheet-body"><div class="rate-head">${avatar(person, 'lg')}<div><h2 id="modal-title">Оценить ${escapeHtml(person.name)}</h2><p class="lead">Насколько можно доверять этому человеку? Оценка видна всем, одна от тебя.</p></div></div><form id="rate-form" class="form" data-handle="${escapeHtml(handle)}"><div class="star-pick" role="radiogroup" aria-label="Оценка">${[5, 4, 3, 2, 1].map(value => `<label><input type="radio" name="score" value="${value}" ${value === score ? 'checked' : ''} required><span aria-label="${value}">★</span></label>`).join('')}</div><textarea name="text" rows="3" maxlength="500" placeholder="Почему такая оценка? Например: помог с билдом, вовремя ответил" aria-label="Отзыв">${escapeHtml(current?.text || '')}</textarea><button class="btn btn-primary btn-block" type="submit">${icon('check')} Сохранить оценку</button>${current ? `<button type="button" class="text-link" data-action="unrate" data-handle="${escapeHtml(handle)}">Убрать мою оценку</button>` : ''}</form></div>`, { kind: 'rate' });
}

function openTrustInfo(handle) {
  const person = userByHandle(handle);
  if (!person) return;
  const level = trustLevels[person.trust] || trustLevels.new;
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Доверие и уровень</h2><div class="trust-explain"><div class="trust-big trust-${escapeHtml(person.trust)}">${person.ratingCount ? `<b>${String(person.ratingAverage).replace('.', ',')}</b>${stars(person.ratingAverage)}` : '<b>—</b>'}<span>${level.label}</span></div><p class="lead">${escapeHtml(level.hint)}.</p></div><ul class="explain-list"><li><b>Рейтинг</b> — средняя оценка от других людей, от 1 до 5. Одна оценка от каждого, себя оценить нельзя.</li><li><b>Статус</b> учитывает число отзывов: одна случайная оценка мало что меняет.</li><li><b>Уровень</b> растёт за проекты, поддержки, подписчиков, комментарии и отзывы. Сейчас ${person.xp} XP, уровень ${person.level}.</li></ul>${!isMine(handle) && !person.official ? `<button class="btn btn-primary btn-block" data-action="rate" data-handle="${escapeHtml(handle)}">★ Оценить</button>` : ''}</div>`);
}

function avatarEditInner() {
  const preview = avatarDraft ? avatarDraft.preview || '' : uploadUrl(me?.avatar);
  return `<span class="avatar xl ${preview ? 'photo' : ''}" style="--avatar:${me?.color || '#c4f56f'}">${preview ? `<img src="${preview}" alt="">` : escapeHtml(me?.initials || 'Я')}</span><div><label class="btn btn-ghost btn-sm">${icon('image')} ${preview ? 'Другое фото' : 'Загрузить фото'}<input type="file" name="avatar-file" accept="image/*" hidden></label>${preview ? `<button type="button" class="text-link" data-action="remove-avatar">Убрать фото</button>` : ''}<p class="fine">Настоящее фото помогает людям доверять тебе.</p></div>`;
}

function openEditProfile() {
  if (!me) return;
  avatarDraft = null;
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Профиль</h2><form id="profile-form" class="form"><div class="avatar-edit">${avatarEditInner()}</div><input name="name" maxlength="40" value="${escapeHtml(me.name)}" placeholder="Имя" aria-label="Имя" required><textarea name="bio" rows="3" maxlength="300" placeholder="О себе: чем занимаешься, что делаешь" aria-label="О себе">${escapeHtml(me.bio || '')}</textarea><button class="btn btn-primary btn-block" type="submit">${icon('check')} Сохранить</button></form></div>`);
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
  return `<section class="perks" aria-label="Почему с нами"><div class="perk-fee"><span class="perk-fee-big">${feePercent}</span><div><b>Доля издателя</b><p>С выплаты Steam за игру — и всё. Удерживаем первыми, остальные 98% твои.</p></div><div class="fee-compare" aria-label="Сравнение доли издателя"><span><i style="width:${PUBLISHER_FEE * 100 * 2}%"></i><b>про.стим</b><small>${feePercent}</small></span><span class="usual"><i style="width:80%"></i><b>У многих издателей</b><small>30–50%</small></span></div></div>${publisherPerks.map(perk => `<div class="perk">${icon(perk.icon)}<b>${perk.title}</b><small>${perk.text}</small></div>`).join('')}</section>`;
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

function steamLinkHtml(className = 'btn btn-glass') {
  const url = safeUrl(studio.steamUrl);
  return url ? `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${icon('external')} ${escapeHtml(studio.name)} в Steam</a>` : '';
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
  if (tab === 'studio') return `<div class="page">${navigation}<h1 class="sr-only">Студия ${escapeHtml(studio.name)}</h1>${renderStudio()}</div>`;
  if (tab === 'documents') {
    return `<div class="page">${navigation}<h1 class="sr-only">Документы Steam</h1><div class="tile-grid">${steamDocuments.map(document => `<button class="doc-tile" data-action="document" data-id="${document.id}"><span class="doc-icon">${icon(document.icon)}</span><span><b>${document.title}</b><small>${document.subtitle}</small></span></button>`).join('')}</div>${faqHtml()}<a class="ext-link" href="https://partner.steamgames.com/doc/home" target="_blank" rel="noopener noreferrer">${icon('external')} Документация Steamworks</a></div>`;
  }
  if (tab === 'discussions') {
    const topics = allTopics();
    return `<div class="page">${navigation}<div class="page-head"><h1 class="sr-only">Обсуждения Steam</h1><span class="muted-count">${topics.length} тем</span><button class="btn btn-primary btn-sm" data-action="new-topic">${icon('plus')} Тема</button></div><div class="topic-list">${topics.map(topic => `<button class="topic-row" data-action="topic" data-id="${escapeHtml(topic.id)}">${avatar({ initials: (topic.author || '?').slice(0, 1), color: topic.color || (topic.author === 'Вы' ? '#c4f56f' : '#b7d5fa'), avatar: topic.avatar })}<span class="topic-text"><small>${topic.pinned ? `${icon('pin')} ` : ''}${escapeHtml(topic.category || 'Общее')} · ${escapeHtml(topic.author || '')}${topic.createdAt ? ` · ${timeAgo(topic.createdAt)}` : ''}</small><b>${escapeHtml(topic.title)}</b></span><span class="topic-count">${icon('comment')}${topicReplies(topic).length}</span></button>`).join('')}</div></div>`;
  }
  const applications = myApplications();
  const mine = applications.length ? `<section class="block my-apps"><h2 class="block-title">Мои заявки</h2>${applications.slice(0, 3).map(application => `<a class="app-row" href="#/me/applications"><span class="doc-icon small">${icon('gamepad')}</span><span><b>${escapeHtml(application.title)}</b><small>${escapeHtml(application.status || 'Черновик')} · ${escapeHtml(application.stage || '')}</small></span>${icon('chevronRight')}</a>`).join('')}</section>` : '';
  return `<div class="page">${navigation}<section class="steam-hero"><div class="hero-art">${scene(demoProjects[0], 0)}</div><span class="hero-fee" aria-hidden="true"><b>${feePercent}</b><small>наша доля</small></span><div class="hero-copy"><span class="hero-kicker">${icon('gamepad')} ${escapeHtml(studio.name)} · паблишинг</span><h1>Выпускаем твою игру <span>в Steam</span></h1><p class="hero-lead">Берём всего <b class="accent-text">${feePercent}</b> с выплаты Steam. Договор, страница, билд, запуск и выплаты — через издателя в Молдове.</p><div class="hero-actions"><button class="btn btn-primary" data-action="application">${icon('send')} Подать заявку</button>${steamLinkHtml()}<a class="btn btn-glass" href="#/steam/studio">Кто мы</a></div></div></section>${perksHtml()}${mine}<section class="block"><h2 class="block-title">Путь игры</h2>${stepsHtml()}</section>${servicesHtml()}${payoutHtml()}<div class="blocks-2">${calculatorHtml()}${readinessHtml()}</div>${studioCardHtml()}${roadmapHtml()}${faqHtml()}</div>`;
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
  const hero = `<section class="ai-hero"><span class="hero-kicker">${icon('sparkle')} ИИ-мир</span><h1>Claude Code и Codex в твоём проекте — с любого устройства</h1><p class="lead">Подключи компьютер один раз, а потом ставь задачи с телефона. Видно, что ИИ думает, какие файлы читает и как их меняет.</p><div class="hero-actions"><a class="btn btn-primary" href="#/ai/connect">${icon('plus')} Подключить компьютер</a><a class="btn btn-ghost" href="#/ai/editor">${icon('folder')} Папка в браузере</a></div></section>`;
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
  return `<form id="task-form" class="task-composer" data-id="${escapeHtml(detail.id)}"><textarea name="task-prompt" rows="1" maxlength="8000" placeholder="Что сделать в проекте?" aria-label="Задача для ИИ" required>${escapeHtml(ai.draft)}</textarea><div class="composer-row"><div class="mode-pick" role="radiogroup" aria-label="Режим">${modes.map(mode => `<label title="${escapeHtml(modeHints[mode])}"><input type="radio" name="task-mode" value="${mode}" ${mode === ai.mode ? 'checked' : ''}><span>${modeNames[mode]}</span></label>`).join('')}</div>${engines.length > 1 ? `<select name="task-engine" aria-label="Движок">${engines.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === engine ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select>` : `<span class="engine-name">${escapeHtml(engines[0]?.label || 'Демо')}</span>`}${hasSession ? `<label class="continue"><input type="checkbox" name="task-continue" ${ai.continueChat ? 'checked' : ''}><span>продолжить диалог</span></label>` : ''}<button class="send" type="submit" aria-label="Отправить задачу" ${ai.sending ? 'disabled' : ''}>${icon('send')}</button></div>${notReady.length && engine === 'demo' ? `<p class="composer-note">${icon('lock')} ${escapeHtml(notReady[0].note)}</p>` : ''}</form>`;
}

function runsHtml(detail) {
  const tasks = detail.tasks || [];
  if (!tasks.length) {
    const suggestions = ['Объясни структуру проекта', 'Найди возможные ошибки', 'Напиши README для проекта', 'Что изменилось в последних коммитах?'];
    return `<div class="runs-empty"><span class="ai-orb">${icon('sparkle')}</span><h2>Что сделаем?</h2><p>Агент выполнит задачу на компьютере «${escapeHtml(detail.device?.name || '')}», а шаги появятся здесь.</p><div class="suggestions">${suggestions.map(text => `<button class="suggestion" data-action="prompt-chip" data-text="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}</div></div>`;
  }
  return tasks.map(task => `<div class="turn"><div class="turn-prompt"><p>${escapeHtml(task.prompt)}</p><small>${task.handle && !isMine(task.handle) ? `@${escapeHtml(task.handle)} · ` : ''}${escapeHtml(modeNames[task.mode] || '')} · ${clockTime(task.createdAt)}</small></div>${renderRun(task, { canCancel: detail.role === 'owner' || isMine(task.handle) })}</div>`).join('');
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
  try {
    const { task } = await apiCall('POST', `/api/workspaces/${encodeURIComponent(id)}/tasks`, { prompt, mode: ai.mode, engine, continue: continueChat });
    if (!detail.tasks.some(item => item.id === task.id)) detail.tasks.push(task);
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
  dialogContext = context;
  modal.dataset.kind = context?.kind || '';
  modal.innerHTML = `<div class="grabber" aria-hidden="true"></div><button class="modal-close" data-action="close-modal" aria-label="Закрыть">${icon('close')}</button>${content}`;
  if (!modal.open) modal.showModal();
}

function closeDialog() {
  connectionVersion += 1;
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
  const comments = projectComments(project);
  const list = comments.length
    ? comments.map(comment => `<div class="comment">${avatar({ initials: comment.initials || comment.name.slice(0, 1), color: comment.color || (comment.name === 'Вы' ? '#c4f56f' : '#cfd9c4') })}<div><b>${comment.handle ? `<button class="text-link inline" data-action="profile" data-handle="${escapeHtml(comment.handle)}">${escapeHtml(comment.name)}</button>` : escapeHtml(comment.name)}</b><small>${escapeHtml(comment.time || timeAgo(comment.createdAt) || 'сейчас')}</small><p>${escapeHtml(comment.text)}</p></div></div>`).join('')
    : `<p class="comments-empty">${icon('comment')} Будь первым</p>`;
  return `<div class="comments">${list}</div><form id="comment-form" data-id="${escapeHtml(project.id)}" class="composer sticky"><input name="text" maxlength="1200" placeholder="${online && !me ? 'Войди, чтобы комментировать' : 'Комментарий…'}" aria-label="Комментарий" autocomplete="off" required><button type="submit" aria-label="Отправить">${icon('send')}</button></form>`;
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

function interestsCardHtml() {
  const taste = currentTaste();
  const top = topInterests(taste, 6);
  const max = top[0]?.weight || 1;
  const label = item => item.kind === 'cat' ? categoryNames[item.value] || item.value : item.kind === 'author' ? `@${item.value}` : `#${item.value}`;
  const iconFor = item => item.kind === 'cat' ? categoryIcons[item.value] || 'grid' : item.kind === 'author' ? 'user' : 'tag';
  const confidence = Math.round(tasteConfidence(taste) * 100);
  const chips = top.length
    ? `<div class="taste-chips">${top.map(item => `<span class="taste-chip" style="--w:${Math.max(0.2, item.weight / max).toFixed(2)}">${icon(iconFor(item))}${escapeHtml(label(item))}</span>`).join('')}</div>`
    : `<p class="taste-empty">Листай ленту — интересы появятся сами</p>`;
  return `<section class="taste-card"><div class="taste-head"><span class="taste-title">${icon('sparkle')} Лента знает тебя</span><span class="taste-level"><i style="width:${confidence}%"></i></span><b>${confidence}%</b>${top.length ? `<button class="icon-btn" data-action="reset-taste" aria-label="Сбросить интересы" title="Сбросить">${icon('refresh')}</button>` : ''}</div>${chips}</section>`;
}

function openProject(id) {
  const project = projectById(id);
  if (!project) return;
  const projectId = escapeHtml(project.id);
  const url = safeUrl(project.url);
  const mine = isMine(project.handle);
  const primary = url
    ? `<a class="btn btn-primary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${icon('external')} Открыть проект</a>`
    : project.id === 'contour' ? `<button class="btn btn-primary" data-action="open-demo">${icon('play')} Попробовать</button>` : '';
  const write = mine ? '' : `<a class="btn btn-ghost" href="#/inbox/${encodeURIComponent(project.handle)}">${icon('inbox')} Написать</a>`;
  const remove = mine && online ? `<button class="btn btn-ghost btn-square" data-action="delete-project" data-id="${projectId}" aria-label="Удалить проект">${icon('close')}</button>` : '';
  const more = project.description && project.description !== project.summary ? `<details class="more"><summary>Подробнее</summary><p>${escapeHtml(project.description)}</p></details>` : '';
  const follow = mine ? '' : followPill(project.handle, 'small');
  const media = projectMedia(project);
  const gallery = media.length > 1 ? `<div class="sheet-gallery">${media.slice(1).map(item => item.type === 'video' ? `<video src="${item.url}" ${uploadUrl(item.poster) ? `poster="${item.poster}"` : ''} controls playsinline preload="metadata"></video>` : `<img src="${item.url}" alt="" loading="lazy">`).join('')}</div>` : '';
  const trailer = safeUrl(project.video) ? `<a class="btn btn-ghost" href="${escapeHtml(safeUrl(project.video))}" target="_blank" rel="noopener noreferrer">${icon('play')} Трейлер</a>` : '';
  document.querySelectorAll?.('video[data-feed-video]').forEach(video => video.pause?.());
  showDialog(`<div class="sheet-media">${scene(project, 0, 'player')}</div><div class="sheet-body"><div class="sheet-author"><button class="author-link" data-action="profile" data-handle="${escapeHtml(project.handle)}">${avatar(project)}<span><b>${escapeHtml(project.author)} ${trustBadge(userByHandle(project.handle), true)}</b><small>${escapeHtml(categoryNames[project.category])}${project.createdAt ? ` · ${timeAgo(project.createdAt)}` : ''}</small></span></button>${follow}</div><h2 id="modal-title">${escapeHtml(project.title)}</h2><p class="lead">${escapeHtml(project.summary)}</p><div class="chips">${(project.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>${interestHtml(project)}${more}${gallery}<div class="sheet-actions">${primary}${trailer}${write}<button class="btn btn-ghost btn-square" data-action="vote" data-id="${projectId}" aria-pressed="${state.votes.includes(project.id)}" aria-label="Поддержать">${icon('up')}</button><button class="btn btn-ghost btn-square" data-action="share" data-id="${projectId}" aria-label="Поделиться">${icon('share')}</button>${mine ? '' : `<button class="btn btn-ghost btn-square" data-action="not-interested" data-id="${projectId}" aria-label="Не интересно" title="Не интересно">${icon('eyeOff')}</button>`}${remove}</div><h3 class="sheet-sub">Комментарии <span>${commentCount(project)}</span></h3>${commentsHtml(project)}</div>`, { kind: 'project', id });
}

function openComments(id) {
  const project = projectById(id);
  if (project) showDialog(`<div class="sheet-body"><h2 id="modal-title" class="sheet-title">Комментарии <span>${commentCount(project)}</span></h2>${commentsHtml(project)}</div>`, { kind: 'comments', id });
}

function chipRadio(name, options, checked) {
  return `<div class="chip-radio">${options.map(([value, label, iconName]) => `<label><input type="radio" name="${name}" value="${escapeHtml(value)}" ${value === checked ? 'checked' : ''}><span>${iconName ? icon(iconName) : ''}${label}</span></label>`).join('')}</div>`;
}

function imagePickerHtml() {
  const items = publishMedia.map((item, index) => `<span class="image-thumb ${index === 0 ? 'cover' : ''}">${item.type === 'video' ? `<video src="${item.preview}" muted playsinline preload="metadata"></video><span class="play-mark small">${icon('play')}</span>` : `<img src="${item.preview}" alt="">`}${index === 0 ? '<em>обложка</em>' : `<button type="button" class="make-cover" data-action="media-cover" data-index="${index}" aria-label="Сделать обложкой">${icon('up')}</button>`}<button type="button" data-action="remove-image" data-index="${index}" aria-label="Убрать">${icon('close')}</button></span>`).join('');
  return `<div class="image-pick">${items}${publishMedia.length < 8 ? `<label class="image-add">${icon('image')}<small>${publishMedia.length ? 'Ещё' : 'Фото и видео'}</small><input type="file" name="images" accept="image/*,video/mp4,video/quicktime,video/webm" multiple></label>` : ''}</div>`;
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
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('no preview')); setTimeout(resolve, 5000); });
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

async function addPublishFiles(fileList) {
  for (const file of Array.from(fileList).slice(0, 8 - publishMedia.length)) {
    try {
      if (file.type.startsWith('video/')) {
        if (file.size > 40 * 1024 * 1024) { toast('Видео больше 40 МБ — сожми его или дай ссылку на YouTube'); continue; }
        publishMedia.push({ type: 'video', blob: file, preview: URL.createObjectURL(file), poster: await videoPoster(file) });
      } else {
        const blob = await imageToBlob(file);
        publishMedia.push({ type: 'image', blob, preview: URL.createObjectURL(blob) });
      }
    } catch (error) {
      toast(error.message);
    }
  }
  const wrap = modal.querySelector?.('.image-pick-wrap');
  if (wrap) wrap.innerHTML = imagePickerHtml();
}

async function uploadBlob(blob) {
  const response = await fetch('/api/uploads', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка загрузки ${response.status}`);
  return data.url;
}

function clearPublishMedia() {
  for (const item of publishMedia) URL.revokeObjectURL(item.preview);
  publishMedia = [];
}

function openPublish() {
  if (needLogin('Чтобы публиковать проекты, войди в аккаунт')) return;
  clearPublishMedia();
  const covers = [['board', 'Интерфейс'], ['analytics', 'Данные'], ['forest', 'Лес'], ['coast', 'Море']];
  showDialog(`<div class="sheet-body"><h2 id="modal-title">Новый проект</h2><form id="publish-form" class="form">${online ? `<div class="image-pick-wrap">${imagePickerHtml()}</div><p class="fine">До 8 фото и видео (видео до 40 МБ) — они станут слайдами, первое — обложка. Без них возьмём рисунок:</p>` : ''}<div class="cover-picker" role="radiogroup" aria-label="Обложка">${covers.map(([value, label], index) => `<label class="cover-opt"><input type="radio" name="scene" value="${value}" ${index === 0 ? 'checked' : ''}><span class="cover-thumb">${scene({ scene: value, slides: 1, category: 'apps', tags: [] }, 0)}</span><small>${label}</small></label>`).join('')}</div><input name="title" maxlength="80" placeholder="Название" aria-label="Название" required><input name="summary" maxlength="160" placeholder="Коротко: что это и для кого" aria-label="Короткое описание" required>${chipRadio('category', Object.entries(categoryNames).map(([id, label]) => [id, label, categoryIcons[id]]), 'apps')}<input name="url" type="url" placeholder="Ссылка · необязательно" aria-label="Ссылка на проект">${online ? '<input name="video" type="url" placeholder="Трейлер на YouTube, VK или Steam · необязательно" aria-label="Ссылка на трейлер">' : ''}<input name="tags" maxlength="120" placeholder="Теги через запятую: Web, Прототип" aria-label="Теги"><details class="more"><summary>Описание</summary><textarea name="description" rows="3" maxlength="2400" placeholder="Идея и текущий этап" aria-label="Подробное описание"></textarea></details><p class="form-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">${icon('send')} Опубликовать</button></form></div>`, { kind: 'publish' });
}

function openApplication() {
  if (needLogin('Чтобы подать заявку издателю, войди в аккаунт')) return;
  showDialog(`<div class="sheet-body"><span class="hero-icon steam">${icon('gamepad')}</span><h2 id="modal-title">Заявка в Steam</h2><form id="application-form" class="form"><input name="title" required maxlength="100" placeholder="Название игры" aria-label="Название игры">${chipRadio('stage', [['Прототип', 'Прототип'], ['Демо', 'Демо'], ['Готова к релизу', 'Релиз']], 'Демо')}<input name="url" type="url" placeholder="Ссылка на демо или трейлер" aria-label="Ссылка на демонстрацию"><textarea name="description" required rows="3" maxlength="2400" placeholder="Какая помощь нужна?" aria-label="Какая помощь нужна"></textarea><input name="contact" required placeholder="Email или Telegram" maxlength="120" aria-label="Контакт"><button class="btn btn-primary btn-block" type="submit">${icon(online ? 'send' : 'check')} ${online ? 'Отправить заявку' : 'Сохранить черновик'}</button></form></div>`);
}

function openTopic(id) {
  const topic = allTopics().find(item => item.id === id);
  if (!topic) return;
  const replies = topicReplies(topic);
  const list = replies.length
    ? replies.map(reply => `<div class="comment">${avatar({ initials: reply.initials || reply.name.slice(0, 1), color: reply.color || (reply.name === 'Вы' ? '#c4f56f' : '#b7d5fa') })}<div><b>${reply.handle ? `<button class="text-link inline" data-action="profile" data-handle="${escapeHtml(reply.handle)}">${escapeHtml(reply.name)}</button>` : escapeHtml(reply.name)}</b>${reply.createdAt ? `<small>${timeAgo(reply.createdAt)}</small>` : ''}<p>${escapeHtml(reply.text)}</p></div></div>`).join('')
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
  const element = form.querySelector?.('.form-error');
  if (element) element.textContent = message; else toast(message);
}

/* Events */

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (action === 'close-modal') closeDialog();
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
  else if (action === 'media') {
    const now = Date.now();
    clearTimeout(tapTimer);
    if (lastTap.id === id && now - lastTap.time < 300) {
      lastTap = { time: 0, id: '' };
      if (!online || me) burst(target, event);
      toggleProjectFlag('vote', id, { onlyOn: true });
      navigator.vibrate?.(12);
    } else {
      lastTap = { time: now, id };
      tapTimer = setTimeout(() => navigateToProject(id), 300);
    }
  } else if (action === 'comments') openComments(id);
  else if (action === 'share') await shareProject(id);
  else if (action === 'vote' || action === 'save') {
    await toggleProjectFlag(action, id);
    if (target.closest?.('dialog') && action === 'vote') target.setAttribute('aria-pressed', String(state.votes.includes(id)));
  } else if (action === 'follow') toggleFollow(target.dataset.handle, target);
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
  } else if (action === 'application') openApplication();
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
    if (target.closest?.('dialog')) openAuth(id); else render();
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
  else if (action === 'delete-project') {
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
  } else if (action === 'remove-image') {
    const [removed] = publishMedia.splice(Number(target.dataset.index), 1);
    if (removed) URL.revokeObjectURL(removed.preview);
    const wrap = modal.querySelector?.('.image-pick-wrap');
    if (wrap) wrap.innerHTML = imagePickerHtml();
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
    const register = form.dataset.mode === 'register';
    if (submit) submit.disabled = true;
    try {
      await apiCall('POST', register ? '/api/auth/register' : '/api/auth/login', { name: value('name'), handle: value('handle').replace(/^@/, ''), password: String(data.get('password') || '') });
      await reloadAll({ rerender: false });
      if (modal.open && dialogContext?.kind === 'auth') { modal.close(); dialogContext = null; }
      render();
      window.scrollTo?.(0, 0);
      toast(register ? `Добро пожаловать, ${me?.name || ''}!` : 'С возвращением!');
    } catch (error) {
      formError(form, error.message);
      if (submit) submit.disabled = false;
    }
    return;
  }
  if (form.id === 'publish-form') {
    if (!value('title') || !value('summary')) return;
    const tags = value('tags').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 5);
    const fields = { title: value('title'), summary: value('summary'), description: value('description'), category: data.get('category') || 'apps', url: safeUrl(value('url')), scene: data.get('scene') || 'board', tags };
    if (online) {
      if (submit) { submit.disabled = true; submit.textContent = 'Публикуем…'; }
      try {
        const media = [];
        for (const [index, item] of publishMedia.entries()) {
          if (submit) submit.textContent = `Загружаем ${index + 1} из ${publishMedia.length}…`;
          const url = item.url || (item.url = await uploadBlob(item.blob));
          const poster = item.type === 'video' && item.poster ? item.posterUrl || (item.posterUrl = await uploadBlob(item.poster)) : '';
          media.push({ url, ...(poster ? { poster } : {}) });
        }
        if (submit) submit.textContent = 'Публикуем…';
        const { project } = await apiCall('POST', '/api/projects', { ...fields, media, video: value('video') });
        remote.projects.unshift(project);
        pinnedProjectId = project.id;
      } catch (error) {
        formError(form, error.message);
        if (submit) { submit.disabled = false; submit.textContent = 'Опубликовать'; }
        return;
      }
    } else {
      state.projects.unshift({ id: newId('local'), ...fields, tags: tags.length ? tags : ['Новый проект'], author: 'Вы', initials: 'Я', handle: 'me', color: '#c4f56f', votes: 0, createdAt: Date.now(), slides: 1, comments: [] });
      pinnedProjectId = state.projects[0].id;
      persist();
    }
    clearPublishMedia();
    feedCategory = 'all';
    feedOrder = null;
    feedScrollTop = 0;
    go('#/feed');
    render();
    toast('Опубликовано ✓');
  } else if (form.id === 'comment-form') {
    if (!value('text')) return;
    if (needLogin('Чтобы комментировать, войди в аккаунт')) return;
    const id = form.dataset.id;
    if (online) {
      try {
        const { project } = await apiCall('POST', `/api/projects/${encodeURIComponent(id)}/comments`, { text: value('text') });
        replaceProject(project);
      } catch (error) { toast(error.message); return; }
    } else {
      state.comments[id] ||= [];
      state.comments[id].push({ name: 'Вы', text: value('text'), time: 'сейчас' });
      persist();
    }
    trackSignal(projectById(id), 'comment');
    refresh();
    if (dialogContext?.kind === 'project') openProject(id); else openComments(id);
    const list = modal.querySelector?.('.comments');
    list?.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
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
    const id = form.dataset.id;
    if (online) {
      try { remote.threads = (await apiCall('POST', `/api/messages/${encodeURIComponent(id)}`, { text: value('text') })).threads; } catch (error) { toast(error.message); return; }
    } else {
      state.dms[id] ||= [];
      state.dms[id].push({ text: value('text'), time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) });
      persist();
    }
    render();
    window.scrollTo?.(0, document.body.scrollHeight || 0);
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
  const target = event.target;
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
  const target = event.target;
  if (target.name === 'pair-allow') { ai.pairAllow = target.value; renderKeepingInput(); }
  else if (target.name === 'pair-os') { ai.pairOs = target.value; renderKeepingInput(); }
  else if (target.name === 'task-mode') ai.mode = target.value;
  else if (target.name === 'task-engine') { ai.engine[route().extra] = target.value; renderKeepingInput(); }
  else if (target.name === 'task-continue') ai.continueChat = target.checked;
  else if (target.name === 'images' && target.files) await addPublishFiles(target.files);
  else if (target.name === 'avatar-file' && target.files?.[0]) {
    try {
      const blob = await imageToBlob(target.files[0], 400, true);
      avatarDraft = { blob, preview: URL.createObjectURL(blob) };
      const holder = modal.querySelector?.('.avatar-edit');
      if (holder) holder.innerHTML = avatarEditInner();
    } catch (error) { toast(error.message); }
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
function stopSwipeClick(event) { event.preventDefault(); event.stopPropagation(); }

document.addEventListener('keydown', event => {
  const target = event.target;
  if ((target?.id === 'prompt' || target?.name === 'task-prompt') && event.key === 'Enter' && !event.shiftKey && !event.isComposing && !isCompact()) {
    event.preventDefault();
    target.form?.requestSubmit?.();
    return;
  }
  if (modal.open || document.body.dataset.view !== 'feed') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) return;
  if (['ArrowDown', 'PageDown', 'j'].includes(event.key)) { event.preventDefault(); stepFeed(1); }
  else if (['ArrowUp', 'PageUp', 'k'].includes(event.key)) { event.preventDefault(); stepFeed(-1); }
  else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') changeSlide(currentFeedId(), event.key === 'ArrowRight' ? 1 : -1);
});

/* Sheets close with a swipe down (touch) or a pull down at the top (trackpad) */

const SHEET_CLOSE_DISTANCE = 120;
let sheetDrag = null;
const sheetWheel = { amount: 0, last: 0, armed: false, timer: 0 };
let feedWheelMuteUntil = 0;

// The rest of a trackpad swipe that closed a sheet must not scroll or refresh the feed underneath.
function muteFeedWheel(ms) {
  feedWheelMuteUntil = Date.now() + ms;
  document.body.classList.add('wheel-mute');
  setTimeout(() => { if (Date.now() >= feedWheelMuteUntil) document.body.classList.remove('wheel-mute'); }, ms);
}

function sheetHasDraft() {
  return Array.from(modal.querySelectorAll?.('input, textarea') || []).some(field => !['radio', 'checkbox', 'hidden', 'file'].includes(field.type) && field.value.trim() && field.value !== field.defaultValue);
}

function setSheetOffset(offset, animate = false) {
  modal.style.transition = animate ? 'transform .24s var(--ease)' : 'none';
  modal.style.transform = offset ? `translateY(${offset}px)` : '';
  modal.style.setProperty('--sheet-fade', String(Math.max(0, 1 - offset / 500)));
}

function resetSheet() {
  clearTimeout(sheetWheel.timer);
  sheetDrag = null;
  sheetWheel.amount = 0;
  modal.classList.remove('sheet-closing');
  modal.style.transition = '';
  modal.style.transform = '';
  modal.style.removeProperty('--sheet-fade');
}

function releaseSheet(distance, fast = false) {
  if (distance > SHEET_CLOSE_DISTANCE || (fast && distance > 30)) {
    if (sheetHasDraft()) { setSheetOffset(0, true); toast('Сначала отправь или сотри текст'); return; }
    modal.classList.add('sheet-closing');
    muteFeedWheel(1000);
    setSheetOffset(innerHeight, true);
    setTimeout(() => { if (modal.classList.contains('sheet-closing')) closeDialog(); resetSheet(); }, 220);
  } else setSheetOffset(0, true);
}

const sheetDragExcluded = 'input, textarea, select, [contenteditable="true"], .workspace';
modal.addEventListener('touchstart', event => {
  const touch = event.touches[0];
  sheetDrag = event.touches.length === 1 && !modal.classList.contains('sheet-closing') && !event.target.closest?.(sheetDragExcluded)
    ? { x: touch.clientX, y: touch.clientY, lastY: touch.clientY, lastTime: event.timeStamp, distance: 0, speed: 0, active: false }
    : null;
}, { passive: true });
modal.addEventListener('touchmove', event => {
  if (!sheetDrag) return;
  if (event.touches.length !== 1) { if (sheetDrag.active) setSheetOffset(0, true); sheetDrag = null; return; }
  const touch = event.touches[0];
  if (!sheetDrag.active) {
    const down = touch.clientY - sheetDrag.y;
    const side = Math.abs(touch.clientX - sheetDrag.x);
    if (modal.scrollTop > 0 || down <= 0) { sheetDrag.x = touch.clientX; sheetDrag.y = touch.clientY; return; }
    if (side > down) { sheetDrag = null; return; }
    if (down < 8) return;
    sheetDrag.active = true;
    sheetDrag.y = touch.clientY;
  }
  if (event.cancelable) event.preventDefault();
  const elapsed = Math.max(1, event.timeStamp - sheetDrag.lastTime);
  sheetDrag.speed = (touch.clientY - sheetDrag.lastY) / elapsed;
  sheetDrag.lastY = touch.clientY;
  sheetDrag.lastTime = event.timeStamp;
  sheetDrag.distance = Math.max(0, touch.clientY - sheetDrag.y);
  setSheetOffset(sheetDrag.distance);
}, { passive: false });
modal.addEventListener('touchend', () => {
  const drag = sheetDrag;
  sheetDrag = null;
  if (drag?.active) releaseSheet(drag.distance, drag.speed > 0.6);
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

modal.addEventListener('click', event => { if (event.target === modal) closeDialog(); });
modal.addEventListener('close', () => {
  resetSheet();
  modal.querySelectorAll?.('video').forEach(video => video.pause?.());
  document.querySelectorAll?.('.feed-item.in-view').forEach(syncFeedVideo);
});
modal.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
window.addEventListener('hashchange', () => {
  connectionVersion += 1;
  if (modal.open) modal.close();
  dialogContext = null;
  render(false);
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

async function boot() {
  if (canReachServer) {
    main.innerHTML = `<div class="boot"><span class="brand-mark big">${logoMark}</span></div>`;
    try {
      await loadBootstrap();
      online = true;
    } catch {
      online = false;
    }
  }
  render();
  if (online) connectEvents();
}

boot();
