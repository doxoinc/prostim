// Feed recommendations, shared by the browser and the server.
// Taste: what one person is drawn to (categories, tags, authors, media), learned from what they watch and do.
// Quality: how a post holds everyone's attention (retention, skips) plus votes, saves, comments and shares.
// The catalogue is small, so ranking never drops a post: it only reorders, and seen posts come back as fatigue fades.

export const TASTE_HALF_LIFE_DAYS = 10;
export const QUICK_SKIP_MS = 1200;
export const tasteSignals = { vote: 2, unvote: -1.5, save: 2.5, unsave: -2, comment: 2.2, share: 2.5, repost: 3, play: 2.5, wishlist: 2, open: 1, slide: 0.3, rewatch: 0.6, follow: 3, unfollow: -3, hide: -4 };
export const statSignals = ['view', 'open', 'share', 'rewatch', 'hide', 'play', 'wishlist'];

const tasteFeatureShare = { cat: 0.6, tag: 0.5, author: 0.8, media: 0.25 };
const tasteLimits = { features: 160, seen: 400, min: -6, max: 12 };
const tasteDayMs = 864e5;

export function emptyTaste() {
  return { v: 1, signals: 0, updatedAt: 0, weights: {}, seen: {} };
}

export function emptyStats() {
  return { impressions: 0, views: 0, completes: 0, skips: 0, dwellMs: 0, opens: 0, shares: 0, rewatches: 0, hides: 0, plays: 0, wishlists: 0 };
}

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

export function cleanTaste(value) {
  const taste = emptyTaste();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return taste;
  taste.signals = Math.max(0, Math.floor(finite(value.signals)));
  taste.updatedAt = Math.max(0, finite(value.updatedAt));
  for (const [key, weight] of Object.entries(value.weights || {})) {
    if (/^(cat|tag|author|media):.{1,60}$/.test(key) && Number.isFinite(weight)) taste.weights[key] = Math.max(tasteLimits.min, Math.min(tasteLimits.max, weight));
  }
  for (const [id, entry] of Object.entries(value.seen || {})) {
    if (/^[\w-]{1,80}$/.test(id) && entry && typeof entry === 'object') taste.seen[id] = { n: Math.max(1, Math.floor(finite(entry.n, 1))), last: finite(entry.last), done: finite(entry.done) ? 1 : 0 };
  }
  return taste;
}

export function cleanStats(value) {
  const stats = emptyStats();
  if (!value || typeof value !== 'object') return stats;
  for (const key of Object.keys(stats)) stats[key] = Math.max(0, finite(value[key]));
  return stats;
}

export function projectFeatures(project) {
  const features = [];
  if (project.category) features.push(`cat:${project.category}`);
  for (const tag of (project.tags || []).slice(0, 6)) {
    const name = String(tag).toLocaleLowerCase('ru').trim().slice(0, 40);
    if (name) features.push(`tag:${name}`);
  }
  if (project.handle) features.push(`author:${project.handle}`);
  const media = project.media || [];
  features.push(`media:${media.some(item => item.type === 'video') ? 'video' : media.length ? 'image' : 'scene'}`);
  return features;
}

// How long a person needs to "get" a post: a few seconds per slide, the clip length for video.
export function expectedDwell(project, videoSeconds = 0) {
  if (videoSeconds > 0) return Math.min(30000, Math.max(3000, videoSeconds * 1000));
  const slides = Math.max(1, Math.min(8, finite(project.slides, 1) || (project.media || []).length || 1));
  return Math.min(12000, 3500 + 1500 * (slides - 1));
}

// Watching longer than expected is a strong yes, a flick past in about a second is a no.
export function viewValue(dwell, expected) {
  if (dwell < QUICK_SKIP_MS) return -0.6;
  const ratio = Math.min(3, dwell / Math.max(1500, expected));
  return Math.max(-0.3, Math.min(1.6, Math.log2(1 + ratio) - 0.2));
}

function signalValue(signal) {
  if (signal.type === 'view') return viewValue(finite(signal.dwell), finite(signal.expected, 4000));
  return tasteSignals[signal.type] || 0;
}

function decayTaste(taste, now) {
  if (!taste.updatedAt || now <= taste.updatedAt) return;
  const factor = 0.5 ** ((now - taste.updatedAt) / (TASTE_HALF_LIFE_DAYS * tasteDayMs));
  if (factor > 0.999) return;
  for (const key of Object.keys(taste.weights)) {
    taste.weights[key] *= factor;
    if (Math.abs(taste.weights[key]) < 0.01) delete taste.weights[key];
  }
}

function pruneTaste(taste) {
  const keys = Object.keys(taste.weights);
  if (keys.length > tasteLimits.features) {
    keys.sort((left, right) => Math.abs(taste.weights[right]) - Math.abs(taste.weights[left]));
    for (const key of keys.slice(tasteLimits.features)) delete taste.weights[key];
  }
  const seen = Object.entries(taste.seen);
  if (seen.length > tasteLimits.seen) {
    seen.sort((left, right) => right[1].last - left[1].last);
    taste.seen = Object.fromEntries(seen.slice(0, tasteLimits.seen));
  }
}

// Updates a taste in place: one signal spreads over the post's category, tags, author and media type.
export function recordSignal(taste, project, signal, now = Date.now()) {
  decayTaste(taste, now);
  const value = signalValue(signal);
  const features = signal.type === 'follow' || signal.type === 'unfollow'
    ? (project.handle ? [`author:${project.handle}`] : [])
    : projectFeatures(project);
  const tagCount = features.filter(feature => feature.startsWith('tag:')).length || 1;
  for (const feature of features) {
    const kind = feature.slice(0, feature.indexOf(':'));
    const share = signal.type === 'follow' || signal.type === 'unfollow' ? 1 : (tasteFeatureShare[kind] || 0.3) / (kind === 'tag' ? Math.sqrt(tagCount) : 1);
    taste.weights[feature] = Math.max(tasteLimits.min, Math.min(tasteLimits.max, (taste.weights[feature] || 0) + value * share));
  }
  if (project.id && (signal.type === 'view' || signal.type === 'hide')) {
    const previous = taste.seen[project.id];
    const done = signal.type === 'view' && finite(signal.dwell) >= finite(signal.expected, 4000) ? 1 : 0;
    taste.seen[project.id] = { n: (previous?.n || 0) + (signal.type === 'hide' ? 3 : 1), last: now, done: Math.max(previous?.done || 0, done) };
  }
  if (value) taste.signals += 1;
  taste.updatedAt = now;
  pruneTaste(taste);
  return taste;
}

// Audience-level counters for one post; votes, saves and comments are counted where they are stored.
export function recordStat(stats, signal) {
  if (signal.type === 'view') {
    const dwell = Math.max(0, Math.min(120000, finite(signal.dwell)));
    stats.impressions += 1;
    stats.dwellMs += dwell;
    if (dwell < QUICK_SKIP_MS) stats.skips += 1;
    else {
      stats.views += 1;
      if (dwell >= finite(signal.expected, 4000)) stats.completes += 1;
    }
  } else if (signal.type === 'open') stats.opens += 1;
  else if (signal.type === 'share') stats.shares += 1;
  else if (signal.type === 'rewatch') stats.rewatches += 1;
  else if (signal.type === 'hide') stats.hides += 1;
  else if (signal.type === 'play') stats.plays += 1;
  else if (signal.type === 'wishlist') stats.wishlists += 1;
  return stats;
}

// Interest of a post for everyone: smoothed with priors so a post with three views is not judged on luck.
export function projectQuality(project, rawStats) {
  const stats = cleanStats(rawStats);
  const prior = 8;
  const retention = (stats.completes + 0.5 * (stats.views - stats.completes) + prior * 0.45) / (stats.impressions + prior);
  const skipRate = (stats.skips + stats.hides * 2 + prior * 0.25) / (stats.impressions + prior);
  const votes = finite(project.votes);
  const saves = finite(project.saves);
  const comments = Array.isArray(project.comments) ? project.comments.length : finite(project.comments);
  const popularity = Math.min(1, Math.log1p(votes + 2 * saves + 2 * comments + 3 * stats.shares) / Math.log1p(400));
  const actionRate = Math.min(1, (stats.opens + 2 * stats.shares + stats.rewatches + 2 * stats.plays + 1.5) / (stats.impressions + 10));
  const score = 0.35 * retention + 0.2 * (1 - Math.min(1, skipRate)) + 0.3 * popularity + 0.15 * actionRate;
  return { score, retention, skipRate: Math.min(1, skipRate), popularity, actionRate, impressions: stats.impressions, averageDwell: stats.impressions ? stats.dwellMs / stats.impressions : 0 };
}

function hashUnit(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4294967296;
}

// What a person told the feed directly: more of a topic, less of it, or never. Stronger than taste,
// because it was asked for.
function prefsScore(features, prefs) {
  if (!prefs) return 0;
  let value = 0;
  for (const feature of features) {
    if (prefs.more?.includes(feature)) value += 0.45;
    if (prefs.less?.includes(feature)) value -= 0.55;
  }
  return Math.max(-1.2, Math.min(0.9, value));
}

export function hiddenByPrefs(project, prefs) {
  return Boolean(prefs?.hidden?.length) && projectFeatures(project).some(feature => prefs.hidden.includes(feature));
}

export function tasteConfidence(taste) {
  return taste.signals / (taste.signals + 12);
}

// Orders posts for one person. New people get the best and freshest posts; as signals pile up, taste takes over.
// A fresh update makes a seen post new again; a repost by someone the person follows lifts a post too.
// mode 'discover' turns taste around: topics and authors the person has not met yet go first, so the feed
// tries new waves of interest instead of repeating the known ones. Posts the person dislikes stay out.
export function rankFeed(list, { taste = emptyTaste(), stats = {}, now = Date.now(), seed = 1, follows = [], me = '', pinned = '', prefs = null, reposts = null, watching = [], mode = 'foryou' } = {}) {
  const confidence = tasteConfidence(taste);
  const scored = list.map(project => {
    const quality = projectQuality(project, stats[project.id]).score;
    const features = projectFeatures(project);
    const tagCount = features.filter(feature => feature.startsWith('tag:')).length || 1;
    const raw = features.reduce((sum, feature) => sum + (taste.weights[feature] || 0) / (feature.startsWith('tag:') ? Math.sqrt(tagCount) : 1), 0);
    const personal = Math.tanh(raw / 4);
    const ageHours = Math.max(0, (now - (finite(project.createdAt) || now)) / 36e5);
    const seen = taste.seen[project.id];
    const updatedAt = finite(project.lastUpdateAt);
    const updateHours = updatedAt ? Math.max(0, (now - updatedAt) / 36e5) : Infinity;
    const freshUpdate = updateHours < 168 && (!seen || seen.last < updatedAt);
    const fresh = Math.max(Math.exp(-ageHours / 96), freshUpdate ? 0.8 * Math.exp(-updateHours / 72) : 0);
    const hoursSinceSeen = seen ? (now - seen.last) / 36e5 : Infinity;
    const fatigue = seen ? Math.min(0.95, (0.35 + 0.15 * Math.min(seen.n, 4) + 0.2 * seen.done) * Math.exp(-hoursSinceSeen / 18)) * (freshUpdate ? 0.3 : 1) : 0;
    const followed = follows.includes(project.handle);
    const watched = watching.includes(project.id);
    const reposter = reposts?.get?.(project.id) || '';
    const own = Boolean(me) && project.handle === me;
    const asked = prefsScore(features, prefs);
    const known = features.filter(feature => !feature.startsWith('media:')).some(feature => Math.abs(taste.weights[feature] || 0) > 0.5);
    const discover = mode === 'discover'
      ? 0.4 * quality + 0.2 * fresh + (known ? 0 : 0.55) - Math.max(0, personal) * 0.35 - (personal < -0.3 ? 1 : 0) + Math.min(0, asked) + (seen ? 0 : 0.45) - 1.2 * fatigue - (own || followed ? 0.6 : 0) + hashUnit(`${seed}:d:${project.id}`) * 0.3
      : null;
    const score = discover ?? 0.45 * quality + 0.2 * fresh + personal * (0.2 + 0.5 * confidence) + asked + (seen ? 0 : 0.3) + (followed ? 0.2 : 0) + (reposter ? 0.25 : 0) + (freshUpdate && (followed || watched) ? 0.3 : 0) - fatigue - (own ? 0.25 : 0) + hashUnit(`${seed}:${project.id}`) * 0.12 + (project.id === pinned ? 100 : 0);
    let reason = 'discover';
    if (mode === 'discover') return { project, score, reason: own ? 'mine' : !known ? 'discover' : !seen && ageHours < 72 ? 'new' : 'discover', personal, quality, by: '' };
    if (project.id === pinned || own) reason = 'mine';
    else if (!seen && ageHours < 72) reason = 'new';
    else if (freshUpdate && (watched || followed || seen)) reason = 'update';
    else if (reposter) reason = 'repost';
    else if (followed) reason = 'follow';
    else if (personal > 0.25 && confidence > 0.25) reason = 'taste';
    else if (seen) reason = 'again';
    else if (quality > 0.5) reason = 'popular';
    return { project, score, reason, personal, quality, by: reason === 'repost' ? reposter : '' };
  });
  const ranked = [];
  while (scored.length) {
    let bestIndex = 0;
    let best = -Infinity;
    const last = ranked[ranked.length - 1]?.project;
    const beforeLast = ranked[ranked.length - 2]?.project;
    scored.forEach((item, index) => {
      let value = item.score;
      if (last?.handle === item.project.handle) value -= 0.3;
      if (last?.category === item.project.category) value -= 0.1;
      if (beforeLast?.handle === item.project.handle) value -= 0.1;
      if (value > best) { best = value; bestIndex = index; }
    });
    ranked.push(scored.splice(bestIndex, 1)[0]);
  }
  return ranked;
}

// Strongest positive interests, for showing a person what the feed has learned about them.
export function topInterests(taste, limit = 6) {
  return Object.entries(taste.weights)
    .filter(([key, weight]) => weight > 0.3 && !key.startsWith('media:'))
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key, weight]) => ({ kind: key.slice(0, key.indexOf(':')), value: key.slice(key.indexOf(':') + 1), weight }));
}
