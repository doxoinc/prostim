import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';

// Draws the app icons as PNG files: the arch mark of про.стим on the brand gradient.
// Run `node scripts/icons.mjs` after changing the mark; the files live in src/ and are committed.

const root = fileURLToPath(new URL('../', import.meta.url));
const stops = [[0, [0xff, 0x2e, 0x63]], [0.55, [0xff, 0x5f, 0x3d]], [1, [0xff, 0xb0, 0x3b]]];

function gradient(t) {
  for (let index = 1; index < stops.length; index += 1) {
    const [end, to] = stops[index];
    const [start, from] = stops[index - 1];
    if (t <= end) {
      const k = (t - start) / (end - start);
      return from.map((value, channel) => Math.round(value + (to[channel] - value) * k));
    }
  }
  return stops.at(-1)[1];
}

// Distance from a point to the mark in its 64×64 box: two legs, the arch between them, and the dot.
function markDistance(x, y) {
  const leg = (cx) => Math.hypot(x - cx, y < 29 ? y - 29 : y > 47 ? y - 47 : 0);
  const arch = y <= 29 ? Math.abs(Math.hypot(x - 32, y - 29) - 13) : Infinity;
  const stroke = Math.min(leg(19), leg(45), arch) - 4.25;
  const dot = Math.hypot(x - 32, y - 43) - 5;
  return Math.min(stroke, dot);
}

function roundedInside(x, y, size, radius) {
  const dx = Math.max(radius - x, 0, x - (size - radius));
  const dy = Math.max(radius - y, 0, y - (size - radius));
  return Math.hypot(dx, dy) <= radius;
}

// mode: 'rounded' (any purpose), 'full' (maskable and Apple: the system cuts the shape), 'badge' (white mark only)
function draw(size, mode, markScale = 1) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let background = 0;
      let mark = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = px + (sx + 0.5) / samples;
          const y = py + (sy + 0.5) / samples;
          const inside = mode === 'full' || (mode === 'rounded' && roundedInside(x, y, size, size * 0.225));
          if (inside) background += 1;
          const mx = 32 + ((x / size) * 64 - 32) / markScale;
          const my = 32 + ((y / size) * 64 - 32) / markScale;
          if (markDistance(mx, my) <= 0 && (inside || mode === 'badge')) mark += 1;
        }
      }
      const total = samples * samples;
      const offset = (py * size + px) * 4;
      const [r, g, b] = gradient((px + py) / (2 * size));
      const markShare = mark / total;
      if (mode === 'badge') {
        pixels.set([255, 255, 255, Math.round(255 * markShare)], offset);
        continue;
      }
      const alpha = background / total;
      pixels.set([
        Math.round(r + (255 - r) * markShare / Math.max(alpha, 1e-6)),
        Math.round(g + (255 - g) * markShare / Math.max(alpha, 1e-6)),
        Math.round(b + (255 - b) * markShare / Math.max(alpha, 1e-6)),
        Math.round(255 * alpha)
      ].map(value => Math.max(0, Math.min(255, value))), offset);
    }
  }
  return png(size, pixels);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buffer => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const files = [
  ['icon-192.png', draw(192, 'rounded')],
  ['icon-512.png', draw(512, 'rounded')],
  ['icon-maskable-512.png', draw(512, 'full', 0.72)],
  ['apple-touch-icon.png', draw(180, 'full', 0.86)],
  ['badge-96.png', draw(96, 'badge', 1.15)]
];
for (const [name, bytes] of files) await writeFile(path.join(root, 'src', name), bytes);
console.log(`Wrote ${files.map(([name]) => name).join(', ')}`);
