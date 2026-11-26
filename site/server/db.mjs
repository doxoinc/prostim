import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const empty = () => ({
  version: 1,
  users: {},
  sessions: {},
  projects: [],
  follows: {},
  ratings: [],
  topics: [],
  messages: [],
  reads: {},
  applications: [],
  devices: {},
  workspaces: {},
  tasks: {},
  pairCodes: {},
  uploads: {},
  tastes: {},
  feedStats: {},
  emailCodes: {},
  promotions: [],
  payments: {}
});

export const uploadTypes = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/mp4' };

// The pilot keeps the whole state as one JSON document: a file locally, a Postgres row on hosting
// where the disk is wiped on every restart. Writes are debounced; uploads are stored next to it.
export async function openDatabase({ directory, url }) {
  return url ? openPostgres(url) : openFile(directory);
}

async function openFile(directory) {
  const file = path.join(directory, 'db.json');
  const uploadsDir = path.join(directory, 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  let data = empty();
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed && typeof parsed === 'object') data = { ...empty(), ...parsed };
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('db.json unreadable, starting fresh:', error.message);
  }
  let timer = null;
  let writing = Promise.resolve();
  function flush() {
    clearTimeout(timer);
    timer = null;
    const snapshot = JSON.stringify(data);
    writing = writing.then(async () => {
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, snapshot);
      await rename(temporary, file);
    }).catch(error => console.error('db write failed:', error.message));
    return writing;
  }
  return {
    kind: 'file',
    data,
    save() { if (!timer) timer = setTimeout(flush, 250); },
    flush,
    async putUpload(name, bytes) { await writeFile(path.join(uploadsDir, name), bytes); },
    async getUpload(name) {
      try { return { bytes: await readFile(path.join(uploadsDir, path.basename(name))), type: uploadTypes[name.split('.').pop()] || 'application/octet-stream' }; } catch { return null; }
    }
  };
}

async function openPostgres(url) {
  const { default: pg } = await import('pg');
  const host = new URL(url).hostname;
  const ssl = /sslmode=disable/.test(url) || !host.includes('.') ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: url, ssl, max: 4 });
  await pool.query('create table if not exists prostim_state (id integer primary key, data jsonb not null, updated_at timestamptz not null default now())');
  await pool.query('create table if not exists prostim_uploads (name text primary key, type text not null, data bytea not null, created_at timestamptz not null default now())');
  const result = await pool.query('select data from prostim_state where id = 1');
  const data = { ...empty(), ...(result.rows[0]?.data || {}) };
  let timer = null;
  let writing = Promise.resolve();
  function flush() {
    clearTimeout(timer);
    timer = null;
    const snapshot = JSON.stringify(data);
    writing = writing.then(() => pool.query('insert into prostim_state (id, data, updated_at) values (1, $1, now()) on conflict (id) do update set data = excluded.data, updated_at = now()', [snapshot]))
      .catch(error => console.error('db write failed:', error.message));
    return writing;
  }
  console.log('Storage: Postgres');
  return {
    kind: 'postgres',
    data,
    save() { if (!timer) timer = setTimeout(flush, 800); },
    flush,
    async putUpload(name, bytes) {
      await pool.query('insert into prostim_uploads (name, type, data) values ($1, $2, $3) on conflict (name) do nothing', [name, uploadTypes[name.split('.').pop()] || 'application/octet-stream', bytes]);
    },
    async getUpload(name) {
      const row = (await pool.query('select type, data from prostim_uploads where name = $1', [name])).rows[0];
      return row ? { bytes: row.data, type: row.type } : null;
    }
  };
}
