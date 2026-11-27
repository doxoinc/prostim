// Paid reach, shared by the server (prices, what it sells) and the browser (where ads go in the feed):
// promotion packages for a post, the «про.стим Плюс» subscription, and the ad rotation in the feed.

// One ad after every five posts, like in short-video feeds.
export const AD_EVERY = 5;

export const boostPlans = [
  { id: 'day', title: '1 день', days: 1, impressions: 300, price: 149 },
  { id: 'week', title: '7 дней', days: 7, impressions: 3000, price: 790, best: true },
  { id: 'month', title: '30 дней', days: 30, impressions: 15000, price: 2490 }
];

export const PLUS_DISCOUNT = 0.2;

export const plusPlan = {
  id: 'plus', title: 'про.стим Плюс', price: 299, firstPrice: 149, trialHours: 24, days: 30,
  perks: ['Лента без рекламы', `Скидка ${PLUS_DISCOUNT * 100}% на продвижение и день продвижения бесплатно каждый месяц`, 'ИИ-мир: до 6 компьютеров, файлы до 100 МБ, история задач длиннее', 'Тест-задания: до 50 тестеров и место выше в списке заданий', 'Steam: заявку смотрят первой, проверка документов бесплатно', 'Промпт из комментария: ИИ разбирает отзыв в контексте проекта и сразу отдаёт агенту', 'Значок Плюс и новые функции первым']
};

// Without Plus and with it, side by side: everything that works for free stays free.
export const plusCompare = [
  ['Лента, комментарии, публикация постов', 'есть', 'есть'],
  ['Реклама в ленте', 'каждый 6-й пост', 'нет'],
  ['Тест-задания: тестеров', '10', '50, выше в списке'],
  ['Искры за помощь авторам', 'есть', 'есть'],
  ['Продвижение поста', 'полная цена', '−20% и день в подарок'],
  ['ИИ-мир: компьютеров', '2', '6'],
  ['ИИ-мир: файлы к задаче', 'до 25 МБ', 'до 100 МБ'],
  ['Промпт с ИИ из комментария', '—', 'есть'],
  ['Голосовые комментарии', '—', 'есть'],
  ['Оформление профиля', '—', 'фон, GIF, свой цвет'],
  ['Заявка в Steam', 'в очереди', 'первой']
];

// What Plus changes in ИИ-мир.
export const aiLimits = { free: { devices: 2, fileMb: 25, history: 60 }, plus: { devices: 6, fileMb: 100, history: 200 } };

export function boostPlan(id) {
  return boostPlans.find(plan => plan.id === id) || null;
}

export function boostPrice(plan, plus = false) {
  return Math.round(plan.price * (plus ? 1 - PLUS_DISCOUNT : 1));
}

// Weaves ads into a run of feed entries. After every AD_EVERY posts the next ad in rotation goes in,
// never next to the same post. `state` carries the count and rotation into the next run, so ads keep
// their rhythm when the feed grows.
export function placeAds(entries, ads, state = { since: 0, next: 0 }) {
  if (!ads?.length) return entries;
  const placed = [];
  entries.forEach((entry, index) => {
    placed.push(entry);
    if (!entry.id || entry.ad) return;
    state.since += 1;
    if (state.since < AD_EVERY) return;
    const following = entries.slice(index + 1).find(item => item.id)?.id;
    for (let step = 0; step < ads.length; step += 1) {
      const ad = ads[(state.next + step) % ads.length];
      if (ad.projectId === entry.id || ad.projectId === following) continue;
      placed.push({ id: ad.projectId, ad: ad.id, reason: 'ad' });
      state.next = (state.next + step + 1) % ads.length;
      state.since = 0;
      break;
    }
  });
  return placed;
}

/* Plus: how a profile can look. Banners are animated gradients drawn by CSS, so they cost nothing to load. */

export const profileBanners = [['aurora', 'Сияние'], ['sunset', 'Закат'], ['ocean', 'Океан'], ['neon', 'Неон'], ['cosmos', 'Космос'], ['ember', 'Угли']];
export const profileAccents = [['rose', '#ff2e63'], ['amber', '#ffb03b'], ['mint', '#3ddc84'], ['sky', '#6cb8ff'], ['lilac', '#b78cff'], ['pink', '#ff6fb5'], ['cyan', '#67e8f9']];
export const MOTION_VIDEO_LIMIT = 12 * 1024 * 1024;

export function cleanLookChoice(value, list) {
  return list.some(([key]) => key === value) ? value : '';
}

// What other people see: the look only while Plus is on.
export function lookView(look) {
  if (!look) return null;
  const accent = profileAccents.find(([key]) => key === look.accent)?.[1] || '';
  return { banner: cleanLookChoice(look.banner, profileBanners), bannerImage: look.bannerImage || '', accent, accentKey: accent ? look.accent : '', motion: look.motion?.url ? { url: look.motion.url, type: look.motion.type === 'video' ? 'video' : 'image' } : null };
}
