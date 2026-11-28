import { randomUUID } from 'node:crypto';
import { pushEndpointAllowed, sendPush } from './push.mjs';

// What happened around a person: follows, support, comments, replies, reposts, project updates and
// messages. Every event lands in the in-app list (messages have their own inbox) and, if the person
// allowed it, goes out as a push to each browser they subscribed.

export const noticeGroups = {
  messages: { label: 'Сообщения', hint: 'Новые сообщения в чатах', types: ['message'] },
  comments: { label: 'Комментарии', hint: 'Комментарии, ответы, лайки и закрепы', types: ['comment', 'reply', 'comment-like', 'pin', 'accepted', 'tasked', 'fixed', 'review', 'tester', 'test-report', 'tester-invite', 'bounty'] },
  likes: { label: 'Поддержка и репосты', hint: 'Кто поддержал и поделился', types: ['like', 'repost'] },
  follows: { label: 'Подписчики', hint: 'Новые подписчики', types: ['follow'] },
  updates: { label: 'Обновления проектов', hint: 'Новые проекты и обновления тех, за кем следишь', types: ['update', 'post', 'publisher', 'steam', 'task-done', 'demo-ready'] }
};
const groupOf = type => Object.keys(noticeGroups).find(key => noticeGroups[key].types.includes(type)) || 'updates';
const LIST_LIMIT = 150;
const SUB_LIMIT = 10;
const GROUP_MS = 24 * 3600 * 1000;

export function notifyPrefs(user) {
  const saved = user?.notify || {};
  return { ...Object.fromEntries(Object.keys(noticeGroups).map(key => [key, saved[key] !== false])), quiet: saved.quiet === true };
}

export function cleanNotifyPrefs(body, current) {
  const next = { ...current };
  for (const key of [...Object.keys(noticeGroups), 'quiet']) if (typeof body?.[key] === 'boolean') next[key] = body[key];
  return next;
}

// Quiet hours: 23:00–08:00 in the subscriber's own time zone.
export function isQuietHour(timeZone, now = Date.now()) {
  let hour;
  try { hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: timeZone || 'UTC' }).format(now)); } catch { hour = new Date(now).getUTCHours(); }
  return hour >= 23 || hour < 8;
}

const clipText = (text, max) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

export function noticeText(item, nameOf, projectTitle) {
  const who = nameOf(item.actors?.[0]);
  const more = Math.max(0, (item.count || 1) - 1);
  const title = projectTitle(item.projectId);
  const quote = item.snippet ? `: «${clipText(item.snippet, 90)}»` : '';
  switch (item.type) {
    case 'follow': return more ? `${who} и ещё ${more} — новые подписчики` : `Новый подписчик: ${who}`;
    case 'like': return more ? `${who} и ещё ${more} поддерживают «${title}»` : `${who} поддерживает «${title}»`;
    case 'repost': return more ? `${who} и ещё ${more} делятся «${title}»` : `${who} делится «${title}» со своими подписчиками`;
    case 'comment': return `${who} комментирует «${title}»${quote}`;
    case 'reply': return `${who} отвечает на твой комментарий${quote}`;
    case 'comment-like': return more ? `${who} и ещё ${more} ставят ♥ твоему комментарию${quote}` : `${who} ставит ♥ твоему комментарию${quote}`;
    case 'pin': return `Автор «${title}» закрепляет твой комментарий${quote}`;
    case 'update': return `Новое в «${title}»${quote}`;
    case 'post': return `${who} публикует новый проект «${title}»`;
    case 'message': return `${who}${quote || ': новое сообщение'}`;
    case 'accepted': return `Автор «${title}» принял твой отчёт — +20 искр${quote}`;
    case 'tasked': return `Автор «${title}» взял твой отзыв в работу ИИ — +10 искр${quote}`;
    case 'publisher': return `Издатель заметил «${title}»: людям интересно. Подай заявку в Steam — её посмотрят первой`;
    case 'steam': return item.snippet ? `«${title}»: ${item.snippet}` : `«${title}» в Steam`;
    case 'fixed': return `«${title}»: твой отзыв учли в обновлении — +15 искр${quote}`;
    case 'review': return more ? `${who} и ещё ${more} оценили демо «${title}»` : `${who} оценивает демо «${title}»${quote}`;
    case 'tester': return more ? `${who} и ещё ${more} взяли тест-задание «${title}»` : `${who} берёт тест-задание «${title}»${quote}`;
    case 'test-report': return `${who} прислал отчёт по тесту «${title}»${quote}`;
    case 'bounty': return `Автор «${title}» добавил тебе +${item.snippet || ''} искр от себя за отчёт`;
    case 'tester-invite': return `${who} зовёт тебя тестером «${title}»${quote} — за принятый отчёт +20 искр`;
    case 'task-done': return `ИИ закончил задачу по «${title}» — можно опубликовать обновление${quote}`;
    case 'demo-ready': return `Новая веб-версия «${title}» собрана — поставь её в пост`;
    default: return item.snippet || 'Новое событие';
  }
}

// Types that pile up into one row ("Аня и ещё 3 поддерживают…") while unread.
const groupable = ['like', 'repost', 'comment-like', 'follow', 'review', 'tester'];

export function createNotifier(options) {
  const { D, save, live, env, keys, nameOf, projectTitle, cardOf } = options;
  const subject = () => options.subject;
  D.notifications ||= {};
  D.pushSubs ||= {};

  const blocked = (userId, actorId) => Boolean(actorId) && (D.blocks?.[userId] || []).includes(actorId);

  function unread(userId) {
    return (D.notifications[userId] || []).filter(item => !item.read).length;
  }

  function view(item) {
    return { id: item.id, type: item.type, text: noticeText(item, nameOf, projectTitle), url: item.url || '', at: item.at, read: Boolean(item.read), actor: item.actors?.[0] || '', who: (item.actors?.[0] && cardOf?.(item.actors[0])) || null, projectId: item.projectId || '', count: item.count || 1 };
  }

  function list(userId, limit = 60) {
    return (D.notifications[userId] || []).slice(0, limit).map(view);
  }

  function markRead(userId) {
    for (const item of D.notifications[userId] || []) item.read = true;
    save();
  }

  async function deliver(user, item) {
    const prefs = notifyPrefs(user);
    if (!prefs[groupOf(item.type)]) return;
    const subs = D.pushSubs[user.id] || [];
    if (!subs.length) return;
    const text = noticeText(item, nameOf, projectTitle);
    const message = item.type === 'message'
      ? { title: nameOf(item.actors?.[0]), body: clipText(item.snippet || 'Новое сообщение', 140), url: item.url, tag: `dm-${item.actors?.[0] || ''}` }
      : { title: 'про.стим', body: clipText(text, 160), url: item.url, tag: item.id };
    message.badge = unread(user.id) + (item.type === 'message' ? 1 : 0);
    let changed = false;
    await Promise.all(subs.map(async sub => {
      if (prefs.quiet && isQuietHour(sub.tz)) return;
      try {
        const status = await sendPush(sub, message, keys(), { subject: subject(), urgency: item.type === 'message' ? 'high' : 'normal', topic: message.tag });
        if (status === 404 || status === 410) { sub.gone = true; changed = true; }
      } catch {}
    }));
    if (changed) {
      D.pushSubs[user.id] = subs.filter(sub => !sub.gone);
      save();
    }
  }

  // event: { type, actorId, projectId, snippet, url }
  function notify(userId, event) {
    const user = D.users[userId];
    if (!user || userId === event.actorId || blocked(userId, event.actorId)) return null;
    const now = Date.now();
    let item = null;
    if (event.type !== 'message') {
      const items = D.notifications[userId] ||= [];
      if (groupable.includes(event.type)) {
        item = items.find(entry => !entry.read && entry.type === event.type && (entry.projectId || '') === (event.projectId || '') && (entry.snippet || '') === (event.snippet || '') && now - entry.at < GROUP_MS);
      }
      if (item) {
        if (item.actors.includes(event.actorId)) return item;
        item.actors = [event.actorId, ...item.actors].slice(0, 5);
        item.count = (item.count || 1) + 1;
        item.at = now;
        items.splice(items.indexOf(item), 1);
        items.unshift(item);
      } else {
        item = { id: randomUUID(), type: event.type, actors: event.actorId ? [event.actorId] : [], count: 1, projectId: event.projectId || '', snippet: clipText(event.snippet, 200), url: event.url || '', at: now, read: false };
        items.unshift(item);
        if (items.length > LIST_LIMIT) items.length = LIST_LIMIT;
      }
      save();
      live([userId], 'notify', { unread: unread(userId) });
    } else {
      item = { id: randomUUID(), type: 'message', actors: [event.actorId], snippet: event.snippet || '', url: event.url || '', at: now };
    }
    deliver(user, item).catch(() => {});
    return item;
  }

  function subscribe(user, body) {
    const endpoint = String(body?.endpoint || '');
    const p256dh = String(body?.keys?.p256dh || '');
    const auth = String(body?.keys?.auth || '');
    if (!pushEndpointAllowed(endpoint, env)) return { error: 'Этот браузер не поддерживает уведомления про.стим' };
    if (!/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,30}$/.test(auth)) return { error: 'Браузер прислал неверные ключи' };
    // One browser belongs to one account: signing in as someone else moves the subscription.
    for (const [id, subs] of Object.entries(D.pushSubs)) D.pushSubs[id] = subs.filter(sub => sub.endpoint !== endpoint);
    const subs = D.pushSubs[user.id] ||= [];
    subs.unshift({ endpoint, keys: { p256dh, auth }, tz: String(body?.tz || '').slice(0, 60), at: Date.now() });
    if (subs.length > SUB_LIMIT) subs.length = SUB_LIMIT;
    save();
    return { ok: true, devices: subs.length };
  }

  function unsubscribe(user, endpoint) {
    D.pushSubs[user.id] = (D.pushSubs[user.id] || []).filter(sub => sub.endpoint !== endpoint);
    save();
    return { ok: true, devices: D.pushSubs[user.id].length };
  }

  async function test(user) {
    const subs = D.pushSubs[user.id] || [];
    let delivered = 0;
    for (const sub of subs) {
      try {
        const status = await sendPush(sub, { title: 'про.стим', body: 'Уведомления работают. Так будут приходить ответы, подписчики и обновления', url: '/#/activity', tag: 'test' }, keys(), { subject: subject() });
        if (status >= 200 && status < 300) delivered += 1;
        if (status === 404 || status === 410) sub.gone = true;
      } catch {}
    }
    D.pushSubs[user.id] = subs.filter(sub => !sub.gone);
    save();
    return { devices: D.pushSubs[user.id].length, delivered };
  }

  return { notify, list, unread, markRead, subscribe, unsubscribe, test, devices: userId => (D.pushSubs[userId] || []).length };
}
