import { lookup } from 'node:dns/promises';
import net from 'node:net';

// Turns a store or repository link into a draft post: title, short text, tags, platforms, pictures
// and a page made of blocks. Steam and GitHub have open APIs; other pages (itch.io, VK Play, RuStore,
// App Store, Google Play, any site) are read from their Open Graph tags.
//
// The server fetches what people paste, so every request is checked: https only, public addresses
// only, a few redirects at most, a size cap and a timeout. LINK_PREVIEW_ALLOW_LOCAL=1 lifts the
// address check and allows http (tests).

const userAgent = 'Mozilla/5.0 (compatible; LinkPreview/1.0)';

function privateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224;
  }
  const value = address.toLowerCase();
  if (value.startsWith('::ffff:')) return privateAddress(value.slice(7));
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80');
}

async function checkTarget(url, env) {
  const local = env.LINK_PREVIEW_ALLOW_LOCAL === '1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('Нужна ссылка https://');
  if (local) return;
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) throw new Error('Такой адрес не открыть');
  const addresses = net.isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new Error('Такой адрес не открыть');
}

async function readLimited(response, maxBytes, truncate) {
  const reader = response.body?.getReader?.();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      reader.cancel().catch(() => {});
      if (!truncate) throw new Error('Файл слишком большой');
      chunks.push(Buffer.from(value.subarray(0, value.length - (size - maxBytes))));
      break;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function safeFetch(value, { env = {}, accept = '*/*', maxBytes = 2 * 1024 * 1024, truncate = false, timeout = 8000, headers = {} } = {}) {
  let url = new URL(value);
  for (let hop = 0; hop < 4; hop += 1) {
    await checkTarget(url, env);
    const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': userAgent, Accept: accept, 'Accept-Language': 'ru,en;q=0.8', ...headers }, signal: AbortSignal.timeout(timeout) });
    const location = response.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      response.body?.cancel?.().catch(() => {});
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      response.body?.cancel?.().catch(() => {});
      throw new Error(`Страница ответила ${response.status}`);
    }
    return { url: url.href, type: response.headers.get('content-type') || '', headers: response.headers, bytes: await readLimited(response, maxBytes, truncate) };
  }
  throw new Error('Слишком много переадресаций');
}

/* Reading pages */

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' };
export function decodeEntities(text) {
  return String(text || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const number = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(number) && number > 0 && number < 0x110000 ? String.fromCodePoint(number) : match;
    }
    return entities[code.toLowerCase()] ?? match;
  });
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? '';
  return result;
}

// HTML (a store description, a README rendered to HTML) to plain text with paragraphs and list lines.
export function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+(?=• )/g, '\n')
    .trim();
}

export function parseMeta(html, base) {
  const head = String(html || '').slice(0, 600000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const key = item => (item.property || item.name || item.itemprop || '').toLowerCase();
  const get = (...names) => {
    for (const name of names) {
      const found = metas.find(item => key(item) === name && item.content);
      if (found) return decodeEntities(found.content).trim();
    }
    return '';
  };
  const absolute = value => { try { const url = new URL(decodeEntities(value), base); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''; } catch { return ''; } };
  const images = [...new Set(metas.filter(item => ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(key(item)) && item.content).map(item => absolute(item.content)).filter(Boolean))];
  return {
    title: get('og:title', 'twitter:title') || decodeEntities(/<title[^>]*>([^<]{1,300})/i.exec(head)?.[1] || '').trim(),
    description: get('og:description', 'twitter:description', 'description'),
    site: get('og:site_name'),
    keywords: get('keywords').split(',').map(item => item.trim()).filter(Boolean),
    images
  };
}

/* Shaping a draft */

const clip = (text, max) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return sentence > max * 0.5 ? cut.slice(0, sentence + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
};

// A page from a long description: a heading, the first paragraphs and the list lines as a list.
export function pageFromText(text, heading) {
  const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean);
  const bullets = lines.filter(line => /^[•\-*–✓✔►▸]\s*/.test(line)).map(line => line.replace(/^[•\-*–✓✔►▸]\s*/, '')).filter(line => line.length > 2 && line.length < 200).slice(0, 8);
  const paragraphs = lines.filter(line => !/^[•\-*–✓✔►▸]\s*/.test(line) && line.length > 40).slice(0, 3);
  const blocks = [];
  if (paragraphs.length || bullets.length) blocks.push({ type: 'heading', text: heading });
  for (const paragraph of paragraphs) blocks.push({ type: 'text', text: clip(paragraph, 900) });
  if (bullets.length) blocks.push({ type: 'list', items: bullets });
  return blocks;
}

const gameHosts = ['store.steampowered.com', 'itch.io', 'vkplay.ru', 'gog.com', 'gamejolt.com'];
const appHosts = ['apps.apple.com', 'play.google.com', 'rustore.ru'];
const hostOf = url => new URL(url).hostname.replace(/^www\./, '');
const onHost = (host, list) => list.some(item => host === item || host.endsWith(`.${item}`));

export function steamDraft(data, url) {
  const description = htmlToText(data.about_the_game || data.detailed_description || '');
  const platforms = Object.entries(data.platforms || {}).filter(([, on]) => on).map(([name]) => name).filter(name => ['windows', 'mac', 'linux'].includes(name));
  const images = [data.header_image, ...(data.screenshots || []).map(item => item.path_full)].filter(Boolean).slice(0, 6);
  return {
    source: 'Steam',
    title: clip(data.name, 80),
    summary: clip(htmlToText(data.short_description) || description, 160),
    description: clip(description, 2400),
    category: 'games',
    tags: (data.genres || []).map(item => item.description).filter(Boolean).slice(0, 5),
    platforms,
    pricing: data.is_free ? 'free' : 'paid',
    stage: data.release_date?.coming_soon ? (data.demos?.length ? 'demo' : 'beta') : 'release',
    links: [url],
    images,
    page: pageFromText(description, 'Об игре'),
    text: description
  };
}

export function githubDraft(repo, readme, url) {
  const markdown = String(readme || '');
  const text = markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^#+\s*(.*)$/gm, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/^\s*[-*+]\s+/gm, '• ');
  const owner = repo.owner?.login || '';
  const pictures = [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g), ...markdown.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(match => match[1])
    .map(src => /^https?:/i.test(src) ? src : `https://raw.githubusercontent.com/${owner}/${repo.name}/HEAD/${src.replace(/^\.?\//, '')}`)
    .filter(src => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(src) && !/shields\.io|badge|travis-ci|codecov/i.test(src));
  const links = [url, repo.homepage].filter(item => /^https:\/\//.test(item || ''));
  return {
    source: 'GitHub',
    title: clip(repo.name?.replace(/[-_]+/g, ' '), 80),
    summary: clip(repo.description || text.split('\n').find(line => line.length > 30) || '', 160),
    description: clip(text, 2400),
    category: 'tools',
    tags: [...(repo.topics || []), repo.language].filter(Boolean).slice(0, 5),
    platforms: [],
    pricing: 'open',
    stage: '',
    links: [...new Set(links)],
    images: [...new Set([...pictures.slice(0, 4), `https://opengraph.githubassets.com/1/${owner}/${repo.name}`])].slice(0, 5),
    page: pageFromText(text, 'О проекте'),
    text
  };
}

export function metaDraft(meta, html, url) {
  const host = hostOf(url);
  const games = onHost(host, gameHosts);
  const shots = host.endsWith('itch.io') ? [...new Set([...String(html).matchAll(/https:\/\/img\.itch\.zone\/[^"'\s)<>]+/g)].map(match => decodeEntities(match[0])))] : [];
  const longText = host.endsWith('itch.io') ? htmlToText(/<div class="formatted_description[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(html)?.[1] || '') : '';
  const text = longText || meta.description;
  const title = clip(meta.title.replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, ''), 80);
  return {
    source: meta.site || host,
    title,
    summary: clip(meta.description || text, 160),
    description: clip(text, 2400),
    category: games ? 'games' : onHost(host, appHosts) ? 'apps' : 'apps',
    tags: meta.keywords.slice(0, 5),
    platforms: host === 'apps.apple.com' ? ['ios'] : onHost(host, ['play.google.com', 'rustore.ru']) ? ['android'] : [],
    pricing: '',
    stage: '',
    links: [url],
    images: [...new Set([...meta.images, ...shots])].slice(0, 6),
    page: pageFromText(text, games ? 'Об игре' : 'О проекте'),
    text
  };
}

export async function linkDraft(value, env = {}) {
  const url = new URL(value);
  const host = hostOf(url.href);
  const steam = host === 'store.steampowered.com' && /\/app\/(\d+)/.exec(url.pathname)?.[1];
  if (steam) {
    const api = await safeFetch(`https://store.steampowered.com/api/appdetails?appids=${steam}&l=russian&cc=ru`, { env, accept: 'application/json' });
    const data = JSON.parse(api.bytes.toString('utf8'))?.[steam];
    if (!data?.success || !data.data) throw new Error('Steam не отдал страницу игры');
    return steamDraft(data.data, url.href);
  }
  const repo = host === 'github.com' && /^\/([\w.-]+)\/([\w.-]+)/.exec(url.pathname);
  if (repo) {
    const name = repo[2].replace(/\.git$/, '');
    const api = await safeFetch(`https://api.github.com/repos/${repo[1]}/${name}`, { env, accept: 'application/vnd.github+json' });
    const data = JSON.parse(api.bytes.toString('utf8'));
    let readme = '';
    try { readme = (await safeFetch(`https://api.github.com/repos/${repo[1]}/${name}/readme`, { env, accept: 'application/vnd.github.raw', maxBytes: 400000, truncate: true })).bytes.toString('utf8'); } catch {}
    return githubDraft(data, readme, url.href);
  }
  const page = await safeFetch(url.href, { env, accept: 'text/html,application/xhtml+xml', maxBytes: 1500000, truncate: true });
  if (!/html|xml/i.test(page.type)) throw new Error('По ссылке не страница');
  const html = page.bytes.toString('utf8');
  const meta = parseMeta(html, page.url);
  if (!meta.title && !meta.description) throw new Error('На странице нет описания');
  return metaDraft(meta, html, url.href);
}

// Whether a page lets itself be shown inside another site. null when it could not be checked.
export async function embeddable(value, env = {}, origin = '') {
  try {
    const page = await safeFetch(value, { env, accept: 'text/html', maxBytes: 64 * 1024, truncate: true, timeout: 6000 });
    const frame = String(page.headers.get('x-frame-options') || '').toLowerCase();
    if (frame.includes('deny') || frame.includes('sameorigin')) return false;
    const ancestors = /frame-ancestors([^;]*)/i.exec(page.headers.get('content-security-policy') || '')?.[1]?.trim();
    if (ancestors !== undefined && !ancestors.split(/\s+/).some(item => item === '*' || item === 'https:' || (origin && item === origin))) return false;
    return true;
  } catch {
    return null;
  }
}
