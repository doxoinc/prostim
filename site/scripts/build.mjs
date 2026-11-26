import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await rm(path.join(root, 'dist'), { recursive: true, force: true });
await mkdir(path.join(root, 'dist'), { recursive: true });
await cp(path.join(root, 'src'), path.join(root, 'dist'), { recursive: true });
const html = await readFile(path.join(root, 'src/index.html'), 'utf8');
const css = await readFile(path.join(root, 'src/styles.css'), 'utf8');
const modules = await Promise.all(['data.js', 'icons.js', 'state.js', 'page.js', 'chat.js', 'ads.js', 'trust.js', 'timeline.js', 'recommend.js', 'app.js'].map(name => readFile(path.join(root, 'src', name), 'utf8')));
const javascript = modules.map(content => content.replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
const bundled = html.replace('<link rel="stylesheet" href="/styles.css">', `<style>${css}</style>`).replace('<script type="module" src="/app.js"></script>', `<script type="module">${javascript.replace(/<\/script/gi, '<\\/script')}</script>`);
await writeFile(path.join(root, 'dist/index.html'), bundled);
console.log('Built static site in dist/');
