export const STORAGE_KEY = 'prostim-preview-v1';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function toggleMembership(values, value) {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}

export function loadState(storage) {
  const defaults = { votes: [], saved: [], follows: [], comments: {}, projects: [], topics: [], replies: {}, applications: [], dms: {}, readiness: [], read: [] };
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
    const result = { ...defaults };
    for (const key of ['votes', 'saved', 'follows', 'readiness', 'read']) {
      result[key] = Array.isArray(parsed[key]) ? [...new Set(parsed[key].filter(item => typeof item === 'string'))] : [];
    }
    for (const key of ['comments', 'replies']) {
      const source = parsed[key];
      result[key] = source && typeof source === 'object' && !Array.isArray(source)
        ? Object.fromEntries(Object.entries(source).filter(([, items]) => Array.isArray(items)).map(([id, items]) => [id, items.filter(item => item && typeof item.text === 'string' && typeof item.name === 'string')]))
        : {};
    }
    result.projects = Array.isArray(parsed.projects) ? parsed.projects.filter(project => project && typeof project.id === 'string' && /^[a-zA-Z0-9-]+$/.test(project.id) && typeof project.title === 'string' && typeof project.summary === 'string' && ['games', 'apps', 'tools'].includes(project.category)).map(project => ({ ...project, handle: /^[a-zA-Z0-9-]+$/.test(project.handle || '') ? project.handle : 'me', color: /^#[0-9a-f]{6}$/i.test(project.color || '') ? project.color : '#e5e1d8', tags: Array.isArray(project.tags) ? project.tags.filter(tag => typeof tag === 'string') : [], votes: Number(project.votes) || 0, createdAt: Number(project.createdAt) || 0, slides: 1, scene: ['forest', 'coast', 'board', 'analytics'].includes(project.scene) ? project.scene : '', comments: [] })) : [];
    result.topics = Array.isArray(parsed.topics) ? parsed.topics.filter(topic => topic && typeof topic.id === 'string' && typeof topic.title === 'string').map(topic => ({ ...topic, replies: Array.isArray(topic.replies) ? topic.replies.filter(reply => typeof reply === 'string') : [] })) : [];
    result.applications = Array.isArray(parsed.applications) ? parsed.applications.filter(item => item && typeof item.title === 'string') : [];
    result.dms = parsed.dms && typeof parsed.dms === 'object' && !Array.isArray(parsed.dms)
      ? Object.fromEntries(Object.entries(parsed.dms).filter(([id, items]) => /^[a-zA-Z0-9-]+$/.test(id) && Array.isArray(items)).map(([id, items]) => [id, items.filter(item => item && (typeof item.text === 'string' || typeof item.sticker === 'string')).map(item => ({ text: typeof item.text === 'string' ? item.text : '', ...(typeof item.sticker === 'string' && /^[a-z]{2,12}$/.test(item.sticker) ? { sticker: item.sticker } : {}), time: typeof item.time === 'string' ? item.time : '' }))]))
      : {};
    return result;
  } catch {
    return defaults;
  }
}

export function filterProjects(projects, { category = 'all', tab = 'all', search = '', follows = [], saved = [] } = {}) {
  const query = search.trim().toLocaleLowerCase('ru');
  return projects.filter(project => {
    const matchesCategory = category === 'all' || project.category === category;
    const matchesTab = tab !== 'follows' || follows.includes(project.handle);
    const matchesSaved = tab !== 'saved' || saved.includes(project.id);
    const text = `${project.title} ${project.summary} ${project.author}`.toLocaleLowerCase('ru');
    return matchesCategory && matchesTab && matchesSaved && (!query || text.includes(query));
  });
}
