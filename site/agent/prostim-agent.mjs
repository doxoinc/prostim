#!/usr/bin/env node
// про.стим device agent: connects this computer to про.стим, runs Claude Code or Codex
// in the chosen project folders and streams every step back to the site.
// Files never leave the computer except what a task shows (steps, diffs, file you open).

import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = '0.3.0';
const MODES = ['read', 'edit', 'full'];
const configDir = path.join(os.homedir(), '.prostim');
const configFile = process.env.PROSTIM_AGENT_CONFIG || path.join(configDir, 'agent.json');
const SKIP = new Set(['.git', '.prostim', 'node_modules', 'dist', 'build', '.next', '.nuxt', '.venv', 'venv', '__pycache__', 'target', '.idea', '.vscode', '.DS_Store', 'Library', 'Temp', 'obj', '.gradle', 'Pods', 'DerivedData']);

if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error('Нужен Node.js 18 или новее: https://nodejs.org');
  process.exit(1);
}

/* CLI */

function parseArgs(argv) {
  const options = { dirs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === '--server') options.server = next();
    else if (arg === '--code') options.code = next();
    else if (arg === '--dir' || arg === '--add') options.dirs.push(next());
    else if (arg === '--name') options.name = next();
    else if (arg === '--allow') options.allow = next();
    else if (arg === '--engine') options.engine = next();
    else if (arg === '--remove') options.remove = next();
    else if (arg === '--list') options.list = true;
    else if (arg === '--forget') options.forget = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version') options.version = true;
  }
  return options;
}

const help = `про.стим агент ${VERSION}

Первое подключение (код берётся на сайте: ИИ-мир → Подключить):
  node prostim-agent.mjs --server https://сайт --code ABCD-EFGH --dir ./мой-проект

Дальше достаточно:
  node prostim-agent.mjs

Параметры:
  --dir <папка>      добавить папку проекта (можно несколько раз)
  --remove <папка>   убрать папку из списка
  --allow read|edit|full   предел для задач с сайта (по умолчанию edit)
                      read — только чтение и план, edit — правки файлов, full — правки и команды без вопросов
  --engine claude|codex|demo   движок по умолчанию (иначе первый найденный)
  --name <имя>       как компьютер называется на сайте
  --list             показать сохранённые настройки
  --forget           отвязать компьютер и удалить настройки`;

async function loadConfig() {
  try { return JSON.parse(await fs.readFile(configFile, 'utf8')); } catch { return null; }
}

async function saveConfig(config) {
  await fs.mkdir(path.dirname(configFile), { recursive: true, mode: 0o700 });
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function keyFor(dir) {
  return createHash('sha256').update(dir).digest('hex').slice(0, 16);
}

/* Helpers */

function run(command, args, { cwd, timeout = 15000, maxBuffer = 4 * 1024 * 1024 } = {}) {
  return new Promise(resolve => {
    execFile(command, args, { cwd, timeout, maxBuffer, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function clip(text, max) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}\n… (обрезано, ${value.length - max} символов)` : value;
}

function isInside(base, target) {
  const relative = path.relative(base, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveInside(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0')) throw new Error('Неверный путь');
  const realRoot = await fs.realpath(root);
  const target = path.resolve(realRoot, relative);
  if (!isInside(realRoot, target)) throw new Error('Путь вне папки проекта');
  let real;
  try { real = await fs.realpath(target); } catch { real = path.join(await fs.realpath(path.dirname(target)), path.basename(target)); }
  if (!isInside(realRoot, real)) throw new Error('Ссылка ведёт вне папки проекта');
  if (path.relative(realRoot, real).split(path.sep)[0] === '.git') throw new Error('Папка .git закрыта');
  return real;
}

function hashText(text) {
  return createHash('sha1').update(text).digest('hex');
}

function relativeTo(root, file) {
  if (!file || typeof file !== 'string') return '';
  const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);
  if (isInside(root, absolute)) return path.relative(root, absolute) || '.';
  try {
    const real = existsSync(root) ? path.resolve(root) : root;
    if (isInside(real, absolute)) return path.relative(real, absolute);
  } catch {}
  return path.basename(absolute);
}

// Small line diff: shared head and tail become context, the middle is removed/added.
function lineDiff(before, after, limit = 80) {
  const left = String(before ?? '').split('\n');
  const right = String(after ?? '').split('\n');
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let endLeft = left.length - 1;
  let endRight = right.length - 1;
  while (endLeft >= start && endRight >= start && left[endLeft] === right[endRight]) { endLeft -= 1; endRight -= 1; }
  const lines = [];
  for (const line of left.slice(Math.max(0, start - 2), start)) lines.push({ type: ' ', text: line });
  for (const line of left.slice(start, endLeft + 1)) lines.push({ type: '-', text: line });
  for (const line of right.slice(start, endRight + 1)) lines.push({ type: '+', text: line });
  for (const line of left.slice(endLeft + 1, endLeft + 3)) lines.push({ type: ' ', text: line });
  return lines.slice(0, limit).map(line => ({ type: line.type, text: clip(line.text, 300) }));
}

function parseUnifiedDiff(text, limit = 120) {
  const lines = [];
  for (const line of String(text || '').split('\n')) {
    if (/^(diff --git|index |--- |\+\+\+ )/.test(line)) continue;
    if (line.startsWith('@@')) lines.push({ type: '@', text: line });
    else if (line.startsWith('+')) lines.push({ type: '+', text: line.slice(1) });
    else if (line.startsWith('-')) lines.push({ type: '-', text: line.slice(1) });
    else if (line.startsWith(' ')) lines.push({ type: ' ', text: line.slice(1) });
    if (lines.length >= limit) break;
  }
  return lines.map(line => ({ type: line.type, text: clip(line.text, 300) }));
}

/* Engines */

function which(name) {
  const dirs = String(process.env.PATH || '').split(path.delimiter);
  const extra = [path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin'];
  for (const dir of [...dirs, ...extra]) {
    for (const candidate of process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`] : [name]) {
      const file = path.join(dir, candidate);
      if (dir && existsSync(file)) return file;
    }
  }
  return '';
}

function bundledClaude() {
  if (process.platform !== 'darwin') return '';
  const base = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code');
  try {
    const versions = readdirSync(base).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    for (const version of versions) {
      for (const build of readdirSync(path.join(base, version))) {
        const file = path.join(base, version, build, 'claude.app', 'Contents', 'MacOS', 'claude');
        if (existsSync(file)) return file;
      }
    }
  } catch {}
  return '';
}

async function detectEngines() {
  const engines = [];
  const claude = [process.env.PROSTIM_CLAUDE, which('claude'), bundledClaude()].find(file => file && existsSync(file));
  if (claude) {
    const version = await run(claude, ['--version'], { timeout: 15000 });
    const auth = await run(claude, ['auth', 'status'], { timeout: 15000 });
    let loggedIn = null;
    try { loggedIn = JSON.parse(auth.stdout).loggedIn; } catch {}
    engines.push({ id: 'claude', label: 'Claude Code', bin: claude, version: version.stdout.trim().split(' ')[0], ok: version.ok && loggedIn !== false, note: loggedIn === false ? 'Не выполнен вход: запусти «claude auth login» на этом компьютере' : '' });
  }
  const codex = [process.env.PROSTIM_CODEX, which('codex')].find(file => file && existsSync(file));
  if (codex) {
    const version = await run(codex, ['--version'], { timeout: 15000 });
    const status = await run(codex, ['login', 'status'], { timeout: 15000 });
    const loggedIn = /logged in/i.test(status.stdout + status.stderr) && !/not logged in/i.test(status.stdout + status.stderr);
    engines.push({ id: 'codex', label: 'Codex', bin: codex, version: version.stdout.trim().split(' ').pop(), ok: version.ok && loggedIn, note: loggedIn ? '' : 'Не выполнен вход: запусти «codex login» на этом компьютере' });
  }
  engines.push({ id: 'demo', label: 'Демо-движок', bin: '', version: VERSION, ok: true, note: 'Показывает шаги без модели, файлы не меняет' });
  return engines;
}

/* Agent state */

const options = parseArgs(process.argv.slice(2));
if (options.help) { console.log(help); process.exit(0); }
if (options.version) { console.log(VERSION); process.exit(0); }

let config = (await loadConfig()) || { workspaces: [] };

if (options.forget) {
  await fs.rm(configFile, { force: true });
  console.log('Настройки удалены. Устройство можно также отвязать на сайте.');
  process.exit(0);
}

for (const dir of options.dirs) {
  const absolute = path.resolve(dir.replace(/^~(?=$|\/)/, os.homedir()));
  const stats = await fs.stat(absolute).catch(() => null);
  if (!stats?.isDirectory()) { console.error(`Папка не найдена: ${absolute}`); process.exit(1); }
  const real = await fs.realpath(absolute);
  if (real === os.homedir() || real === path.parse(real).root) { console.error('Выбери папку конкретного проекта, а не домашнюю или корневую.'); process.exit(1); }
  if (!config.workspaces.some(item => item.dir === real)) config.workspaces.push({ key: keyFor(real), dir: real, name: path.basename(real) });
}
if (options.remove) {
  const target = path.resolve(options.remove);
  config.workspaces = config.workspaces.filter(item => item.dir !== target && item.name !== options.remove);
}
if (options.allow) {
  if (!MODES.includes(options.allow)) { console.error('--allow: read, edit или full'); process.exit(1); }
  config.allow = options.allow;
}
if (options.engine) config.engine = options.engine;
if (options.name) config.name = options.name;
config.allow ||= 'edit';
config.name ||= os.hostname().replace(/\.local$/, '');

if (options.list) {
  console.log(JSON.stringify({ ...config, token: config.token ? '••••' : undefined }, null, 2));
  process.exit(0);
}

if (options.code) {
  const server = String(options.server || config.server || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(server)) { console.error('Укажи адрес сайта: --server https://...'); process.exit(1); }
  const engines = await detectEngines();
  const response = await fetch(`${server}/api/agent/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: options.code, name: config.name, platform: `${os.platform()} ${os.arch()}`, allow: config.allow, engines: engines.map(({ bin, ...engine }) => engine) }) }).catch(error => ({ ok: false, json: async () => ({ error: error.message }) }));
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { console.error(`Не удалось привязать: ${result.error || response.status}`); process.exit(1); }
  Object.assign(config, { server, token: result.token, deviceId: result.deviceId, owner: result.owner });
  console.log(`✓ Компьютер привязан к аккаунту @${result.owner}`);
}

if (!config.token || !config.server) {
  console.log(help);
  process.exit(1);
}
if (!config.workspaces.length) {
  console.error('Добавь папку проекта: node prostim-agent.mjs --dir ./мой-проект');
  process.exit(1);
}
await saveConfig(config);

let engines = await detectEngines();
const tasks = new Map();
const queues = new Map();
const authHeaders = { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', 'User-Agent': `prostim-agent/${VERSION}` };

function workspaceByKey(key) {
  const workspace = config.workspaces.find(item => item.key === key);
  if (!workspace) throw new Error('Папка проекта не подключена на этом компьютере');
  return workspace;
}

async function api(pathname, body) {
  const response = await fetch(`${config.server}${pathname}`, { method: 'POST', headers: authHeaders, body: JSON.stringify(body) });
  if (response.status === 401) {
    console.error('Сайт не узнал этот компьютер. Привяжи заново: --code НОВЫЙ-КОД');
    process.exit(1);
  }
  return response.json().catch(() => ({}));
}

const gitCache = new Map();
async function gitInfo(dir) {
  const cached = gitCache.get(dir);
  if (cached && Date.now() - cached.at < 20000) return cached.value;
  const status = await run('git', ['status', '--porcelain=v1', '-b'], { cwd: dir, timeout: 8000 });
  let value = { isGit: false, branch: '', dirty: 0 };
  if (status.ok) {
    const lines = status.stdout.split('\n').filter(Boolean);
    const head = lines[0]?.startsWith('##') ? lines.shift().slice(3) : '';
    value = { isGit: true, branch: head.split('...')[0].replace(/^No commits yet on /, ''), dirty: lines.length };
  }
  gitCache.set(dir, { at: Date.now(), value });
  return value;
}

async function hello(first = false) {
  const workspaces = [];
  for (const item of config.workspaces) {
    if (!existsSync(item.dir)) continue;
    workspaces.push({ key: item.key, name: item.name, ...(await gitInfo(item.dir)) });
  }
  return api('/api/agent/hello', { first, name: config.name, allow: config.allow, version: VERSION, engines: orderedEngines().map(({ bin, ...engine }) => engine), workspaces, running: [...tasks.keys()] });
}

function orderedEngines() {
  const preferred = config.engine;
  return [...engines].sort((left, right) => (right.id === preferred) - (left.id === preferred) || (right.ok - left.ok));
}

/* Commands from the site */

async function walk(root) {
  const entries = [];
  let truncated = false;
  async function visit(dir, depth) {
    if (depth > 10 || entries.length >= 4000) { truncated = true; return; }
    let items;
    try { items = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    items.sort((left, right) => (right.isDirectory() - left.isDirectory()) || left.name.localeCompare(right.name));
    for (const item of items) {
      if (entries.length >= 4000) { truncated = true; return; }
      if (SKIP.has(item.name) || item.isSymbolicLink()) continue;
      const full = path.join(dir, item.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (item.isDirectory()) {
        entries.push({ path: relative, dir: true });
        await visit(full, depth + 1);
      } else if (item.isFile()) {
        const stats = await fs.stat(full).catch(() => null);
        entries.push({ path: relative, size: stats?.size || 0 });
      }
    }
  }
  await visit(root, 0);
  return { entries, truncated };
}

async function readProjectFile(workspace, relative) {
  const file = await resolveInside(workspace.dir, relative);
  const stats = await fs.stat(file);
  if (!stats.isFile()) throw new Error('Это не файл');
  if (stats.size > 600 * 1024) return { path: relative, size: stats.size, tooLarge: true };
  const buffer = await fs.readFile(file);
  if (buffer.subarray(0, 8000).includes(0)) return { path: relative, size: stats.size, binary: true };
  const content = buffer.toString('utf8');
  return { path: relative, size: stats.size, content, hash: hashText(content) };
}

async function writeProjectFile(workspace, relative, content, baseHash) {
  if (MODES.indexOf(config.allow) < 1) throw new Error('Агент запущен только для чтения (--allow read)');
  const file = await resolveInside(workspace.dir, relative);
  const current = await fs.readFile(file, 'utf8').catch(() => null);
  if (current !== null && baseHash && hashText(current) !== baseHash) throw new Error('Файл изменился на компьютере. Открой его заново.');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.prostim-${process.pid}.tmp`;
  await fs.writeFile(temporary, content);
  await fs.rename(temporary, file);
  gitCache.delete(workspace.dir);
  console.log(`✎ Сохранён файл ${relative} (${workspace.name})`);
  return { path: relative, hash: hashText(content) };
}

async function gitReport(workspace) {
  const dir = workspace.dir;
  const info = await gitInfo(dir);
  if (!info.isGit) return { isGit: false };
  const [status, diff, staged, log] = await Promise.all([
    run('git', ['status', '--porcelain=v1'], { cwd: dir }),
    run('git', ['diff', '--no-color', '--no-ext-diff'], { cwd: dir, timeout: 20000 }),
    run('git', ['diff', '--no-color', '--no-ext-diff', '--cached'], { cwd: dir, timeout: 20000 }),
    run('git', ['log', '-8', '--pretty=format:%h%x09%s%x09%cr'], { cwd: dir })
  ]);
  return {
    isGit: true,
    branch: info.branch,
    files: status.stdout.split('\n').filter(Boolean).slice(0, 300).map(line => ({ status: line.slice(0, 2).trim() || '?', path: line.slice(3) })),
    diff: clip(staged.stdout + diff.stdout, 160000),
    log: log.stdout.split('\n').filter(Boolean).map(line => { const [hash, subject, when] = line.split('\t'); return { hash, subject, when }; })
  };
}

async function handleCommand(command) {
  const reply = (ok, data, error) => api('/api/agent/reply', { id: command.id, ok, data, error }).catch(() => {});
  try {
    if (command.type === 'task') return enqueueTask(command);
    if (command.type === 'cancel') {
      const task = tasks.get(command.taskId);
      if (task) task.cancel(); else await api('/api/agent/events', { taskId: command.taskId, status: 'cancelled', events: [{ kind: 'error', text: 'Задача остановлена', t: Date.now() }] });
      return reply(true, { ok: true });
    }
    const workspace = workspaceByKey(command.workspaceKey);
    if (command.type === 'tree') return reply(true, await walk(workspace.dir));
    if (command.type === 'read') return reply(true, await readProjectFile(workspace, command.path));
    if (command.type === 'write') return reply(true, await writeProjectFile(workspace, command.path, command.content, command.baseHash));
    if (command.type === 'git') return reply(true, await gitReport(workspace));
    return reply(false, null, 'Неизвестная команда');
  } catch (error) {
    return reply(false, null, error.message);
  }
}

/* Tasks */

function enqueueTask(command) {
  const workspace = workspaceByKey(command.workspaceKey);
  const queue = queues.get(workspace.key) || Promise.resolve();
  const emitter = createEmitter(command.taskId);
  tasks.set(command.taskId, { cancel: () => { emitter.cancelled = true; } });
  if (queues.has(workspace.key)) emitter.status('queued');
  const next = queue.then(() => emitter.cancelled ? emitter.finish('cancelled', [{ kind: 'error', text: 'Задача остановлена до запуска' }]) : runTask(command, workspace, emitter)).catch(error => emitter.finish('error', [{ kind: 'error', text: error.message }])).finally(() => {
    tasks.delete(command.taskId);
    if (queues.get(workspace.key) === next) queues.delete(workspace.key);
  });
  queues.set(workspace.key, next);
}

function createEmitter(taskId) {
  let buffer = [];
  let timer = null;
  let sending = Promise.resolve();
  const emitter = {
    cancelled: false,
    push(event) {
      buffer.push({ ...event, t: Date.now() });
      if (!timer) timer = setTimeout(() => emitter.flush(), 350);
    },
    flush(status) {
      clearTimeout(timer);
      timer = null;
      const events = buffer;
      buffer = [];
      if (!events.length && !status) return sending;
      sending = sending.then(() => api('/api/agent/events', { taskId, events, status })).catch(() => {});
      return sending;
    },
    status(status) { return emitter.flush(status); },
    finish(status, events = []) {
      for (const event of events) emitter.push(event);
      return emitter.flush(status);
    }
  };
  return emitter;
}

// Files attached on the site go to .prostim/inbox inside the project; git ignores that folder.
const attachmentKinds = { image: 'изображение', video: 'видео', audio: 'аудио', file: 'файл' };

async function fetchAttachments(command, workspace, emitter) {
  const list = Array.isArray(command.attachments) ? command.attachments.slice(0, 8) : [];
  if (!list.length) return command.prompt;
  const inbox = path.join(workspace.dir, '.prostim', 'inbox');
  await fs.mkdir(inbox, { recursive: true });
  await fs.writeFile(path.join(workspace.dir, '.prostim', '.gitignore'), '*\n').catch(() => {});
  const saved = [];
  for (const item of list) {
    try {
      const response = await fetch(`${config.server}/api/agent/files/${encodeURIComponent(item.id)}`, { headers: authHeaders });
      if (!response.ok) throw new Error(`код ${response.status}`);
      const safe = path.basename(String(item.filename || item.id)).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100) || item.id;
      const file = path.join(inbox, `${Date.now().toString(36)}-${safe}`);
      await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
      saved.push({ rel: path.relative(workspace.dir, file).split(path.sep).join('/'), kind: item.kind });
    } catch (error) {
      emitter.push({ kind: 'error', text: `Не удалось скачать вложение ${item.filename || ''}: ${error.message}` });
    }
  }
  if (!saved.length) return command.prompt;
  emitter.push({ kind: 'notice', text: `Вложения сохранены в проект: ${saved.map(entry => entry.rel).join(', ')}` });
  return `${command.prompt}\n\nК задаче приложены файлы, они лежат в папке проекта:\n${saved.map(entry => `- ${entry.rel} (${attachmentKinds[entry.kind] || 'файл'})`).join('\n')}`;
}

function engineFor(id) {
  const available = orderedEngines();
  return available.find(engine => engine.id === id && engine.ok) || available.find(engine => engine.ok) || available.find(engine => engine.id === 'demo');
}

async function runTask(command, workspace, emitter) {
  const mode = MODES.indexOf(command.mode) <= MODES.indexOf(config.allow) ? command.mode : config.allow;
  const engine = engineFor(command.engine);
  console.log(`▶ [${workspace.name}] ${engine.label} · ${mode}: ${command.prompt.slice(0, 100)}`);
  emitter.status('running');
  const started = Date.now();
  command = { ...command, prompt: await fetchAttachments(command, workspace, emitter) };
  const before = await folderSnapshot(workspace.dir);
  let status;
  if (engine.id === 'claude') status = await runClaude(command, workspace, mode, engine, emitter);
  else if (engine.id === 'codex') status = await runCodex(command, workspace, mode, engine, emitter);
  else status = await runDemo(command, workspace, emitter);
  const after = await folderSnapshot(workspace.dir);
  const changed = after ? [...after.entries()].filter(([file, entry]) => before?.get(file)?.key !== entry.key).map(([file, entry]) => ({ path: file, status: entry.status })) : [];
  if (before && after) for (const file of before.keys()) if (!after.has(file)) changed.push({ path: file, status: 'C' });
  if (changed.length) emitter.push({ kind: 'changes', files: changed.slice(0, 100) });
  gitCache.delete(workspace.dir);
  console.log(`${status === 'done' ? '✓' : '✕'} [${workspace.name}] ${status} за ${Math.round((Date.now() - started) / 1000)} с`);
  await emitter.finish(status);
  hello().catch(() => {});
}

// Dirty files with a content hash, so a task reports only what it changed itself.
async function folderSnapshot(dir) {
  const result = await run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: dir, timeout: 8000 });
  if (!result.ok) return null;
  const snapshot = new Map();
  for (const line of result.stdout.split('\n').filter(Boolean).slice(0, 300)) {
    const status = line.slice(0, 2).trim() || '?';
    const file = line.slice(3).replace(/^.* -> /, '');
    const content = await fs.readFile(path.join(dir, file)).catch(() => null);
    snapshot.set(file, { status, key: `${status}:${content ? createHash('sha1').update(content).digest('hex') : 'gone'}` });
  }
  return snapshot;
}

function spawnEngine(taskId, bin, args, cwd, emitter, onLine) {
  return new Promise(resolve => {
    if (emitter.cancelled) { resolve({ code: -1, stderr: '' }); return; }
    const child = spawn(bin, args, { cwd, env: { ...process.env, PROSTIM_AGENT: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    let rest = '';
    let chain = Promise.resolve();
    const handle = line => { if (!line.trim()) return; let event; try { event = JSON.parse(line); } catch { return; } chain = chain.then(() => onLine(event)).catch(() => {}); };
    const limit = setTimeout(() => { emitter.push({ kind: 'error', text: 'Задача шла дольше 45 минут и остановлена' }); child.kill('SIGTERM'); }, 45 * 60 * 1000);
    const entry = tasks.get(taskId);
    if (entry) entry.cancel = () => { emitter.cancelled = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 4000).unref(); };
    child.stdout.on('data', chunk => {
      const lines = (rest + chunk.toString('utf8')).split('\n');
      rest = lines.pop();
      lines.forEach(handle);
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-4000); });
    child.on('error', error => { clearTimeout(limit); chain.then(() => resolve({ code: -1, stderr: error.message })); });
    child.on('close', code => {
      clearTimeout(limit);
      handle(rest);
      chain.then(() => resolve({ code, stderr }));
    });
  });
}

function bindCancel(taskId, emitter) {
  const entry = tasks.get(taskId);
  if (entry) entry.cancel = () => { emitter.cancelled = true; };
}

const loginHint = /not logged in|please run \/login|invalid api key|authentication|401|unauthori/i;

function claudeTool(block, root) {
  const input = block.input || {};
  const base = { kind: 'tool', id: block.id, name: block.name };
  switch (block.name) {
    case 'Read': return { ...base, tool: 'read', path: relativeTo(root, input.file_path) };
    case 'Edit': return { ...base, tool: 'edit', path: relativeTo(root, input.file_path), diff: lineDiff(input.old_string, input.new_string) };
    case 'MultiEdit': return { ...base, tool: 'edit', path: relativeTo(root, input.file_path), diff: (input.edits || []).flatMap(edit => lineDiff(edit.old_string, edit.new_string, 30)).slice(0, 100) };
    case 'Write': return { ...base, tool: 'write', path: relativeTo(root, input.file_path), diff: String(input.content || '').split('\n').slice(0, 40).map(text => ({ type: '+', text: clip(text, 300) })) };
    case 'NotebookEdit': return { ...base, tool: 'edit', path: relativeTo(root, input.notebook_path) };
    case 'Bash': return { ...base, tool: 'bash', command: clip(input.command, 1500), text: input.description || '' };
    case 'Grep': return { ...base, tool: 'search', text: input.pattern || '', path: relativeTo(root, input.path) };
    case 'Glob': return { ...base, tool: 'search', text: input.pattern || '' };
    case 'LS': return { ...base, tool: 'read', path: relativeTo(root, input.path) };
    case 'TodoWrite': return { ...base, tool: 'plan', todos: (input.todos || []).map(todo => ({ text: todo.content || todo.activeForm || '', status: todo.status || 'pending' })) };
    case 'ExitPlanMode': return { ...base, tool: 'plan', text: clip(input.plan, 6000) };
    case 'WebFetch': return { ...base, tool: 'web', text: input.url || '' };
    case 'WebSearch': return { ...base, tool: 'web', text: input.query || '' };
    case 'Task': case 'Agent': return { ...base, tool: 'agent', text: input.description || input.prompt?.slice(0, 200) || '' };
    default: return { ...base, tool: 'other', text: clip(JSON.stringify(input), 400) };
  }
}

function toolOutput(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => part.type === 'text' ? part.text : `[${part.type}]`).join('\n');
  return JSON.stringify(content ?? '');
}

async function runClaude(command, workspace, mode, engine, emitter) {
  const prompt = command.prompt.startsWith('-') ? ` ${command.prompt}` : command.prompt;
  const modeArgs = mode === 'full' ? ['--permission-mode', 'bypassPermissions'] : mode === 'edit' ? ['--permission-mode', 'acceptEdits'] : ['--permission-mode', 'plan'];
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...modeArgs, ...(command.sessionId ? ['--resume', command.sessionId] : [])];
  bindCancel(command.taskId, emitter);
  let finished = null;
  const result = await spawnEngine(command.taskId, engine.bin, args, workspace.dir, emitter, event => {
    if (event.type === 'system' && event.subtype === 'init') emitter.push({ kind: 'start', engine: 'claude', model: event.model || '', sessionId: event.session_id || '', version: event.claude_code_version || engine.version, mode });
    else if (event.type === 'assistant') {
      for (const block of event.message?.content || []) {
        if (block.type === 'text' && block.text?.trim()) emitter.push({ kind: 'text', text: clip(block.text, 12000) });
        else if (block.type === 'thinking' && block.thinking?.trim()) emitter.push({ kind: 'thinking', text: clip(block.thinking, 12000) });
        else if (block.type === 'tool_use') emitter.push(claudeTool(block, workspace.dir));
      }
    } else if (event.type === 'user') {
      for (const block of event.message?.content || []) {
        if (block.type === 'tool_result') emitter.push({ kind: 'tool_result', id: block.tool_use_id, ok: !block.is_error, output: clip(toolOutput(block.content), 4000) });
      }
    } else if (event.type === 'result') {
      const text = String(event.result || '');
      const ok = !event.is_error && event.subtype === 'success' && !(event.num_turns <= 1 && loginHint.test(text));
      finished = ok ? 'done' : 'error';
      emitter.push({ kind: ok ? 'done' : 'error', ok, text: clip(text, 12000), costUsd: event.total_cost_usd ?? null, durationMs: event.duration_ms ?? null, turns: event.num_turns ?? null, sessionId: event.session_id || '', denied: (event.permission_denials || []).map(item => item.tool_name).slice(0, 20), hint: loginHint.test(text) ? 'На компьютере с агентом выполни «claude auth login» и повтори задачу.' : '' });
    }
  });
  if (emitter.cancelled) { emitter.push({ kind: 'error', text: 'Задача остановлена' }); return 'cancelled'; }
  if (!finished) {
    emitter.push({ kind: 'error', text: clip(result.stderr || `Claude Code завершился с кодом ${result.code}`, 3000), hint: loginHint.test(result.stderr) ? 'Выполни «claude auth login» на компьютере.' : '' });
    return 'error';
  }
  return finished;
}

function unwrapShell(commandLine) {
  const text = String(commandLine || '');
  const match = /^\S*(?:zsh|bash|sh)\s+-l?c\s+([\s\S]*)$/.exec(text);
  if (!match) return text;
  let inner = match[1].trim();
  if (inner.length > 1 && (inner[0] === '"' || inner[0] === "'") && inner.at(-1) === inner[0]) inner = inner.slice(1, -1);
  return inner.replace(/'"'"'/g, "'").replace(/"'"'"'/g, "'").replace(/\\"/g, '"');
}

async function runCodex(command, workspace, mode, engine, emitter) {
  const prompt = command.prompt.startsWith('-') ? ` ${command.prompt}` : command.prompt;
  const sandbox = mode === 'full' ? 'danger-full-access' : mode === 'edit' ? 'workspace-write' : 'read-only';
  const args = command.sessionId
    ? ['exec', '--json', '--skip-git-repo-check', '-c', `sandbox_mode="${sandbox}"`, 'resume', command.sessionId, prompt]
    : ['exec', '--json', '--skip-git-repo-check', ...(mode === 'full' ? ['--dangerously-bypass-approvals-and-sandbox'] : ['-s', sandbox]), prompt];
  bindCancel(command.taskId, emitter);
  const started = Date.now();
  let finished = null;
  let lastMessage = '';
  let sessionId = command.sessionId || '';
  const result = await spawnEngine(command.taskId, engine.bin, args, workspace.dir, emitter, async event => {
    const item = event.item || {};
    if (event.type === 'thread.started') { sessionId = event.thread_id || sessionId; emitter.push({ kind: 'start', engine: 'codex', model: '', sessionId, version: engine.version, mode }); }
    else if (event.type === 'item.started' && item.type === 'command_execution') emitter.push({ kind: 'tool', id: item.id, tool: 'bash', command: clip(unwrapShell(item.command), 1500) });
    else if (event.type === 'item.completed' && item.type === 'command_execution') emitter.push({ kind: 'tool_result', id: item.id, ok: item.exit_code === 0, output: clip(item.aggregated_output, 4000) });
    else if (event.type === 'item.completed' && item.type === 'agent_message') { lastMessage = item.text || ''; emitter.push({ kind: 'text', text: clip(item.text, 12000) }); }
    else if (event.type === 'item.completed' && item.type === 'reasoning' && item.text?.trim()) emitter.push({ kind: 'thinking', text: clip(item.text, 12000) });
    else if (event.type === 'item.completed' && item.type === 'file_change') {
      for (const change of item.changes || []) {
        const relative = relativeTo(workspace.dir, change.path);
        const diff = await run('git', ['diff', '--no-color', '--', relative], { cwd: workspace.dir });
        emitter.push({ kind: 'tool', id: `${item.id}-${relative}`, tool: change.kind === 'add' ? 'write' : change.kind === 'delete' ? 'delete' : 'edit', path: relative, diff: diff.ok ? parseUnifiedDiff(diff.stdout) : [] });
      }
    } else if ((event.type === 'item.completed' || event.type === 'item.updated') && item.type === 'todo_list') emitter.push({ kind: 'tool', id: item.id, tool: 'plan', todos: (item.items || []).map(todo => ({ text: todo.text, status: todo.completed ? 'completed' : 'pending' })) });
    else if (event.type === 'item.completed' && item.type === 'web_search') emitter.push({ kind: 'tool', id: item.id, tool: 'web', text: item.query || '' });
    else if (event.type === 'item.completed' && item.type === 'mcp_tool_call') emitter.push({ kind: 'tool', id: item.id, tool: 'other', name: `${item.server || 'mcp'}.${item.tool || ''}`, text: '' });
    else if (event.type === 'item.completed' && item.type === 'error' && !/unrecognized configuration|deprecated/i.test(item.message || '')) emitter.push({ kind: 'notice', text: clip(item.message, 2000) });
    else if (event.type === 'turn.completed') { finished = 'done'; emitter.push({ kind: 'done', ok: true, text: clip(lastMessage, 12000), durationMs: Date.now() - started, tokens: (event.usage?.input_tokens || 0) + (event.usage?.output_tokens || 0), sessionId }); }
    else if (event.type === 'turn.failed' || event.type === 'error') { finished = 'error'; const text = event.error?.message || event.message || 'Ошибка Codex'; emitter.push({ kind: 'error', text: clip(text, 3000), hint: loginHint.test(text) ? 'Выполни «codex login» на компьютере.' : '' }); }
  });
  if (emitter.cancelled) { emitter.push({ kind: 'error', text: 'Задача остановлена' }); return 'cancelled'; }
  if (!finished) { emitter.push({ kind: 'error', text: clip(result.stderr || `Codex завершился с кодом ${result.code}`, 3000) }); return 'error'; }
  return finished;
}

async function runDemo(command, workspace, emitter) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  bindCancel(command.taskId, emitter);
  emitter.push({ kind: 'start', engine: 'demo', model: 'без модели', sessionId: '', version: VERSION, mode: 'read' });
  await wait(500);
  emitter.push({ kind: 'thinking', text: `Задача: «${command.prompt.slice(0, 200)}». Сначала посмотрю, что лежит в папке проекта.` });
  await wait(600);
  const { entries } = await walk(workspace.dir);
  const files = entries.filter(entry => !entry.dir);
  emitter.push({ kind: 'tool', id: 'demo-ls', tool: 'search', text: '**/*' });
  emitter.push({ kind: 'tool_result', id: 'demo-ls', ok: true, output: files.slice(0, 15).map(file => file.path).join('\n') || '(пусто)' });
  await wait(600);
  const readme = files.find(file => /^readme/i.test(path.basename(file.path))) || files.find(file => file.size < 200000);
  if (readme) {
    emitter.push({ kind: 'tool', id: 'demo-read', tool: 'read', path: readme.path });
    const content = await readProjectFile(workspace, readme.path).catch(() => ({ content: '' }));
    emitter.push({ kind: 'tool_result', id: 'demo-read', ok: true, output: clip(content.content || '', 600) });
    await wait(500);
  }
  if (emitter.cancelled) return 'cancelled';
  const real = engines.filter(engine => engine.id !== 'demo');
  const note = real.length ? real.map(engine => `${engine.label}: ${engine.note || 'не готов'}`).join('\n') : 'Claude Code и Codex на этом компьютере не найдены.';
  emitter.push({ kind: 'done', ok: true, text: `Демо-режим. В проекте «${workspace.name}» ${files.length} файлов${readme ? `, начал бы с ${readme.path}` : ''}.\n\nЧтобы задачи выполняла модель:\n${note}`, durationMs: 2200, sessionId: '' });
  return 'done';
}

/* Connection loop */

async function listen() {
  let delay = 1000;
  for (;;) {
    try {
      engines = await detectEngines();
      const greeting = await hello(true);
      const names = config.workspaces.map(item => item.name).join(', ');
      const engineList = orderedEngines().map(engine => `${engine.label}${engine.ok ? '' : ' (не готов)'}`).join(', ');
      console.log(`✓ Подключено к ${config.server}\n  Компьютер: ${config.name} · предел: ${config.allow}\n  Проекты: ${names}\n  Движки: ${engineList}`);
      if (!greeting.deviceId) throw new Error('сервер не ответил');
      const response = await fetch(`${config.server}/api/agent/stream`, { headers: authHeaders });
      if (response.status === 401) { console.error('Сайт не узнал этот компьютер. Привяжи заново: --code НОВЫЙ-КОД'); process.exit(1); }
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      delay = 1000;
      const heartbeat = setInterval(() => hello().catch(() => {}), 25000);
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true });
          let index;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            let event = 'message';
            let data = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (event === 'cmd' && data) { try { handleCommand(JSON.parse(data)); } catch {} }
          }
        }
      } finally {
        clearInterval(heartbeat);
      }
      console.log('… соединение закрыто, переподключаюсь');
    } catch (error) {
      console.log(`… нет связи с сайтом (${error.message}), повтор через ${Math.round(delay / 1000)} с`);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(30000, delay * 2);
  }
}

process.on('SIGINT', () => { console.log('\nАгент остановлен'); process.exit(0); });
listen();
