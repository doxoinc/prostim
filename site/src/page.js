import { icon } from './icons.js';
import { escapeHtml, safeUrl } from './state.js';

// A post is a small store page: facts (stage, platforms, price, what the author is looking for),
// store links and a page the author builds from blocks with their own colours and fonts.
// The server cleans everything it stores with these functions; the browser renders only what they allow.

export const postStages = [['idea', 'Идея'], ['prototype', 'Прототип'], ['demo', 'Демо'], ['beta', 'Бета'], ['release', 'Релиз']];
export const postPlatforms = [['windows', 'Windows'], ['mac', 'macOS'], ['linux', 'Linux'], ['web', 'Web'], ['ios', 'iOS'], ['android', 'Android'], ['steamdeck', 'Steam Deck']];
export const postPricing = [['free', 'Бесплатно'], ['paid', 'Платно'], ['open', 'Открытый код'], ['subscription', 'Подписка']];
export const postSeeking = [['testers', 'Тестеров'], ['feedback', 'Отзывы'], ['team', 'Команду'], ['artist', 'Художника'], ['publisher', 'Издателя'], ['investment', 'Инвестиции']];

export const pageFonts = {
  sans: { label: 'Обычный', family: '' },
  display: { label: 'Акцент', family: 'Unbounded:wght@400..900' },
  serif: { label: 'Книжный', family: 'Playfair+Display:wght@400..900' },
  mono: { label: 'Код', family: 'JetBrains+Mono:wght@400..800' },
  round: { label: 'Мягкий', family: 'Comfortaa:wght@400..700' },
  hand: { label: 'От руки', family: 'Caveat:wght@400..700' },
  pixel: { label: 'Пиксели', family: 'Press+Start+2P' }
};
export const pageSizes = { s: 'S', m: 'M', l: 'L', xl: 'XL' };
export const pageWeights = { 400: 'Обычный', 600: 'Полужирный', 800: 'Жирный', 900: 'Чёрный' };
export const pageBackgrounds = ['#0f1110', '#161a2e', '#241631', '#2e1717', '#0f2a26', '#1d2a14', '#f5efe6', '#ffffff', '#ffe9a8', '#dcefff'];
export const pageColors = ['#ffffff', '#141714', '#c4f56f', '#ffd84d', '#ff8a3d', '#ff5d73', '#b78cff', '#6cb8ff', '#3ddbb0', '#f5efe6'];
export const pageBlockTypes = {
  heading: { label: 'Заголовок', icon: 'text' },
  text: { label: 'Текст', icon: 'doc' },
  image: { label: 'Фото / GIF', icon: 'image', media: true },
  video: { label: 'Видео', icon: 'film', media: true },
  list: { label: 'Список', icon: 'check' },
  quote: { label: 'Цитата', icon: 'comment' },
  button: { label: 'Кнопка', icon: 'external' },
  divider: { label: 'Линия', icon: 'minus' }
};
export const PAGE_BLOCK_LIMIT = 30;
export const POST_LINK_LIMIT = 6;
export const DEFAULT_ACCENT = '#f2f1ee';

const HEX = /^#[0-9a-f]{6}$/i;

const linkKinds = [
  ['steam', 'Steam', 'gamepad', ['store.steampowered.com', 'steamcommunity.com', 's.team']],
  ['vkplay', 'VK Play', 'gamepad', ['vkplay.ru', 'store.vkplay.ru', 'live.vkplay.ru']],
  ['itch', 'itch.io', 'gamepad', ['itch.io']],
  ['gog', 'GOG', 'gamepad', ['gog.com']],
  ['github', 'GitHub', 'branch', ['github.com']],
  ['gitlab', 'GitLab', 'branch', ['gitlab.com']],
  ['appstore', 'App Store', 'download', ['apps.apple.com']],
  ['gplay', 'Google Play', 'download', ['play.google.com']],
  ['rustore', 'RuStore', 'download', ['rustore.ru']],
  ['telegram', 'Telegram', 'send', ['t.me', 'telegram.me']],
  ['discord', 'Discord', 'comment', ['discord.gg', 'discord.com']],
  ['youtube', 'YouTube', 'play', ['youtube.com', 'youtu.be']],
  ['vk', 'VK', 'users', ['vk.com', 'vkvideo.ru']],
  ['figma', 'Figma', 'pen', ['figma.com']]
];

// People paste links without the scheme ("t.me/game", "mygame.ru", "www.site.com"): those get https://.
// Anything with another scheme (javascript:, mailto:, localhost:) stays rejected.
export function normalizeUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^[a-z][a-z\d+.-]*:/i.test(text)) return safeUrl(text);
  if (text.startsWith('//')) return safeUrl(`https:${text}`);
  return /^[\p{L}\d-]+(\.[\p{L}\d-]+)+(:\d+)?([/?#]|$)/u.test(text) ? safeUrl(`https://${text}`) : '';
}

// A playable build in the browser: only https, so it can be shown inside an https page. The author
// may paste an embed code (itch.io "Embed game"): the address is taken from its iframe.
export function cleanDemoUrl(value) {
  const text = String(value ?? '').slice(0, 3000);
  const src = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(text)?.[1];
  const url = normalizeUrl((src ? src.replace(/&amp;/g, '&') : text).trim().slice(0, 500));
  return url.startsWith('https://') ? url : '';
}

export function linkKind(value) {
  const url = normalizeUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname.replace(/^www\./, '');
  const found = linkKinds.find(([, , , domains]) => domains.some(domain => host === domain || host.endsWith(`.${domain}`)));
  return found ? { kind: found[0], label: found[1], icon: found[2], host, url } : { kind: 'site', label: host, icon: 'globe', host, url };
}

export function cleanString(value, max) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

function cleanColor(value) {
  return HEX.test(String(value || '')) ? String(value).toLowerCase() : '';
}

function pickOne(options, value) {
  return options.some(([key]) => key === value) ? value : '';
}

function pickMany(options, values) {
  const list = Array.isArray(values) ? values : [];
  return options.map(([key]) => key).filter(key => list.includes(key));
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== '' && value !== 0 && value !== undefined));
}

export function cleanTheme(theme) {
  const source = theme && typeof theme === 'object' ? theme : {};
  return { bg: cleanColor(source.bg), accent: cleanColor(source.accent), font: pageFonts[source.font] ? source.font : 'sans' };
}

function cleanStyle(block) {
  return compact({
    size: pageSizes[block.size] ? block.size : '',
    weight: pageWeights[block.weight] ? Number(block.weight) : 0,
    font: pageFonts[block.font] ? block.font : '',
    color: cleanColor(block.color),
    align: block.align === 'center' ? 'center' : ''
  });
}

// checkMedia(block) returns { url, type } for a file the author may use, or null.
export function cleanBlock(block, checkMedia = () => null) {
  if (!block || typeof block !== 'object') return null;
  const style = cleanStyle(block);
  if (block.type === 'heading' || block.type === 'text') {
    const text = cleanString(block.text, block.type === 'heading' ? 200 : 3000);
    return text ? { type: block.type, text, ...style } : null;
  }
  if (block.type === 'list') {
    const items = (Array.isArray(block.items) ? block.items : String(block.items ?? '').split('\n')).map(item => cleanString(item, 300)).filter(Boolean).slice(0, 20);
    return items.length ? { type: 'list', items, ...style } : null;
  }
  if (block.type === 'quote') {
    const text = cleanString(block.text, 600);
    return text ? { type: 'quote', text, author: cleanString(block.author, 80), ...style } : null;
  }
  if (block.type === 'image' || block.type === 'video') {
    const media = checkMedia(block);
    if (!media || media.type !== block.type) return null;
    return compact({ type: block.type, url: media.url, caption: cleanString(block.caption, 200) });
  }
  if (block.type === 'button') {
    const url = normalizeUrl(cleanString(block.url, 500));
    return url ? compact({ type: 'button', url, label: cleanString(block.label, 60) }) : null;
  }
  if (block.type === 'divider') return { type: 'divider' };
  return null;
}

export function cleanPage(blocks, checkMedia) {
  return (Array.isArray(blocks) ? blocks : []).slice(0, PAGE_BLOCK_LIMIT).map(block => cleanBlock(block, checkMedia)).filter(Boolean);
}

export function cleanLinks(values) {
  const links = [];
  for (const value of Array.isArray(values) ? values : []) {
    const url = normalizeUrl(cleanString(typeof value === 'string' ? value : value?.url, 500));
    if (url && !links.includes(url)) links.push(url);
  }
  return links.slice(0, POST_LINK_LIMIT);
}

export function cleanPostFields(source, checkMedia) {
  const body = source && typeof source === 'object' ? source : {};
  return {
    stage: pickOne(postStages, body.stage),
    platforms: pickMany(postPlatforms, body.platforms),
    pricing: pickOne(postPricing, body.pricing),
    seeking: pickMany(postSeeking, body.seeking),
    ai: body.ai === true,
    madeWith: (Array.isArray(body.madeWith) ? body.madeWith : String(body.madeWith ?? '').split(',')).map(item => cleanString(item, 24)).filter(Boolean).slice(0, 6),
    links: cleanLinks(body.links),
    demo: cleanDemoUrl(body.demo),
    theme: cleanTheme(body.theme),
    page: cleanPage(body.page, checkMedia)
  };
}

/* Colours */

function luminance(hex) {
  const channels = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

// Above this luminance dark text has more contrast than white text.
export function isLightColor(hex) {
  return HEX.test(hex || '') && luminance(hex) > 0.2;
}

export function inkFor(hex) {
  return isLightColor(hex) ? '#141714' : '#f4f6ef';
}

// CSS custom properties for a themed page; nested components read --text, --surface-* and --brand.
export function themeVars(theme) {
  const clean = cleanTheme(theme);
  const accent = clean.accent || (isLightColor(clean.bg) ? '#141714' : DEFAULT_ACCENT);
  const vars = [`--page-accent:${accent}`, `--page-accent-ink:${inkFor(accent)}`];
  if (clean.bg) vars.push(`--page-bg:${clean.bg}`, `--page-ink:${inkFor(clean.bg)}`);
  return vars.join(';');
}

export function themeClass(theme) {
  const clean = cleanTheme(theme);
  return `pf-${clean.font}${clean.bg ? ` themed ${isLightColor(clean.bg) ? 'is-light' : 'is-dark'}` : ''}`;
}

export function fontFamiliesFor(project) {
  const keys = new Set([cleanTheme(project?.theme).font]);
  for (const block of Array.isArray(project?.page) ? project.page : []) if (pageFonts[block?.font]) keys.add(block.font);
  return [...keys].filter(key => pageFonts[key]?.family);
}

/* Rendering */

const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

// Plain text with **bold**, _italic_ and [label](https://link). Everything else stays text.
export function richText(value) {
  return escapeHtml(value)
    .replace(/\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)]{1,400})\)/g, (match, label, raw) => {
      const url = safeUrl(raw.replace(/&(amp|lt|gt|quot|#39);/g, entity => entities[entity]));
      return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow ugc">${label}</a>` : match;
    })
    .replace(/\*\*([^*\n]{1,200})\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(«"])_([^_\n]{1,200})_(?=$|[\s.,!?:;)»"])/g, '$1<i>$2</i>')
    .replace(/\n/g, '<br>');
}

export function blockClass(block) {
  return [`pb pb-${block.type}`, block.size ? `sz-${block.size}` : '', block.font ? `pf-${block.font}` : '', block.align === 'center' ? 'al-center' : ''].filter(Boolean).join(' ');
}

export function blockStyle(block) {
  const parts = [];
  if (pageWeights[block.weight]) parts.push(`font-weight:${Number(block.weight)}`);
  if (HEX.test(block.color || '')) parts.push(`color:${block.color}`);
  return parts.length ? ` style="${parts.join(';')}"` : '';
}

const uploadPath = value => /^\/uploads\/[\w.-]+$/.test(value || '') ? value : '';

export function blockHtml(block) {
  const attrs = `class="${blockClass(block)}"${blockStyle(block)}`;
  if (block.type === 'heading') return `<h3 ${attrs}>${richText(block.text)}</h3>`;
  if (block.type === 'text') return `<p ${attrs}>${richText(block.text)}</p>`;
  if (block.type === 'list') return `<ul ${attrs}>${block.items.map(item => `<li>${richText(item)}</li>`).join('')}</ul>`;
  if (block.type === 'quote') return `<blockquote ${attrs}><p>${richText(block.text)}</p>${block.author ? `<cite>${escapeHtml(block.author)}</cite>` : ''}</blockquote>`;
  if (block.type === 'image' || block.type === 'video') {
    const url = uploadPath(block.url);
    if (!url) return '';
    const media = block.type === 'video' ? `<video src="${url}#t=0.1" controls playsinline preload="metadata"></video>` : `<img src="${url}" alt="${escapeHtml(block.caption || '')}" loading="lazy">`;
    return `<figure class="pb pb-media">${media}${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
  }
  if (block.type === 'button') {
    const link = linkKind(block.url);
    if (!link) return '';
    return `<a class="pb pb-button" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer nofollow ugc">${icon(link.icon)}<span>${escapeHtml(block.label || link.label)}</span>${icon('external')}</a>`;
  }
  if (block.type === 'divider') return '<hr class="pb pb-divider">';
  return '';
}

export function pageHtml(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map(blockHtml).join('');
}
