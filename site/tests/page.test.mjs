import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPostFields, cleanPage, richText, linkKind, themeVars, themeClass, inkFor, pageHtml, fontFamiliesFor } from '../src/page.js';

test('post fields keep only known values', () => {
  const fields = cleanPostFields({ stage: 'launch', platforms: ['mac', 'mac', 'amiga', 'web'], pricing: 'free', seeking: 'testers', ai: 'yes', madeWith: 'Godot, , Unity', links: ['https://github.com/a/b', 'ftp://x', 'https://github.com/a/b'], theme: { bg: '#ABCDEF', accent: 'blue', font: 'comic' } });
  assert.equal(fields.stage, '');
  assert.deepEqual(fields.platforms, ['mac', 'web']);
  assert.deepEqual(fields.seeking, [], 'a string is not a list');
  assert.equal(fields.ai, false, 'only true turns the AI badge on');
  assert.deepEqual(fields.madeWith, ['Godot', 'Unity']);
  assert.deepEqual(fields.links, ['https://github.com/a/b']);
  assert.deepEqual(fields.theme, { bg: '#abcdef', accent: '', font: 'sans' });
});

test('page blocks: styles are whitelisted, media needs an approved file', () => {
  const blocks = cleanPage([
    { type: 'text', text: 'Hi', size: 'huge', weight: 950, font: 'pixel', color: 'url(x)', align: 'center', onclick: 'x' },
    { type: 'list', items: 'one\n\ntwo' },
    { type: 'image', url: '/uploads/i-1.png' },
    { type: 'video', url: '/uploads/v-1.mp4' },
    { type: 'button', url: 'javascript:alert(1)' },
    { type: 'divider' },
    { type: 'heading', text: '   ' }
  ], block => block.url === '/uploads/v-1.mp4' ? { url: block.url, type: 'video' } : null);
  assert.deepEqual(blocks, [
    { type: 'text', text: 'Hi', font: 'pixel', align: 'center' },
    { type: 'list', items: ['one', 'two'] },
    { type: 'video', url: '/uploads/v-1.mp4' },
    { type: 'divider' }
  ]);
  assert.equal(cleanPage(Array.from({ length: 50 }, () => ({ type: 'divider' }))).length, 30);
});

test('rich text formats bold, italic and safe links, and nothing else', () => {
  assert.equal(richText('**Жирно** и _курсив_'), '<b>Жирно</b> и <i>курсив</i>');
  assert.match(richText('[Steam](https://store.steampowered.com/app/1?a=1&b=2)'), /<a href="https:\/\/store\.steampowered\.com\/app\/1\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow ugc">Steam<\/a>/);
  assert.equal(richText('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
  assert.equal(richText('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.doesNotMatch(pageHtml([{ type: 'text', text: '"><script>alert(1)</script>', color: '#fff;background:red' }]), /<script|background/);
});

test('store links are recognised by domain, and colours pick readable text', () => {
  assert.equal(linkKind('https://store.steampowered.com/app/1').kind, 'steam');
  assert.equal(linkKind('https://someone.itch.io/game').kind, 'itch');
  assert.equal(linkKind('https://apps.apple.com/app/id1').label, 'App Store');
  assert.deepEqual([linkKind('https://example.org/').kind, linkKind('https://example.org/').label], ['site', 'example.org']);
  assert.equal(linkKind('javascript:alert(1)'), null);
  assert.equal(inkFor('#0f1110'), '#f4f6ef');
  assert.equal(inkFor('#ff8a3d'), '#141714', 'dark text on orange reads better than white');
  assert.match(themeVars({ bg: '#f5efe6' }), /--page-accent:#141714/, 'light pages get a dark default accent');
  assert.equal(themeClass({ bg: '#f5efe6', font: 'serif' }), 'pf-serif themed is-light');
  assert.deepEqual(fontFamiliesFor({ theme: { font: 'display' }, page: [{ font: 'mono' }, { font: 'sans' }] }), ['display', 'mono']);
});
