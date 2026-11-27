// One project across the three parts of про.стим: its post in the feed, its code and AI tasks in
// ИИ-мир, and its way to Steam. Shared by the browser and the server.

export const steamStatuses = [
  ['none', 'Без Steam'],
  ['preparing', 'Готовлюсь к Steam'],
  ['applied', 'Заявка у издателя'],
  ['coming', 'Скоро в Steam'],
  ['released', 'Вышла в Steam']
];

export function cleanSteam(value, current = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const status = steamStatuses.some(([key]) => key === source.status) ? source.status : current.status || 'none';
  const checklist = { ...(current.checklist || {}) };
  for (const item of manualSteamItems) if (typeof source.checklist?.[item.id] === 'boolean') checklist[item.id] = source.checklist[item.id];
  const releaseAt = Number(source.releaseAt) > 0 ? Math.round(Number(source.releaseAt)) : source.releaseAt === 0 ? 0 : current.releaseAt || 0;
  return { status, checklist, releaseAt };
}

/* The way to Steam: what the author ticks, what the feed proves and what the repository shows */

export const manualSteamItems = [
  { id: 'build', icon: 'box', title: 'Рабочий билд' },
  { id: 'trailer', icon: 'film', title: 'Трейлер' },
  { id: 'shots', icon: 'image', title: 'Скриншоты' },
  { id: 'text', icon: 'text', title: 'Описание для Steam' },
  { id: 'art', icon: 'grid', title: 'Капсулы и обложки' },
  { id: 'price', icon: 'tag', title: 'Цена и регионы' }
];

// Signals from the feed that a publisher looks at: people who wait for updates, players of the demo,
// people who watch to the end, clicks to the Steam page.
export const feedSteamGoals = [
  { id: 'watchers', icon: 'bell', title: 'Следят за проектом', goal: 10 },
  { id: 'plays', icon: 'play', title: 'Сыграли в демо', goal: 20 },
  { id: 'retention', icon: 'clock', title: 'Досматривают пост', goal: 40, unit: '%' },
  { id: 'wishlists', icon: 'gamepad', title: 'Переходы в Steam', goal: 10 }
];

export const repoSteamItems = [
  { id: 'readme', icon: 'doc', title: 'README в репозитории' },
  { id: 'license', icon: 'shield', title: 'Лицензия' },
  { id: 'screens', icon: 'image', title: 'Папка со скриншотами' },
  { id: 'buildFiles', icon: 'download', title: 'Собранный билд' }
];

const buildPattern = /(^|\/)(build|builds|dist|export|exports|release|releases)(\/|$)|\.(exe|apk|aab|ipa|dmg|pck|x86_64|appimage|zip)$/i;

// What a file list of the project says about its readiness.
export function repoChecks(entries) {
  const files = (Array.isArray(entries) ? entries : []).filter(entry => entry && typeof entry.path === 'string');
  const top = files.filter(entry => !entry.path.includes('/') && !entry.dir).map(entry => entry.path.toLowerCase());
  const pictures = files.filter(entry => !entry.dir && /\.(png|jpe?g|webp|gif)$/i.test(entry.path) && /(screen|shot|скрин|media|press)/i.test(entry.path)).length;
  return {
    readme: top.some(name => name.startsWith('readme')),
    license: top.some(name => name.startsWith('license') || name.startsWith('licence') || name.startsWith('copying')),
    screens: pictures >= 3,
    buildFiles: files.some(entry => buildPattern.test(entry.path)),
    pictures,
    files: files.length
  };
}

export function steamReadiness(project, { watchers = 0, stats = {}, retention = 0, repo = null } = {}) {
  const checklist = project?.steam?.checklist || {};
  const values = { watchers, plays: Number(stats.plays) || 0, retention: Math.round(retention * 100), wishlists: Number(stats.wishlists) || 0 };
  const manual = manualSteamItems.map(item => ({ ...item, kind: 'manual', done: Boolean(checklist[item.id]) }));
  const feed = feedSteamGoals.map(item => ({ ...item, kind: 'feed', value: values[item.id], done: values[item.id] >= item.goal, share: Math.min(1, values[item.id] / item.goal) }));
  const code = repo ? repoSteamItems.map(item => ({ ...item, kind: 'repo', done: Boolean(repo[item.id]) })) : [];
  const all = [...manual, ...feed, ...code];
  const done = all.filter(item => item.done).length;
  return { items: all, done, total: all.length, percent: Math.round(done / Math.max(1, all.length) * 100) };
}

// A publisher notices a game that holds people: enough views, a good interest score and people who
// save it or wait for its updates.
export function publisherShouldNotice(project, quality, { watchers = 0, saves = 0 } = {}) {
  if (!project || project.category !== 'games' || project.publisherNoticed) return false;
  return quality.impressions >= 30 && quality.score >= 0.55 && watchers + saves >= 3;
}

/* Sparks: a small reward for helping authors */

export const sparkRules = {
  accepted: { amount: 20, label: 'Автор принял отчёт' },
  pinned: { amount: 10, label: 'Комментарий закрепили' },
  tasked: { amount: 10, label: 'Отзыв взяли в работу' },
  fixed: { amount: 15, label: 'Отчёт учли в обновлении' }
};
export const sparkPrices = { boostDay: 100, plusWeek: 300 };

/* Drafts between the parts */

const clipText = (text, max) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

export function taskFromComment(project, comment) {
  const who = comment.handle ? `@${comment.handle}` : comment.name || 'Игрок';
  return `Игрок ${who} пишет в комментариях к «${project.title}»:\n«${String(comment.text || '').trim()}»\n\nРазберись, в чём причина, и исправь. Если данных мало — напиши, что уточнить у игрока.`;
}

export function taskFromDigest(project, digest, comments) {
  const quotes = (comments || []).filter(comment => comment.text).slice(-30).map(comment => `— ${clipText(comment.text, 240)}`).join('\n');
  const points = (digest?.points || []).map(point => `• ${point}`).join('\n');
  return `Разбери отзывы игроков о «${project.title}» и составь план правок: сначала баги, потом просьбы.\n\nКратко: ${digest?.summary || ''}\n${points}\n\nКомментарии:\n${quotes}`;
}

// A project update from a finished AI task: its request as the title, its answer and the latest commits as the text.
export function updateFromTask(task, commits = []) {
  const done = [...(task?.events || [])].reverse().find(event => event.kind === 'done');
  const title = clipText(String(task?.prompt || '').split(/[.\n!?]/)[0], 90) || 'Обновление';
  const answer = clipText(done?.text || '', 900);
  const log = (commits || []).slice(0, 6).map(commit => `• ${clipText(commit.subject, 120)}`).join('\n');
  return { title, text: [answer, log ? `Изменения:\n${log}` : ''].filter(Boolean).join('\n\n').slice(0, 2000) };
}

const kindTitles = { bug: 'Баги и проблемы', idea: 'Просьбы и идеи', question: 'Вопросы', praise: 'Что нравится', other: 'Другое' };
const tagNames = { visuals: 'графика', controls: 'управление', sound: 'звук', idea: 'идея', mood: 'атмосфера', bugs: 'баги', hard: 'сложно', unclear: 'непонятно', slow: 'тормозит', short: 'мало контента' };

// Several pieces of feedback as one task: grouped by kind, bugs first, with the stars and marks of demo reviews.
export function taskFromFeedback(project, comments) {
  const order = ['bug', 'idea', 'question', 'praise', 'other'];
  const groups = order.map(kind => {
    const list = (comments || []).filter(comment => (comment.kind || 'other') === kind);
    if (!list.length) return '';
    const lines = list.map((comment, index) => {
      const who = comment.handle ? `@${comment.handle}` : comment.name || 'игрок';
      const review = comment.review ? ` (★${comment.review.stars}${comment.review.tags?.length ? `, ${comment.review.tags.map(tag => tagNames[tag] || tag).join(', ')}` : ''})` : '';
      return `${index + 1}. ${who}${review}: «${clipText(comment.text || 'без текста', 400)}»`;
    }).join('\n');
    return `${kindTitles[kind]}:\n${lines}`;
  }).filter(Boolean).join('\n\n');
  return `Отзывы игроков о «${project.title}» после демо и в комментариях.\n\n${groups}\n\nИсправь баги, оцени просьбы и сделай те, что подходят игре. В конце ответа коротко перечисли, что сделано по каждому пункту, — это станет обновлением для игроков.`;
}

export function demoTaskPrompt(project) {
  return `Собери веб-версию «${project.title}» (HTML5 / WebGL), чтобы в неё можно было играть в браузере с телефона и компьютера, и опубликуй её туда, где проект уже настроен: GitHub Pages, itch.io (butler), Netlify, Vercel или Cloudflare Pages. Если ничего не настроено — опиши по шагам, что нужно сделать. В конце ответа напиши ссылку на играбельную версию отдельной строкой.`;
}

const demoHosts = /https:\/\/(?:[\w-]+\.)*(?:github\.io|itch\.io|itch\.zone|netlify\.app|vercel\.app|pages\.dev|gitlab\.io|surge\.sh|glitch\.me)(?:\/[^\s)<>"'«»]*)?/giu;

// The last link to a known web host in the agent's answer is the new demo.
export function demoUrlFromText(text) {
  const found = String(text || '').match(demoHosts);
  return found ? found[found.length - 1].replace(/[.,;:!]+$/, '') : '';
}
