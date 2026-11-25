// Turns the event stream of an agent task into a readable timeline, like a coding agent's own UI.
import { icon } from './icons.js';
import { escapeHtml } from './state.js';

export const modeNames = { read: 'Анализ', edit: 'Правки', full: 'Полный доступ' };
export const modeHints = { read: 'Читает файлы и предлагает план, ничего не меняет', edit: 'Меняет файлы в папке проекта, команды не запускает', full: 'Меняет файлы и запускает команды без подтверждений' };
export const statusNames = { waiting: 'Ждёт компьютер', sent: 'Отправлено на компьютер', queued: 'В очереди', running: 'Выполняется', done: 'Готово', error: 'Ошибка', cancelled: 'Остановлено', interrupted: 'Прервано' };
const engineNames = { claude: 'Claude Code', codex: 'Codex', demo: 'Демо' };
const fileStatus = { C: 'вернул как было', M: 'изменён', A: 'добавлен', D: 'удалён', R: 'переименован', '??': 'новый', '?': 'новый', AM: 'добавлен', MM: 'изменён' };

export function isActive(status) {
  return ['waiting', 'sent', 'queued', 'running'].includes(status);
}

export function formatDuration(ms) {
  const seconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return seconds < 60 ? `${seconds} с` : `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
}

export function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/```[a-z]*\n([\s\S]*?)```/g, (_, code) => `<pre class="md-code">${code}</pre>`)
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '<b>$1</b>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/^#{1,4} (.+)$/gm, '<b class="md-h">$1</b>')
    .replace(/^[-*] (.+)$/gm, '• $1');
}

// Tool results arrive as separate events; attach each to the tool call it answers.
export function buildSteps(events = []) {
  const steps = [];
  const byId = new Map();
  for (const event of events) {
    if (event.kind === 'tool_result') {
      const tool = byId.get(event.id);
      if (tool) Object.assign(tool, { result: event.output, ok: event.ok !== false, finished: true });
      continue;
    }
    if (event.kind === 'tool' && event.id && byId.has(event.id) && event.tool === 'plan') {
      Object.assign(byId.get(event.id), event);
      continue;
    }
    const step = { ...event };
    if (event.kind === 'tool' && event.id) byId.set(event.id, step);
    steps.push(step);
  }
  return steps;
}

export function summarizeTask(events = []) {
  const steps = buildSteps(events);
  const files = new Set();
  let tools = 0;
  for (const step of steps) {
    if (step.kind !== 'tool') continue;
    tools += 1;
    if (['edit', 'write', 'delete'].includes(step.tool) && step.path) files.add(step.path);
  }
  const done = steps.find(step => step.kind === 'done');
  const start = steps.find(step => step.kind === 'start');
  return { steps, tools, files: [...files], done, start };
}

export function diffHtml(lines = [], limit = 60) {
  if (!lines.length) return '';
  const shown = lines.slice(0, limit);
  const rows = shown.map(line => `<span class="dl ${line.type === '+' ? 'add' : line.type === '-' ? 'del' : line.type === '@' ? 'hunk' : ''}"><i>${line.type === '@' ? '' : escapeHtml(line.type)}</i>${escapeHtml(line.text)}</span>`).join('');
  return `<pre class="diff">${rows}${lines.length > limit ? `<span class="dl more">… ещё ${lines.length - limit} строк</span>` : ''}</pre>`;
}

export function unifiedDiffHtml(text, limit = 1500) {
  const blocks = [];
  let current = null;
  let count = 0;
  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('diff --git')) {
      current = { file: line.replace(/^diff --git a\/(.+?) b\/.+$/, '$1'), lines: [] };
      blocks.push(current);
      continue;
    }
    if (!current || /^(index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(line)) continue;
    if (count++ > limit) break;
    current.lines.push({ type: line.startsWith('@@') ? '@' : line[0] === '+' ? '+' : line[0] === '-' ? '-' : ' ', text: line.startsWith('@@') ? line : line.slice(1) });
  }
  return blocks.map(block => `<details class="diff-file" open><summary>${icon('file')}<span>${escapeHtml(block.file)}</span><small>+${block.lines.filter(line => line.type === '+').length} −${block.lines.filter(line => line.type === '-').length}</small></summary>${diffHtml(block.lines, 400)}</details>`).join('');
}

function output(text, label = 'Вывод') {
  if (!text?.trim()) return '';
  return `<details class="tool-out"><summary>${label}</summary><pre>${escapeHtml(text)}</pre></details>`;
}

function toolStep(step) {
  const state = step.finished ? (step.ok ? 'ok' : 'fail') : 'pending';
  const mark = `<span class="tool-state ${state}">${state === 'fail' ? icon('close') : state === 'ok' ? icon('check') : ''}</span>`;
  const path = step.path ? `<code>${escapeHtml(step.path)}</code>` : '';
  switch (step.tool) {
    case 'read': return `<div class="tstep tool">${icon('doc')}<div class="tstep-main"><p>Читает ${path}</p>${output(step.result, 'Содержимое')}</div>${mark}</div>`;
    case 'edit': return `<div class="tstep tool change">${icon('pen')}<div class="tstep-main"><p>Изменяет ${path}</p>${diffHtml(step.diff)}${step.finished && !step.ok ? output(step.result, 'Почему не вышло') : ''}</div>${mark}</div>`;
    case 'write': return `<div class="tstep tool change">${icon('file')}<div class="tstep-main"><p>Создаёт ${path}</p>${diffHtml(step.diff, 24)}</div>${mark}</div>`;
    case 'delete': return `<div class="tstep tool change">${icon('close')}<div class="tstep-main"><p>Удаляет ${path}</p></div>${mark}</div>`;
    case 'bash': return `<div class="tstep tool">${icon('code')}<div class="tstep-main">${step.text ? `<p>${escapeHtml(step.text)}</p>` : ''}<pre class="cmd">$ ${escapeHtml(step.command || '')}</pre>${output(step.result)}</div>${mark}</div>`;
    case 'search': return `<div class="tstep tool">${icon('search')}<div class="tstep-main"><p>Ищет <code>${escapeHtml(step.text || '')}</code>${step.path && step.path !== '.' ? ` в ${path}` : ''}</p>${output(step.result, 'Найдено')}</div>${mark}</div>`;
    case 'plan': {
      const todos = (step.todos || []).map(todo => `<li class="${escapeHtml(todo.status)}"><i>${todo.status === 'completed' ? icon('check') : ''}</i>${escapeHtml(todo.text)}</li>`).join('');
      return `<div class="tstep tool plan">${icon('check')}<div class="tstep-main"><p>План</p>${todos ? `<ul class="todos">${todos}</ul>` : ''}${step.text ? `<div class="say">${inlineMarkdown(step.text)}</div>` : ''}</div></div>`;
    }
    case 'web': return `<div class="tstep tool">${icon('external')}<div class="tstep-main"><p>Интернет: ${escapeHtml(step.text || '')}</p></div>${mark}</div>`;
    case 'agent': return `<div class="tstep tool">${icon('users')}<div class="tstep-main"><p>Подзадача: ${escapeHtml(step.text || '')}</p>${output(step.result, 'Результат')}</div>${mark}</div>`;
    default: return `<div class="tstep tool">${icon('sparkle')}<div class="tstep-main"><p>${escapeHtml(step.name || 'Инструмент')}</p>${step.text ? `<pre class="cmd">${escapeHtml(step.text)}</pre>` : ''}${output(step.result)}</div>${mark}</div>`;
  }
}

function stepHtml(step) {
  if (step.kind === 'start') return `<div class="tstep meta">${icon('sparkle')}<span>${escapeHtml(engineNames[step.engine] || step.engine || 'Агент')}${step.version ? ` ${escapeHtml(step.version)}` : ''}${step.model ? ` · ${escapeHtml(step.model)}` : ''}${step.mode ? ` · ${escapeHtml(modeNames[step.mode] || step.mode)}` : ''}</span></div>`;
  if (step.kind === 'thinking') return `<details class="tstep thinking"><summary>${icon('sparkle')}<span>Размышляет</span><em>${escapeHtml(step.text.split('\n')[0].slice(0, 90))}</em></summary><div class="say">${inlineMarkdown(step.text)}</div></details>`;
  if (step.kind === 'text') return `<div class="tstep say">${inlineMarkdown(step.text)}</div>`;
  if (step.kind === 'tool') return toolStep(step);
  if (step.kind === 'notice') return `<div class="tstep meta">${icon('lock')}<span>${escapeHtml(step.text)}</span></div>`;
  if (step.kind === 'changes') return `<div class="tstep changed">${icon('branch')}<div class="tstep-main"><p>Файлы, изменённые задачей · ${step.files.length}</p><ul class="file-list">${step.files.slice(0, 30).map(file => `<li><b class="fs fs-${escapeHtml(file.status.replace(/\?/g, 'n'))}">${escapeHtml(file.status)}</b>${escapeHtml(file.path)}<small>${escapeHtml(fileStatus[file.status] || '')}</small></li>`).join('')}</ul></div></div>`;
  if (step.kind === 'error') return `<div class="tstep failure">${icon('close')}<div class="tstep-main"><p>${inlineMarkdown(step.text || 'Ошибка')}</p>${step.hint ? `<p class="hint">${escapeHtml(step.hint)}</p>` : ''}</div></div>`;
  return '';
}

export function runMeta(task, now = Date.now()) {
  const { tools, files, done } = summarizeTask(task.events);
  const elapsed = (task.finishedAt || now) - task.createdAt;
  const meta = [statusNames[task.status] || task.status];
  if (task.status !== 'waiting') meta.push(formatDuration(done?.durationMs || elapsed));
  if (tools) meta.push(`${tools} шаг${tools % 10 === 1 && tools % 100 !== 11 ? '' : tools % 10 >= 2 && tools % 10 <= 4 && (tools % 100 < 10 || tools % 100 >= 20) ? 'а' : 'ов'}`);
  if (files.length) meta.push(`файлов: ${files.length}`);
  if (typeof task.costUsd === 'number' && task.costUsd > 0) meta.push(`$${task.costUsd.toFixed(task.costUsd < 0.1 ? 3 : 2)}`);
  return meta.join(' · ');
}

export function renderRun(task, { canCancel = false, now = Date.now() } = {}) {
  const { steps, done } = summarizeTask(task.events);
  const active = isActive(task.status);
  const meta = [runMeta(task, now)];
  const body = steps.filter(step => step.kind !== 'done' && !(step.kind === 'text' && done?.text && step.text.trim() === done.text.trim())).map(stepHtml).join('');
  const answer = done?.text ? `<div class="run-answer">${inlineMarkdown(done.text)}</div>` : '';
  const denied = done?.denied?.length ? `<p class="run-denied">${icon('lock')} Не разрешено в этом режиме: ${escapeHtml([...new Set(done.denied)].join(', '))}. Выбери режим выше, если нужно.</p>` : '';
  const live = active ? `<div class="run-live"><span class="dots"><i></i><i></i><i></i></span>${task.status === 'waiting' ? 'Компьютер не в сети — задача начнётся, когда агент подключится' : task.status === 'running' ? 'Работает…' : 'Передаём задачу…'}</div>` : '';
  return `<article class="run ${escapeHtml(task.status)}" data-run="${escapeHtml(task.id)}"><header class="run-head"><span class="run-status">${active ? '<i class="spin"></i>' : task.status === 'done' ? icon('check') : icon('close')}</span><span class="run-meta" data-run-meta>${meta.map(escapeHtml).join(' · ')}</span>${canCancel && active ? `<button class="btn btn-ghost btn-xs" data-action="cancel-task" data-id="${escapeHtml(task.id)}">Остановить</button>` : ''}</header><div class="run-steps">${body}${live}</div>${answer}${denied}</article>`;
}
