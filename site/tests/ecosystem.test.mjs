import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSteam, repoChecks, steamReadiness, publisherShouldNotice, taskFromComment, taskFromDigest, taskFromFeedback, demoTaskPrompt, demoUrlFromText, promptFromComment, updateFromTask, cleanPlaytest, cleanTestResults, testReportText, testTally, playtestDraft, PLAYTEST_STEPS } from '../src/ecosystem.js';

test('a repository file list says what a Steam release already has', () => {
  const checks = repoChecks([
    { path: 'README.md', size: 10 }, { path: 'LICENSE', size: 5 }, { path: 'src', dir: true }, { path: 'src/main.gd', size: 50 },
    { path: 'press/screenshots/1.png', size: 1 }, { path: 'press/screenshots/2.png', size: 1 }, { path: 'press/screenshots/3.jpg', size: 1 },
    { path: 'builds/windows/game.exe', size: 900 }
  ]);
  assert.deepEqual(checks, { readme: true, license: true, screens: true, buildFiles: true, pictures: 3, files: 8 });
  assert.deepEqual(repoChecks([{ path: 'docs/README.md' }, { path: 'art/logo.png' }]), { readme: false, license: false, screens: false, buildFiles: false, pictures: 0, files: 2 });
  assert.equal(repoChecks(null).files, 0);
});

test('readiness for Steam adds up the checklist, the feed and the repository', () => {
  const project = { steam: { checklist: { build: true, trailer: true, text: false } } };
  const without = steamReadiness(project, { watchers: 12, stats: { plays: 5, wishlists: 10 }, retention: 0.5 });
  assert.equal(without.total, 11, 'six checklist items and five feed goals');
  assert.equal(without.done, 5, 'build, trailer, watchers, retention and Steam clicks');
  assert.equal(without.percent, 45);
  assert.equal(steamReadiness(project, { watchers: 12, stats: { plays: 5, wishlists: 10 }, retention: 0.5, reports: 5 }).done, 6, 'five tester reports count');
  assert.equal(without.items.find(item => item.id === 'plays').share, 0.25);
  const withRepo = steamReadiness(project, { watchers: 12, repo: { readme: true, license: false, screens: false, buildFiles: true } });
  assert.equal(withRepo.total, 15);
  assert.equal(withRepo.done, 5, 'build, trailer, watchers, README and build files');
});

test('Steam status keeps only known values and merges the checklist', () => {
  assert.deepEqual(cleanSteam({ status: 'released', checklist: { build: true, hack: true }, releaseAt: 1700000000000 }), { status: 'released', checklist: { build: true }, releaseAt: 1700000000000 });
  assert.deepEqual(cleanSteam({ status: 'nope', checklist: { trailer: true } }, { status: 'coming', checklist: { build: true }, releaseAt: 5 }), { status: 'coming', checklist: { build: true, trailer: true }, releaseAt: 5 });
  assert.equal(cleanSteam(null).status, 'none');
});

test('a publisher notices only games people hold on to, and only once', () => {
  const strong = { impressions: 40, score: 0.6 };
  assert.equal(publisherShouldNotice({ category: 'games' }, strong, { watchers: 2, saves: 1 }), true);
  assert.equal(publisherShouldNotice({ category: 'apps' }, strong, { watchers: 5 }), false);
  assert.equal(publisherShouldNotice({ category: 'games', publisherNoticed: 1 }, strong, { watchers: 5 }), false);
  assert.equal(publisherShouldNotice({ category: 'games' }, { impressions: 10, score: 0.9 }, { watchers: 5 }), false, 'too few views');
  assert.equal(publisherShouldNotice({ category: 'games' }, strong, { watchers: 1, saves: 1 }), false, 'nobody waits for it');
});

test('drafts between the parts: a comment as a task, a digest as a task, a task as an update', () => {
  const project = { title: 'Маяк' };
  assert.match(taskFromComment(project, { handle: 'vera', text: 'Вылетает на втором уровне' }), /^Игрок @vera пишет в комментариях к «Маяк»:\n«Вылетает на втором уровне»/);
  const digestTask = taskFromDigest(project, { summary: '3 комментария.', points: ['Жалобы и баги: 1'] }, [{ text: 'Баг!' }, { voice: 'x' }]);
  assert.match(digestTask, /• Жалобы и баги: 1/);
  assert.match(digestTask, /— Баг!/);
  const update = updateFromTask({ prompt: 'Исправь вылет на втором уровне. Проверь сохранения', events: [{ kind: 'text', text: 'Смотрю' }, { kind: 'done', text: 'Исправил проверку пустого инвентаря.' }] }, [{ subject: 'Fix crash on level 2' }, { subject: 'Add test' }]);
  assert.equal(update.title, 'Исправь вылет на втором уровне');
  assert.equal(update.text, 'Исправил проверку пустого инвентаря.\n\nИзменения:\n• Fix crash on level 2\n• Add test');
});

test('picked feedback becomes one task: bugs first, with stars and marks', () => {
  const prompt = taskFromFeedback({ title: 'Маяк' }, [
    { handle: 'oleg', kind: 'idea', text: 'Добавьте кооператив' },
    { handle: 'vera', kind: 'bug', text: 'Вылетает после босса', review: { stars: 2, tags: ['bugs', 'hard'] } },
    { name: 'Гость', kind: 'review', text: '', review: { stars: 5, tags: [] } }
  ]);
  assert.match(prompt, /^Отзывы игроков о «Маяк»/);
  assert.ok(prompt.indexOf('Баги и проблемы:') < prompt.indexOf('Просьбы и идеи:'), 'bugs come before requests');
  assert.match(prompt, /1\. @vera \(★2, баги, сложно\): «Вылетает после босса»/);
  assert.match(prompt, /Отзывы и впечатления:\n1\. Гость \(★5\): «без текста»/);
  assert.match(prompt, /перечисли, что сделано по каждому пункту/);
});

test('a web build task asks for a playable link, and the link is found in the answer', () => {
  assert.match(demoTaskPrompt({ title: 'Маяк' }), /веб-версию «Маяк».*ссылку на играбельную версию/s);
  assert.equal(demoUrlFromText('Собрал. Пример: https://example.com/x\nИгра: https://vera.github.io/mayak/.'), 'https://vera.github.io/mayak/');
  assert.equal(demoUrlFromText('Загрузил на https://itch.io/embed-upload/123?color=333, проверь'), 'https://itch.io/embed-upload/123?color=333');
  assert.equal(demoUrlFromText('Ссылка: https://html-classic.itch.zone/html/5/index.html'), 'https://html-classic.itch.zone/html/5/index.html');
  assert.equal(demoUrlFromText('Не настроено: нужен репозиторий на https://github.com'), '');
});

test('a comment as a task in the project context: the thread, the files and where to start', () => {
  const prompt = promptFromComment(
    { title: 'Маяк', summary: 'Уютная игра про шторм', tags: ['Инди', 'Новый проект'], madeWith: ['Godot'] },
    { id: 'c1', handle: 'vera', kind: 'bug', text: 'кнопки мелкие', review: { stars: 3, tags: ['hard'] } },
    { thread: [{ id: 'c1', text: 'кнопки мелкие' }, { id: 'c2', handle: 'author', byAuthor: true, text: 'На каком телефоне?' }, { id: 'c3', handle: 'vera', text: 'iPhone SE, кнопка прыжка' }], files: ['project.godot', 'scenes/'], readme: '# Маяк\nИгра про смотрителя маяка' }
  );
  assert.match(prompt, /^Проект «Маяк» — Уютная игра про шторм · Инди · сделано на Godot\./);
  assert.match(prompt, /@vera оставил сообщение о баге \(★3, сложно\):\n«кнопки мелкие»/);
  assert.match(prompt, /— @author \(автор\): «На каком телефоне\?»\n— @vera: «iPhone SE, кнопка прыжка»/);
  assert.match(prompt, /Файлы в корне проекта: project\.godot, scenes\//);
  assert.match(prompt, /Из README: Игра про смотрителя маяка/);
  assert.match(prompt, /перечисли, что уточнить у игрока/);
});

test('a playtest keeps clean steps, known access and sane places; a report reads step by step', () => {
  const steps = Array.from({ length: 14 }, (_, index) => `${index + 1}. Шаг ${index + 1}`).join('\n');
  const playtest = cleanPlaytest({ title: '  Первые\n5 минут ', steps, access: 'root', slots: 500, build: 'x.io', notes: 'a\n\n\n\nb' }, {}, url => `https://${url}`);
  assert.equal(playtest.title, 'Первые 5 минут');
  assert.equal(playtest.steps.length, PLAYTEST_STEPS);
  assert.equal(playtest.steps[0], 'Шаг 1', 'numbering is taken off');
  assert.equal(playtest.access, 'none');
  assert.equal(playtest.slots, 50);
  assert.equal(playtest.build, 'https://x.io');
  assert.equal(playtest.notes, 'a\n\nb');
  const results = cleanTestResults([{ ok: true }, { ok: 'yes', note: 'x'.repeat(400) }, { ok: false, note: 'вылет' }], ['Открой', 'Пройди', 'Выйди']);
  assert.deepEqual(results.map(item => item.ok), [true, null, false], 'only true and false count as marks');
  assert.equal(results[1].note.length, 300);
  assert.deepEqual(testTally(results), { passed: 1, failed: 1, total: 3 });
  const text = testReportText({ title: 'Тест', platform: 'Android', version: '0.4' }, results, 'В целом приятно');
  assert.match(text, /^Тест-задание «Тест»: не прошло 1 из 3\./);
  assert.match(text, /Где проверял: Android, версия 0\.4\./);
  assert.match(text, /✗ 3\. Выйди — вылет/);
  assert.match(text, /В целом приятно$/);
  assert.equal(playtestDraft({ title: 'Ровер', demo: 'https://x.itch.io/r' }).build, 'https://x.itch.io/r');
  assert.match(playtestDraft({ title: 'Ровер' }).steps[0], /билд/);
});
