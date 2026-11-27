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
  { id: 'wishlists', icon: 'gamepad', title: 'Переходы в Steam', goal: 10 },
  { id: 'reports', icon: 'check', title: 'Отчёты тестеров', goal: 5 }
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

export function steamReadiness(project, { watchers = 0, stats = {}, retention = 0, repo = null, reports = 0 } = {}) {
  const checklist = project?.steam?.checklist || {};
  const values = { watchers, plays: Number(stats.plays) || 0, retention: Math.round(retention * 100), wishlists: Number(stats.wishlists) || 0, reports: Number(reports) || 0 };
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
  accepted: { amount: 20, label: 'Автор принял отчёт', hint: 'Автор отметил твой отчёт или комментарий: «Помогло»' },
  tasked: { amount: 10, label: 'Отзыв взяли в работу', hint: 'Автор отдал твой отзыв ИИ-агенту' },
  fixed: { amount: 15, label: 'Отчёт учли в обновлении', hint: 'Исправление вышло в обновлении проекта' },
  pinned: { amount: 10, label: 'Комментарий закрепили', hint: 'Автор закрепил твой комментарий сверху' }
};
export const sparkPrices = { boostDay: 100, plusWeek: 300 };

/* Playtests: the author hands players a task, a build, a prompt and, if wanted, the project folder in
   ИИ-мир; the players send back a report step by step. One open playtest per project. */

export const playtestAccess = [
  ['none', 'Только билд', 'Тестер получает ссылку, шаги и промпт'],
  ['view', 'Смотреть папку', 'Видит задачи ИИ и файлы проекта в ИИ-мире'],
  ['run', 'Ставить задачи ИИ', 'Может сам запускать промпт в папке проекта']
];
export const PLAYTEST_STEPS = 10;
export const PLAYTEST_SLOTS = 50;
// Places for testers: 10 without Plus, 50 with it.
export const playtestSlots = { free: 10, plus: PLAYTEST_SLOTS };
// Sparks the author adds from their own balance to each accepted report, on top of the usual reward.
export const playtestBounties = [0, 10, 25, 50];

const playtestLine = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const playtestBlock = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

// What the author writes; `link` makes a web address safe or empty (the server and the browser pass their own).
export function cleanPlaytest(value, current = {}, link = url => url) {
  const source = value && typeof value === 'object' ? value : {};
  const steps = (Array.isArray(source.steps) ? source.steps : String(source.steps ?? '').split('\n'))
    .map(step => playtestLine(step, 200).replace(/^(\d+[.)]|[-•*])\s*/, '')).filter(Boolean).slice(0, PLAYTEST_STEPS);
  const access = playtestAccess.some(([key]) => key === source.access) ? source.access : 'none';
  return {
    title: playtestLine(source.title, 100),
    steps,
    build: link(playtestLine(source.build, 500)) || '',
    platform: playtestLine(source.platform, 60),
    version: playtestLine(source.version, 24),
    notes: playtestBlock(source.notes, 1000),
    prompt: playtestBlock(source.prompt, 2000),
    access,
    slots: Math.max(1, Math.min(PLAYTEST_SLOTS, Math.round(Number(source.slots) || current.slots || 10))),
    bounty: playtestBounties.includes(Number(source.bounty)) ? Number(source.bounty) : 0
  };
}

// A tester's report: each step passed, failed or skipped, with a note.
export function cleanTestResults(value, steps) {
  const list = Array.isArray(value) ? value : [];
  return steps.map((step, index) => {
    const item = list[index] && typeof list[index] === 'object' ? list[index] : {};
    return { step, ok: item.ok === true ? true : item.ok === false ? false : null, note: playtestLine(item.note, 300) };
  });
}

export function testTally(results) {
  return { passed: results.filter(item => item.ok === true).length, failed: results.filter(item => item.ok === false).length, total: results.length };
}

// The report as a comment: readable for people and complete for an AI task made from it.
export function testReportText(playtest, results, text = '', env = {}) {
  const { passed, failed, total } = testTally(results);
  const head = `Тест-задание «${playtest.title}»: ${failed ? `не прошло ${failed} из ${total}` : passed === total ? `всё прошло (${total} из ${total})` : `прошло ${passed} из ${total}`}.`;
  const where = [env.platform || playtest.platform, playtest.version ? `версия ${playtest.version}` : ''].filter(Boolean).join(', ');
  const lines = results.map((item, index) => `${item.ok === true ? '✓' : item.ok === false ? '✗' : '–'} ${index + 1}. ${item.step}${item.note ? ` — ${item.note}` : ''}`);
  return [head, where ? `Где проверял: ${where}.` : '', lines.join('\n'), playtestBlock(text, 1200)].filter(Boolean).join('\n').slice(0, 2400);
}

// A first draft of the playtest from the post: what to check depends on what the project has.
export function playtestDraft(project) {
  const steps = project?.demo
    ? ['Открой демо и пройди обучение', 'Поиграй 5 минут и попробуй всё, что видишь на экране', 'Запиши, где застрял или что было непонятно', 'Проверь звук, управление и что игра не тормозит']
    : ['Скачай или открой билд по ссылке', 'Запусти и пройди первые 5 минут', 'Запиши, где застрял или что было непонятно', 'Проверь, что ничего не вылетает'];
  return { title: `Первые 5 минут в «${String(project?.title || 'игре').slice(0, 60)}»`, steps, build: project?.demo || '', platform: '', version: '', notes: '', prompt: '', access: 'none', slots: 10, bounty: 0 };
}

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

const kindTitles = { bug: 'Баги и проблемы', idea: 'Просьбы и идеи', question: 'Вопросы', solution: 'Решения от игроков', review: 'Отзывы и впечатления', other: 'Другое' };
const tagNames = { visuals: 'графика', controls: 'управление', sound: 'звук', idea: 'идея', mood: 'атмосфера', bugs: 'баги', hard: 'сложно', unclear: 'непонятно', slow: 'тормозит', short: 'мало контента' };

// Several pieces of feedback as one task: grouped by kind, bugs first, with the stars and marks of demo reviews.
export function taskFromFeedback(project, comments) {
  const order = ['bug', 'idea', 'question', 'solution', 'review', 'other'];
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

const kindWords = { bug: 'сообщение о баге', idea: 'идею', question: 'вопрос', solution: 'решение', review: 'отзыв', other: 'комментарий' };

// A comment as a task the agent can act on: the project, the player's words, the thread around them and
// where to start. Used when there is no AI to write the task, and as the material when there is.
export function promptFromComment(project, comment, { thread = [], files = [], readme = '' } = {}) {
  const who = comment.handle ? `@${comment.handle}` : comment.name || 'Игрок';
  const about = [project.summary, (project.tags || []).filter(tag => tag !== 'Новый проект').join(', '), (project.madeWith || []).length ? `сделано на ${project.madeWith.join(', ')}` : ''].filter(Boolean).join(' · ');
  const review = comment.review ? ` (★${comment.review.stars}${comment.review.tags?.length ? `, ${comment.review.tags.map(tag => tagNames[tag] || tag).join(', ')}` : ''})` : '';
  const replies = thread.filter(item => item.text && item.id !== comment.id).slice(-8).map(item => `— ${item.handle ? `@${item.handle}` : item.name || 'игрок'}${item.byAuthor ? ' (автор)' : ''}: «${clipText(item.text, 300)}»`).join('\n');
  const top = files.filter(Boolean).slice(0, 30).join(', ');
  const readmeLine = clipText(String(readme || '').replace(/^#.*$/m, ''), 400);
  return [
    `Проект «${project.title}»${about ? ` — ${about}` : ''}.`,
    readmeLine ? `Из README: ${readmeLine}` : '',
    `${who} оставил ${kindWords[comment.kind] || kindWords.other}${review}:\n«${String(comment.text || '').trim() || 'без текста'}»`,
    replies ? `Уточнения в обсуждении:\n${replies}` : '',
    top ? `Файлы в корне проекта: ${top}` : '',
    'Что сделать:\n1. Найди в коде, к чему относится этот отзыв.\n2. Если это баг — найди причину; если просьба — придумай самое простое решение, которое подходит игре.\n3. Внеси правку и проверь, что остальное работает.\n4. В конце коротко опиши для игроков, что изменилось.\nЕсли из отзыва непонятно, что именно не так, — не гадай: перечисли, что уточнить у игрока.'
  ].filter(Boolean).join('\n\n');
}
