import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (status, message) => { throw new HttpError(status, message); };

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function token(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = (await scryptAsync(password, salt, 64)).toString('base64url');
  return `scrypt:${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split(':');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scryptAsync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function pairingCode() {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, byte => codeAlphabet[byte % codeAlphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

export function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function cleanText(value, max) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

export function safeHttpUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
  return letters.toLocaleUpperCase('ru');
}

const palette = ['#c2dbad', '#e7c7ab', '#a9bfdc', '#d8c4ec', '#f0d48a', '#9fd8c8', '#f2b8b5', '#c4f56f'];
export function colorFor(seed) {
  let hash = 0;
  for (const character of String(seed)) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return palette[hash % palette.length];
}

// Fixed-window limiter, enough to slow down password guessing on a single instance.
export function limiter(limit, windowMs) {
  const hits = new Map();
  return key => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 5000) for (const [name, value] of hits) if (now - value.start > windowMs) hits.delete(name);
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
