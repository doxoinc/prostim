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
  perks: ['Лента без рекламы', `Скидка ${PLUS_DISCOUNT * 100}% на продвижение и день продвижения бесплатно каждый месяц`, 'ИИ-мир: до 6 компьютеров, файлы до 100 МБ, история задач длиннее', 'Steam: заявку смотрят первой, проверка документов бесплатно', 'Промпт из комментария: ИИ разбирает отзыв в контексте проекта и сразу отдаёт агенту', 'Значок Плюс и новые функции первым']
};

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
