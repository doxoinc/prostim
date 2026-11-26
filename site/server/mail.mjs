import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';

// Letters from the studio mailbox: a code to confirm an e-mail or to sign in.
// Transports, picked by environment variables:
//   RESEND_API_KEY or BREVO_API_KEY — e-mail over HTTPS (works on Render's free plan, which blocks SMTP ports);
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — any mailbox with SMTP (Yandex 360, Gmail, Mail.ru);
//   MAIL_TRANSPORT=outbox — letters go to <data>/outbox.jsonl (tests, local runs);
//   nothing outside hosting — letters are printed to the console.
// MAIL_FROM is the sender, for example: Vorkuta Games <noreply@vorkutagames.ru>.
export function createMailer(env = process.env, dataDir = '.') {
  const hosted = env.NODE_ENV === 'production' || Boolean(env.RENDER);
  const kind = env.MAIL_TRANSPORT
    || (env.RESEND_API_KEY ? 'resend' : env.BREVO_API_KEY ? 'brevo' : env.SMTP_HOST ? 'smtp' : hosted ? '' : 'console');
  const from = parseAddress(env.MAIL_FROM || (env.SMTP_USER ? `про.стим <${env.SMTP_USER}>` : 'про.стим <noreply@localhost>'));
  // A real mailbox means accounts must confirm their address; the outbox and console are for development.
  const real = ['resend', 'brevo', 'smtp'].includes(kind);

  async function send({ to, subject, text, html }) {
    if (kind === 'resend') {
      return post('https://api.resend.com/emails', { Authorization: `Bearer ${env.RESEND_API_KEY}` }, { from: formatAddress(from), to: [to], subject, text, html });
    }
    if (kind === 'brevo') {
      return post('https://api.brevo.com/v3/smtp/email', { 'api-key': env.BREVO_API_KEY }, { sender: { name: from.name || undefined, email: from.email }, to: [{ email: to }], subject, textContent: text, htmlContent: html });
    }
    if (kind === 'smtp') {
      return smtpSend({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT) || 465, user: env.SMTP_USER, pass: env.SMTP_PASS, secure: env.SMTP_SECURE ? env.SMTP_SECURE !== 'false' : (Number(env.SMTP_PORT) || 465) === 465 }, from, to, subject, text, html);
    }
    if (kind === 'outbox') {
      return appendFile(path.join(dataDir, 'outbox.jsonl'), `${JSON.stringify({ to, subject, text, at: Date.now() })}\n`);
    }
    if (kind === 'console') {
      console.log(`\n✉️  Письмо для ${to}: ${subject}\n${text}\n`);
      return;
    }
    throw new Error('Отправка писем не настроена');
  }

  return { kind, configured: Boolean(kind), real, from, send };
}

async function post(url, headers, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Почтовый сервис ответил ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

export function parseAddress(value) {
  const match = /^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(String(value));
  if (match) return { name: match[1].replace(/^"|"$/g, ''), email: match[2] };
  return { name: '', email: String(value).trim() };
}

function formatAddress({ name, email }) {
  return name ? `${encodeWord(name)} <${email}>` : email;
}

function encodeWord(text) {
  return /^[\x20-\x7e]*$/.test(text) ? `"${text.replace(/"/g, '')}"` : `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`;
}

function base64Lines(text) {
  return Buffer.from(text).toString('base64').replace(/.{76}/g, '$&\r\n');
}

export function buildMessage(from, to, subject, text, html) {
  const boundary = `b-${randomUUID()}`;
  const domain = from.email.split('@')[1] || 'localhost';
  return [
    `From: ${formatAddress(from)}`,
    `To: <${to}>`,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(html),
    `--${boundary}--`,
    ''
  ].join('\r\n');
}

// A small SMTP client: implicit TLS on 465, STARTTLS on 587, AUTH PLAIN. Base64 bodies never start a
// line with a dot, so no dot-stuffing is needed.
async function smtpSend(options, from, to, subject, text, html) {
  let socket = await connect(options);
  let buffer = '';
  let waiting = null;
  const attach = stream => {
    stream.setEncoding('utf8');
    stream.on('data', chunk => { buffer += chunk; flush(); });
    stream.on('error', error => waiting?.reject(error));
  };
  const flush = () => {
    if (!waiting) return;
    const lines = buffer.split('\r\n');
    const done = lines.findIndex(line => /^\d{3} /.test(line));
    if (done < 0) return;
    const reply = lines.slice(0, done + 1).join('\n');
    buffer = lines.slice(done + 1).join('\r\n');
    const { resolve } = waiting;
    waiting = null;
    resolve(reply);
  };
  const read = () => new Promise((resolve, reject) => { waiting = { resolve, reject }; flush(); });
  const command = async (line, expect) => {
    if (line !== null) socket.write(`${line}\r\n`);
    const reply = await read();
    if (!String(expect).split('|').some(code => reply.startsWith(code))) throw new Error(`SMTP: ${reply.slice(0, 200)}`);
    return reply;
  };
  attach(socket);
  const timer = setTimeout(() => socket.destroy(new Error('SMTP: нет ответа')), 20000);
  try {
    await command(null, 220);
    const hello = `EHLO ${from.email.split('@')[1] || 'localhost'}`;
    let features = await command(hello, 250);
    if (!options.secure && /STARTTLS/i.test(features)) {
      await command('STARTTLS', 220);
      socket.removeAllListeners('data');
      socket = tls.connect({ socket, servername: options.host });
      await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject); });
      attach(socket);
      features = await command(hello, 250);
    }
    if (options.user) await command(`AUTH PLAIN ${Buffer.from(`\0${options.user}\0${options.pass || ''}`).toString('base64')}`, 235);
    await command(`MAIL FROM:<${from.email}>`, 250);
    await command(`RCPT TO:<${to}>`, '250|251');
    await command('DATA', 354);
    await command(`${buildMessage(from, to, subject, text, html)}\r\n.`, 250);
    socket.write('QUIT\r\n');
  } finally {
    clearTimeout(timer);
    socket.end();
  }
}

function connect({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    socket.once(secure ? 'secureConnect' : 'connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

// The letter itself: one big code, nothing to click.
export function codeLetter(code, purpose) {
  const action = purpose === 'login' ? 'войти в про.стим' : purpose === 'link' ? 'привязать почту к аккаунту про.стим' : 'подтвердить почту и создать аккаунт про.стим';
  const subject = `${code} — код про.стим`;
  const text = `Твой код: ${code}\n\nВведи его, чтобы ${action}. Код действует 10 минут.\nЕсли это был не ты, просто не отвечай на письмо.`;
  const html = `<!doctype html><html lang="ru"><body style="margin:0;padding:32px 12px;background:#0b0b0c;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#f2f1ee">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="440" cellspacing="0" cellpadding="0" style="max-width:440px;background:#151517;border-radius:24px;overflow:hidden">
<tr><td style="height:6px;background:linear-gradient(120deg,#ff2e63,#ff5f3d 55%,#ffb03b)"></td></tr>
<tr><td style="padding:32px 32px 8px;font-size:15px;color:#a7a6a2">про.стим</td></tr>
<tr><td style="padding:0 32px;font-size:22px;font-weight:700;line-height:1.3">Код, чтобы ${action}</td></tr>
<tr><td style="padding:24px 32px"><div style="padding:18px 0;border-radius:16px;background:#0b0b0c;text-align:center;font-size:38px;font-weight:800;letter-spacing:10px;font-family:ui-monospace,Menlo,Consolas,monospace">${code}</div></td></tr>
<tr><td style="padding:0 32px 32px;font-size:14px;line-height:1.5;color:#a7a6a2">Код действует 10 минут. Если это был не ты, просто не отвечай на письмо.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
