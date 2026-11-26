// Reputation shared by the server and the browser: trust from ratings, level from activity.

const PRIOR_SCORE = 3.5;
const PRIOR_WEIGHT = 3;

export const trustLevels = {
  new: { label: 'Новый', hint: 'Пока нет оценок от других людей' },
  member: { label: 'Участник', hint: 'Есть первые оценки' },
  reliable: { label: 'Надёжный', hint: 'Средняя оценка от 4 и минимум 3 отзыва' },
  verified: { label: 'Проверенный', hint: 'Средняя оценка от 4,5 и минимум 8 отзывов' },
  caution: { label: 'Осторожно', hint: 'Низкие оценки от нескольких людей' }
};

const levelNames = ['Новичок', 'Исследователь', 'Создатель', 'Мастер', 'Легенда'];

// Avatar ring colour by level: ten tiers from white to an animated rainbow.
// From level 5 the ring glows, from level 14 it also shimmers, the last tier is a spinning rainbow.
export const levelTiers = [
  { from: 1, color: '#eef1e8', name: 'Белое' },
  { from: 2, color: '#7ee081', name: 'Зелёное' },
  { from: 3, color: '#3ddbb0', name: 'Бирюзовое' },
  { from: 5, color: '#6cb8ff', name: 'Синее' },
  { from: 7, color: '#b78cff', name: 'Фиолетовое' },
  { from: 10, color: '#ff6fb5', name: 'Розовое' },
  { from: 14, color: '#ff5d5d', name: 'Красное' },
  { from: 19, color: '#ff9a3d', name: 'Оранжевое' },
  { from: 25, color: '#ffd84d', name: 'Золотое' },
  { from: 35, color: '#ffffff', name: 'Радужное' }
];

export function levelTier(level) {
  const value = Math.max(1, Number(level) || 1);
  const index = levelTiers.reduce((found, tier, position) => value >= tier.from ? position : found, 0);
  const next = levelTiers[index + 1];
  return { ...levelTiers[index], tier: index + 1, to: next ? next.from - 1 : 50, aura: index >= 3, strong: index >= 6, legend: index === levelTiers.length - 1 };
}

export function trustSummary({ scores = [], projects = 0, votesReceived = 0, followers = 0, comments = 0 } = {}) {
  const valid = scores.filter(score => Number.isInteger(score) && score >= 1 && score <= 5);
  const count = valid.length;
  const sum = valid.reduce((total, score) => total + score, 0);
  const average = count ? sum / count : 0;
  const weighted = count ? (PRIOR_SCORE * PRIOR_WEIGHT + sum) / (PRIOR_WEIGHT + count) : 0;
  let trust = 'new';
  if (count >= 3 && weighted < 2.8) trust = 'caution';
  else if (count >= 8 && weighted >= 4.3) trust = 'verified';
  else if (count >= 3 && weighted >= 3.9) trust = 'reliable';
  else if (count > 0) trust = 'member';
  const xp = projects * 30 + votesReceived * 3 + followers * 10 + comments * 2 + count * 5;
  const level = Math.min(50, Math.floor(Math.sqrt(xp / 20)) + 1);
  const floor = (level - 1) ** 2 * 20;
  const next = level ** 2 * 20;
  return {
    ratingAverage: Math.round(average * 10) / 10,
    ratingCount: count,
    trust,
    trustScore: count ? Math.round(weighted / 5 * 100) : null,
    xp,
    level,
    levelName: levelNames[Math.min(levelNames.length - 1, Math.floor((level - 1) / 3))],
    levelProgress: level >= 50 ? 1 : Math.max(0, Math.min(1, (xp - floor) / (next - floor)))
  };
}
