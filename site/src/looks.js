// How a profile can look: themes for the banner, decorations around the avatar, name effects, a status
// and a colour. Shared by the server (what may be saved and shown) and the browser (the editor and the
// shop). Everything is drawn by CSS, so nothing extra loads.
//
// Most items come with Plus and are shown while it is on. Items with `price` are sold for sparks: bought
// once, they stay for good and are shown without Plus too.

export const lookThemes = [
  { id: 'aurora', title: 'Северное сияние', group: 'live', accent: 'mint' },
  { id: 'synthwave', title: 'Синтвейв', group: 'live', accent: 'pink' },
  { id: 'cosmos', title: 'Космос', group: 'live', accent: 'lilac' },
  { id: 'bokeh', title: 'Боке', group: 'live', accent: 'orange' },
  { id: 'matrix', title: 'Код', group: 'live', accent: 'lime' },
  { id: 'ocean', title: 'Глубина', group: 'live', accent: 'cyan' },
  { id: 'ember', title: 'Угли', group: 'live', accent: 'amber' },
  { id: 'hologram', title: 'Голограмма', group: 'live', accent: 'sky' },
  { id: 'glitch', title: 'Глитч', group: 'live', accent: 'cyan' },
  { id: 'neon', title: 'Неоновая вывеска', group: 'scene', accent: 'pink' },
  { id: 'sunset', title: 'Закат над морем', group: 'scene', accent: 'rose' },
  { id: 'pixel', title: '8 бит', group: 'scene', accent: 'sky' },
  { id: 'sakura', title: 'Сакура', group: 'scene', accent: 'pink' },
  { id: 'comic', title: 'Комикс', group: 'scene', accent: 'yellow' },
  { id: 'blueprint', title: 'Чертёж', group: 'texture', accent: 'sky' },
  { id: 'topo', title: 'Рельеф', group: 'texture', accent: 'mint' },
  { id: 'marble', title: 'Чёрный мрамор', group: 'texture', accent: 'white' },
  { id: 'carbon', title: 'Карбон', group: 'texture', accent: 'red' },
  { id: 'forge', title: 'Кузница искр', group: 'sparks', accent: 'amber', price: 400 },
  { id: 'galaxy', title: 'Галактика', group: 'sparks', accent: 'violet', price: 600 }
];

export const themeGroups = [['live', 'Живые'], ['scene', 'Сцены'], ['texture', 'Фактуры'], ['sparks', 'За искры']];

export const lookDecos = [
  { id: 'halo', title: 'Нимб' },
  { id: 'orbit', title: 'Орбита' },
  { id: 'flame', title: 'Пламя' },
  { id: 'crown', title: 'Корона' },
  { id: 'ears', title: 'Ушки' },
  { id: 'phones', title: 'Наушники' },
  { id: 'hearts', title: 'Сердечки' },
  { id: 'snow', title: 'Снегопад' },
  { id: 'pixels', title: 'Пиксели' },
  { id: 'sparks', title: 'Искры', price: 250 },
  { id: 'lightning', title: 'Молнии', price: 300 }
];

export const lookNames = [
  { id: 'gradient', title: 'Градиент' },
  { id: 'shimmer', title: 'Блеск' },
  { id: 'neon', title: 'Неон' },
  { id: 'rainbow', title: 'Радуга' },
  { id: 'fire', title: 'Огонь' },
  { id: 'glitch', title: 'Глитч' },
  { id: 'gold', title: 'Золото', price: 200 }
];

export const profileAccents = [
  ['rose', '#ff2e63'], ['red', '#ef4444'], ['orange', '#ff7a2f'], ['amber', '#ffb03b'], ['yellow', '#ffe14d'], ['lime', '#c6f432'], ['mint', '#3ddc84'],
  ['teal', '#14b8a6'], ['cyan', '#67e8f9'], ['sky', '#6cb8ff'], ['violet', '#8b5cf6'], ['lilac', '#b78cff'], ['pink', '#ff6fb5'], ['white', '#f2f1ee']
];

export const lookStatuses = ['🎮', '👾', '🛠️', '🎨', '🎧', '🚀', '🔥', '✨', '🌙', '☕', '🐛', '🧠', '🌱', '⚡', '🎯', '🏆', '📚', '💜', '🦊', '🐸'];

export const MOTION_VIDEO_LIMIT = 12 * 1024 * 1024;

const lookSlots = { banner: lookThemes, deco: lookDecos, name: lookNames };

export function lookItem(slot, id) {
  return lookSlots[slot]?.find(item => item.id === id) || null;
}

export const itemKey = (slot, id) => `${slot}:${id}`;

// Everything sold for sparks, for the shop.
export const sparkItems = Object.entries(lookSlots).flatMap(([slot, list]) => list.filter(item => item.price).map(item => ({ ...item, slot, key: itemKey(slot, item.id) })));

export function sparkItem(key) {
  return sparkItems.find(item => item.key === key) || null;
}

// Whether someone may put this item on: Plus items while Plus is on, spark items once bought.
export function canWear(slot, id, { plus = false, owned = [] } = {}) {
  const item = lookItem(slot, id);
  if (!item) return false;
  return item.price ? owned.includes(itemKey(slot, id)) : plus;
}

export function cleanLookChoice(value, list) {
  return list.some(entry => (Array.isArray(entry) ? entry[0] : entry.id ?? entry) === value) ? value : '';
}

export function cleanStatus(value) {
  return lookStatuses.includes(value) ? value : '';
}

export const accentColor = key => profileAccents.find(([name]) => name === key)?.[1] || '';

// What other people see. Plus items only while Plus is on; spark items whenever they are owned. Without
// a chosen colour the theme brings its own.
export function lookView(look, access = {}) {
  if (!look) return null;
  const plus = Boolean(access.plus);
  const wear = slot => (look[slot] && canWear(slot, look[slot], access) ? look[slot] : '');
  const banner = wear('banner');
  const chosen = plus ? cleanLookChoice(look.accent, profileAccents) : '';
  const accentKey = chosen || lookItem('banner', banner)?.accent || '';
  const view = {
    banner,
    bannerImage: plus ? look.bannerImage || '' : '',
    accent: accentColor(accentKey),
    accentKey: chosen,
    motion: plus && look.motion?.url ? { url: look.motion.url, type: look.motion.type === 'video' ? 'video' : 'image' } : null,
    deco: wear('deco'),
    name: wear('name'),
    status: plus ? cleanStatus(look.status) : ''
  };
  return view.banner || view.bannerImage || view.accent || view.motion || view.deco || view.name || view.status ? view : null;
}
