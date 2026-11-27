import { escapeHtml } from './state.js';

// The social parts of the feed, shared by the browser and the server: what a person asked the feed
// to show more or less of, full-text search over posts, report reasons and a plain digest of comments.

export const reportReasons = [
  ['spam', 'Спам или реклама'],
  ['fraud', 'Обман или мошенничество'],
  ['abuse', 'Оскорбления или травля'],
  ['violence', 'Насилие или опасные действия'],
  ['adult', 'Контент 18+'],
  ['copyright', 'Чужая работа, нарушение прав'],
  ['other', 'Другое']
];

/* Feed preferences: topics, tags and authors to see more of, less of, or never */

const prefPattern = /^(cat|tag|author):.{1,60}$/;

export function emptyFeedPrefs() {
  return { more: [], less: [], hidden: [] };
}

export function cleanFeedPrefs(value) {
  const prefs = emptyFeedPrefs();
  const seen = new Set();
  for (const kind of ['hidden', 'less', 'more']) {
    for (const raw of Array.isArray(value?.[kind]) ? value[kind] : []) {
      const key = String(raw ?? '').toLocaleLowerCase('ru').trim().slice(0, 64);
      if (!prefPattern.test(key) || seen.has(key) || prefs[kind].length >= 40) continue;
      seen.add(key);
      prefs[kind].push(key);
    }
  }
  return prefs;
}

// Moves one key into a list ('more', 'less', 'hidden') or out of all of them ('').
export function withFeedPref(prefs, key, kind) {
  const next = cleanFeedPrefs(prefs);
  const clean = String(key).toLocaleLowerCase('ru').trim();
  for (const list of ['more', 'less', 'hidden']) next[list] = next[list].filter(item => item !== clean);
  if (kind && next[kind]) next[kind].unshift(clean);
  return cleanFeedPrefs(next);
}

/* Comments: pinned first, then the order the reader picked. "Лучшие" mixes fresh and liked:
   likes and replies count for more, but every hour of age wears a comment down. Replies stay in order
   under the comment they answer. */

export const commentSorts = [['best', 'Лучшие'], ['new', 'Новые'], ['top', 'Популярные']];

export function sortComments(list, mode = 'best', now = Date.now()) {
  const all = (list || []).filter(Boolean);
  const ids = new Set(all.map(comment => comment.id).filter(Boolean));
  const roots = all.filter(comment => !comment.replyTo || !ids.has(comment.replyTo));
  const replies = new Map();
  for (const comment of all) if (comment.replyTo && ids.has(comment.replyTo)) replies.set(comment.replyTo, [...(replies.get(comment.replyTo) || []), comment]);
  const time = comment => Number(comment.createdAt) || 0;
  const likes = comment => Number(comment.likes) || 0;
  const score = comment => {
    const hours = Math.max(0, (now - time(comment)) / 36e5);
    return (likes(comment) * 2 + (replies.get(comment.id)?.length || 0) + 1) / (hours + 2) ** 0.8;
  };
  const order = { best: (left, right) => score(right) - score(left), new: (left, right) => time(right) - time(left), top: (left, right) => likes(right) - likes(left) || (replies.get(right.id)?.length || 0) - (replies.get(left.id)?.length || 0) || time(right) - time(left) }[mode] || (() => 0);
  return roots
    .map((comment, index) => ({ comment, index }))
    .sort((left, right) => Number(Boolean(right.comment.pinned)) - Number(Boolean(left.comment.pinned)) || order(left.comment, right.comment) || left.index - right.index)
    .map(({ comment }) => ({ comment, replies: (replies.get(comment.id) || []).slice().sort((left, right) => time(left) - time(right)) }));
}

/* Search: every word has to be found somewhere in the post */

const stem = word => word.length >= 6 ? word.slice(0, -2) : word.length >= 4 ? word.slice(0, -1) : word;

function searchFields(project) {
  const page = (project.page || []).map(block => [block.text, ...(block.items || []), block.label, block.author].filter(Boolean).join(' ')).join(' ');
  const updates = (project.updates || []).map(update => `${update.version || ''} ${update.title || ''} ${update.text || ''}`).join(' ');
  return [
    ['title', 6, project.title || ''],
    ['tags', 4, (project.tags || []).join(' ')],
    ['author', 3, `${project.author || ''} @${project.handle || ''}`],
    ['summary', 3, project.summary || ''],
    ['page', 1.5, page],
    ['updates', 1.5, updates],
    ['about', 1, project.description || '']
  ];
}

function snippetAround(text, needle) {
  const lower = text.toLocaleLowerCase('ru');
  const at = lower.indexOf(needle);
  if (at < 0) return '';
  const start = Math.max(0, at - 40);
  const end = Math.min(text.length, at + needle.length + 70);
  const before = escapeHtml(text.slice(start, at));
  const match = escapeHtml(text.slice(at, at + needle.length));
  const after = escapeHtml(text.slice(at + needle.length, end));
  return `${start ? '…' : ''}${before}<mark>${match}</mark>${after}${end < text.length ? '…' : ''}`;
}

export function searchProjects(list, query) {
  const words = String(query || '').toLocaleLowerCase('ru').split(/[^\p{L}\p{N}#@+.-]+/u).map(word => word.replace(/^[#@]/, '')).filter(word => word.length >= 2).slice(0, 6);
  if (!words.length) return [];
  const results = [];
  for (const project of list) {
    const fields = searchFields(project).map(([name, weight, text]) => [name, weight, String(text).replace(/\s+/g, ' ')]);
    let score = 0;
    let snippet = '';
    let all = true;
    for (const word of words) {
      const needle = stem(word);
      let found = false;
      for (const [name, weight, text] of fields) {
        const lower = text.toLocaleLowerCase('ru');
        if (!lower.includes(needle)) continue;
        found = true;
        score += weight * (lower.includes(word) ? 1 : 0.7);
        if (!snippet && !['title', 'author'].includes(name)) snippet = snippetAround(text, needle);
      }
      if (!found) { all = false; break; }
    }
    if (all) results.push({ project, score, snippet });
  }
  return results.sort((left, right) => right.score - left.score);
}

/* A digest of a comment thread without AI: how many, the mood, the questions and the common words */

const positive = /(круто|класс|нрав|супер|топ|огон|шикар|красив|отлич|любл|кайф|лучш|молод|вау|wow|cool|❤|🔥|👍|😍|🤩|💯)/iu;
const negative = /(баг|ошиб|не работ|вылет|краш|лаг|торм|плох|скучн|дорог|сломал|не запуск|не грузит|👎|😡|💩)/iu;
const stopWords = new Set('это как что все так там тут для еще ещё уже очень было есть будет если когда чтобы только можно нужно вот она они оно его мне меня тебе тебя вам вас нас наш ваш мой твой свой этот эта эти тот при над под без про через после перед или либо даже тоже просто пока лишь сейчас вообще кстати спасибо привет'.split(' '));

export function commentDigest(comments) {
  const list = (comments || []).filter(comment => comment?.text);
  const voices = (comments || []).filter(comment => comment?.voice && !comment.text).length;
  const total = list.length + voices;
  if (!total) return { summary: 'Комментариев пока нет', points: [] };
  const good = list.filter(comment => positive.test(comment.text)).length;
  const bad = list.filter(comment => negative.test(comment.text)).length;
  const questions = list.filter(comment => comment.text.includes('?')).length;
  const counts = new Map();
  for (const comment of list) {
    const seen = new Set();
    for (const word of comment.text.toLocaleLowerCase('ru').match(/\p{L}{4,}/gu) || []) {
      const key = stem(word);
      if (stopWords.has(word) || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) || { word, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  const common = [...counts.values()].filter(entry => entry.count >= 2).sort((left, right) => right.count - left.count).slice(0, 4).map(entry => entry.word);
  const forms = [total % 10 === 1 && total % 100 !== 11 ? 'комментарий' : [2, 3, 4].includes(total % 10) && ![12, 13, 14].includes(total % 100) ? 'комментария' : 'комментариев'];
  const mood = good > bad * 2 ? 'В основном хвалят' : bad > good ? 'Больше жалоб, чем похвалы' : good || bad ? 'Мнения разделились' : 'Обсуждают спокойно';
  const points = [
    ...(good ? [`Хвалят: ${good}`] : []),
    ...(bad ? [`Жалобы и баги: ${bad}`] : []),
    ...(questions ? [`Вопросы автору: ${questions}`] : []),
    ...(voices ? [`Голосовых: ${voices}`] : [])
  ];
  return { summary: `${total} ${forms[0]}. ${mood}.${common.length ? ` Чаще всего пишут про: ${common.join(', ')}.` : ''}`, points };
}

/* Feedback: what a comment is about, and quick reviews after playing a demo */

export const feedbackKinds = [['bug', 'Баги'], ['idea', 'Идеи'], ['question', 'Вопросы'], ['solution', 'Решения'], ['review', 'Отзывы'], ['other', 'Другое']];
// What the person who wrote a comment says it is; the author of the project may correct it.
export const commentLabels = [['bug', 'Баг'], ['idea', 'Идея'], ['review', 'Отзыв'], ['question', 'Вопрос'], ['solution', 'Решение']];
export const reviewTags = {
  good: [['visuals', 'Графика'], ['controls', 'Управление'], ['sound', 'Звук'], ['idea', 'Идея'], ['mood', 'Атмосфера']],
  bad: [['bugs', 'Баги'], ['hard', 'Сложно'], ['unclear', 'Непонятно'], ['slow', 'Тормозит'], ['short', 'Мало контента']]
};
const reviewTagKeys = [...reviewTags.good, ...reviewTags.bad].map(([key]) => key);

const bugWords = /(баг|ошиб|вылет|краш|завис|не работ|не запуск|не грузит|тормоз|лаг|глюк|сломал|пада|чёрный экран|черный экран|неудобн|непонятн|не понятн|мешает|раздража|crash|bug|freeze|softlock)/iu;
const ideaWords = /(добав|хотел[оаи]?с?ь? бы|было бы (здорово|круто|классно|удобно)|предлага|можно (ли )?(сделать|добавить)|не хватает|сделайте|сделай|пожалуйста|а если|стоит добавить)/iu;
const questionWords = /(\?|^(как|когда|где|почему|зачем|будет ли|а будет|сколько|есть ли)\b)/iu;
const praiseWords = /(круто|класс|нрав|супер|топ|огон|шикар|красив|отлич|любл|кайф|лучш|молод|вау|wow|cool|❤|🔥|👍|😍)/iu;

export function cleanReview(value) {
  if (!value || typeof value !== 'object') return null;
  const stars = Math.round(Number(value.stars));
  if (!(stars >= 1 && stars <= 5)) return null;
  const tags = [...new Set((Array.isArray(value.tags) ? value.tags : []).filter(tag => reviewTagKeys.includes(tag)))].slice(0, 6);
  return { stars, tags };
}

// Bugs first: a report that mentions a crash is a bug even if it also asks for something.
export function feedbackKind(text, review = null) {
  const value = String(text || '');
  if (bugWords.test(value) || review?.tags?.some(tag => ['bugs', 'slow'].includes(tag))) return 'bug';
  if (ideaWords.test(value)) return 'idea';
  if (questionWords.test(value.trim())) return 'question';
  if (praiseWords.test(value) || review) return 'review';
  return 'other';
}

export function cleanLabel(value) {
  return commentLabels.some(([key]) => key === value) ? value : '';
}

// A label set by a person wins over the guess from the words.
export function commentKind(comment) {
  return cleanLabel(comment?.label) || feedbackKind(comment?.text, comment?.review);
}

// The demo's score: the latest review of each person counts once.
export function demoRating(comments) {
  const latest = new Map();
  for (const comment of comments || []) if (comment?.review?.stars) latest.set(comment.userId || comment.handle || comment.id, comment.review.stars);
  const scores = [...latest.values()];
  return scores.length ? { average: Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length * 10) / 10, count: scores.length } : { average: 0, count: 0 };
}
