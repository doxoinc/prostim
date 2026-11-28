import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
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
  payments: {},
  notifications: {},
  pushSubs: {},
  blocks: {},
  reports: [],
  feedPrefs: {},
  secrets: {}
});

export const uploadTypes = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/mp4', weba: 'audio/webm', m4a: 'audio/mp4', ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav' };

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
    },
    async getUploadRange(name, start, length) {
      let handle;
      try {
        handle = await open(path.join(uploadsDir, path.basename(name)));
        const { size } = await handle.stat();
        const bytes = Buffer.alloc(Math.max(0, Math.min(length, size - start)));
        if (bytes.length) await handle.read(bytes, 0, bytes.length, start);
        return { bytes, size, type: uploadTypes[name.split('.').pop()] || 'application/octet-stream' };
      } catch {
        return null;
      } finally {
        await handle?.close();
      }
    },
    async uploadRows() {
      const names = await readdir(uploadsDir).catch(() => []);
      return Promise.all(names.map(async name => {
        const info = await stat(path.join(uploadsDir, name)).catch(() => null);
        return { name, size: info?.size || 0, at: info?.mtimeMs || 0 };
      }));
    },
    async deleteUploads(names) {
      for (const name of names) await unlink(path.join(uploadsDir, path.basename(name))).catch(() => {});
    },
    async storage() {
      const rows = await this.uploadRows();
      const state = (await stat(file).catch(() => null))?.size || 0;
      const uploads = rows.reduce((sum, row) => sum + row.size, 0);
      return { total: uploads + state, uploads, files: rows.length };
    },
    async vacuum() {}
  };
}

// Files go into Postgres in parts of 1 MB. The free Render database has 256 MB of memory and 0.1 CPU:
// one INSERT with a whole 40 MB video (80 MB as text on the wire) made it run out of memory and restart,
// and every upload and save failed while it recovered. Small parts keep each query light.
const PART = 1024 * 1024;

async function openPostgres(url) {
  const { default: pg } = await import('pg');
  const host = new URL(url).hostname;
  const ssl = /sslmode=disable/.test(url) || !host.includes('.') ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: url, ssl, max: 4, connectionTimeoutMillis: 15000 });
  // An idle connection dropped by a database restart must not take the whole server down.
  pool.on('error', error => console.warn('postgres connection lost:', error.message));
  await pool.query('create table if not exists prostim_state (id integer primary key, data jsonb not null, updated_at timestamptz not null default now())');
  await pool.query('create table if not exists prostim_uploads (name text primary key, type text not null, data bytea not null, created_at timestamptz not null default now())');
  await pool.query('create table if not exists prostim_files (name text primary key, type text not null, size bigint not null, created_at timestamptz not null default now())');
  await pool.query('create table if not exists prostim_file_parts (name text not null, part integer not null, data bytea not null, primary key (name, part))');
  // Media is already compressed: storing parts as they are saves the database a pointless compression pass.
  await pool.query('alter table prostim_file_parts alter column data set storage external').catch(() => {});
  const result = await pool.query('select data from prostim_state where id = 1');
  const data = { ...empty(), ...(result.rows[0]?.data || {}) };
  let timer = null;
  let writing = Promise.resolve();
  function flush() {
    clearTimeout(timer);
    timer = null;
    const snapshot = JSON.stringify(data);
    writing = writing.then(() => pool.query('insert into prostim_state (id, data, updated_at) values (1, $1, now()) on conflict (id) do update set data = excluded.data, updated_at = now()', [snapshot]))
      .catch(error => {
        console.error('db write failed:', error.message);
        // Try again a little later: the state is written whole, so the next save catches up on everything.
        if (!timer) timer = setTimeout(flush, 5000);
      });
    return writing;
  }
  const typeOf = name => uploadTypes[name.split('.').pop()] || 'application/octet-stream';
  // Uploads written before the parts table: one row each. Big ones are read in slices too.
  async function legacyRange(name, start, length) {
    const row = (await pool.query('select type, octet_length(data)::bigint as size from prostim_uploads where name = $1', [name])).rows[0];
    if (!row) return null;
    const size = Number(row.size);
    const end = Math.min(size, start + Math.max(0, length));
    const pieces = [];
    for (let offset = start; offset < end; offset += PART) {
      const take = Math.min(PART, end - offset);
      pieces.push((await pool.query('select substring(data from $2 for $3) as part from prostim_uploads where name = $1', [name, offset + 1, take])).rows[0]?.part || Buffer.alloc(0));
    }
    return { bytes: Buffer.concat(pieces), size, type: row.type };
  }
  async function fileRange(name, start, length) {
    const file = (await pool.query('select type, size from prostim_files where name = $1', [name])).rows[0];
    if (!file) return legacyRange(name, start, length);
    const size = Number(file.size);
    const end = Math.min(size, start + Math.max(0, length));
    if (end <= start) return { bytes: Buffer.alloc(0), size, type: file.type };
    const first = Math.floor(start / PART);
    const last = Math.floor((end - 1) / PART);
    const rows = (await pool.query('select data from prostim_file_parts where name = $1 and part between $2 and $3 order by part', [name, first, last])).rows;
    const joined = Buffer.concat(rows.map(row => row.data));
    const offset = start - first * PART;
    return { bytes: joined.subarray(offset, offset + (end - start)), size, type: file.type };
  }
  console.log('Storage: Postgres');
  return {
    kind: 'postgres',
    data,
    save() { if (!timer) timer = setTimeout(flush, 800); },
    flush,
    async putUpload(name, bytes) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('insert into prostim_files (name, type, size) values ($1, $2, $3) on conflict (name) do nothing', [name, typeOf(name), bytes.length]);
        for (let part = 0; part * PART < bytes.length || part === 0; part += 1) {
          await client.query('insert into prostim_file_parts (name, part, data) values ($1, $2, $3) on conflict (name, part) do nothing', [name, part, bytes.subarray(part * PART, (part + 1) * PART)]);
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async getUpload(name) {
      const found = await fileRange(name, 0, Number.MAX_SAFE_INTEGER);
      return found ? { bytes: found.bytes, type: found.type } : null;
    },
    // A slice of a big file, so a video is streamed in pieces instead of being read whole for every request.
    getUploadRange: fileRange,
    async uploadRows() {
      const rows = (await pool.query('select name, size, created_at from prostim_files union all select name, octet_length(data)::bigint, created_at from prostim_uploads')).rows;
      return rows.map(row => ({ name: row.name, size: Number(row.size), at: new Date(row.created_at).getTime() }));
    },
    async deleteUploads(names) {
      if (!names.length) return;
      await pool.query('delete from prostim_file_parts where name = any($1::text[])', [names]);
      await pool.query('delete from prostim_files where name = any($1::text[])', [names]);
      await pool.query('delete from prostim_uploads where name = any($1::text[])', [names]);
    },
    async storage() {
      const row = (await pool.query('select pg_database_size(current_database())::bigint as total, (select coalesce(sum(size), 0) from prostim_files)::bigint + (select coalesce(sum(octet_length(data)), 0) from prostim_uploads)::bigint as uploads, (select count(*) from prostim_files)::int + (select count(*) from prostim_uploads)::int as files')).rows[0];
      return { total: Number(row.total), uploads: Number(row.uploads), files: row.files };
    },
    // Deleted files leave dead rows behind; a plain VACUUM lets Postgres reuse their space.
    async vacuum() {
      for (const table of ['prostim_file_parts', 'prostim_files', 'prostim_uploads', 'prostim_state']) await pool.query(`vacuum ${table}`);
    }
  };
}
