import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';

// Letters from the studio mailbox: a code to confirm an e-mail or to sign in.
// Transports, picked by environment variables:
//   GOOGLE_MAIL_CLIENT_ID, GOOGLE_MAIL_CLIENT_SECRET, GOOGLE_MAIL_REFRESH_TOKEN, GOOGLE_MAIL_SENDER — the
//   studio's Gmail account sends through the Gmail API, as The Box 26 does (HTTPS, so it works on Render's
//   free plan, which blocks SMTP ports);
//   RESEND_API_KEY, BREVO_API_KEY or SENDGRID_API_KEY — e-mail over HTTPS as well;
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — any mailbox with SMTP (Yandex 360, Gmail, Mail.ru). The
//   names other projects use work too: EMAIL_* or MAIL_* (HOST, PORT, USER, PASS or PASSWORD), and
//   GMAIL_USER with GMAIL_APP_PASSWORD, which needs no host;
//   MAIL_TRANSPORT=outbox — letters go to <data>/outbox.jsonl (tests, local runs);
//   nothing outside hosting — letters are printed to the console.
// MAIL_FROM (or EMAIL_FROM) is the sender, for example: Warkuda Games <noreply@warkudagames.com>.
export function smtpSettings(env = process.env) {
  const pick = (...names) => names.map(name => env[name]).find(Boolean) || '';
  const user = pick('SMTP_USER', 'EMAIL_USER', 'MAIL_USER', 'MAIL_USERNAME', 'GMAIL_USER');
  const pass = pick('SMTP_PASS', 'SMTP_PASSWORD', 'EMAIL_PASS', 'EMAIL_PASSWORD', 'MAIL_PASS', 'MAIL_PASSWORD', 'GMAIL_APP_PASSWORD', 'GMAIL_PASS');
  const gmail = Boolean(env.GMAIL_USER) || /@(gmail|googlemail)\.com$/i.test(user);
  const host = pick('SMTP_HOST', 'EMAIL_HOST', 'MAIL_HOST') || (gmail && pass ? 'smtp.gmail.com' : '');
  const port = Number(pick('SMTP_PORT', 'EMAIL_PORT', 'MAIL_PORT')) || 465;
  const secureFlag = pick('SMTP_SECURE', 'EMAIL_SECURE', 'MAIL_SECURE');
  return host ? { host, port, user, pass, secure: secureFlag ? secureFlag !== 'false' : port === 465 } : null;
}

// The Gmail API with an OAuth refresh token. The token's name is matched by its start, so
// GOOGLE_MAIL_REFRESH_TOKEN and shorter spellings work alike.
export function gmailSettings(env = process.env) {
  const refreshKey = Object.keys(env).filter(key => key.startsWith('GOOGLE_MAIL_REFRESH') && env[key]).sort()[0];
  const settings = { clientId: env.GOOGLE_MAIL_CLIENT_ID || '', clientSecret: env.GOOGLE_MAIL_CLIENT_SECRET || '', refreshToken: refreshKey ? env[refreshKey] : '', sender: env.GOOGLE_MAIL_SENDER || '' };
  return Object.values(settings).every(Boolean) ? settings : null;
}

export function createMailer(env = process.env, dataDir = '.') {
  const hosted = env.NODE_ENV === 'production' || Boolean(env.RENDER);
  const smtp = smtpSettings(env);
  const gmail = gmailSettings(env);
  const kind = env.MAIL_TRANSPORT
    || (gmail ? 'gmail' : env.RESEND_API_KEY ? 'resend' : env.BREVO_API_KEY ? 'brevo' : env.SENDGRID_API_KEY ? 'sendgrid' : smtp ? 'smtp' : hosted ? '' : 'console');
  const sender = env.MAIL_FROM || env.EMAIL_FROM || env.SMTP_FROM;
  let from = parseAddress(sender || (smtp?.user ? `про.стим <${smtp.user}>` : 'про.стим <noreply@localhost>'));
  // Gmail sends only from its own address: MAIL_FROM may give the name, the address is the account's.
  if (kind === 'gmail') {
    const account = parseAddress(gmail.sender);
    from = { name: (sender ? from.name : '') || account.name || 'про.стим', email: account.email };
  }
  // A real mailbox means accounts must confirm their address; the outbox and console are for development.
  const real = ['gmail', 'resend', 'brevo', 'sendgrid', 'smtp'].includes(kind);
  let gmailToken = null;

  async function gmailSend(to, subject, text, html) {
    const base = env.GOOGLE_MAIL_MOCK_URL;
    if (!gmailToken || gmailToken.expiresAt < Date.now() + 60000) {
      const response = await fetch(base ? `${base}/token` : 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ client_id: gmail.clientId, client_secret: gmail.clientSecret, refresh_token: gmail.refreshToken, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(15000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token) throw new Error(`Gmail не выдал доступ: ${response.status} ${data.error || ''} ${data.error_description || ''}`.trim());
      gmailToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
    }
    const raw = Buffer.from(buildMessage(from, to, subject, text, html)).toString('base64url');
    return post(base ? `${base}/send` : 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { Authorization: `Bearer ${gmailToken.value}` }, { raw });
  }

  async function send({ to, subject, text, html }) {
    if (kind === 'gmail') {
      return gmailSend(to, subject, text, html);
    }
    if (kind === 'resend') {
      return post('https://api.resend.com/emails', { Authorization: `Bearer ${env.RESEND_API_KEY}` }, { from: formatAddress(from), to: [to], subject, text, html });
    }
    if (kind === 'brevo') {
      return post('https://api.brevo.com/v3/smtp/email', { 'api-key': env.BREVO_API_KEY }, { sender: { name: from.name || undefined, email: from.email }, to: [{ email: to }], subject, textContent: text, htmlContent: html });
    }
    if (kind === 'sendgrid') {
      return post('https://api.sendgrid.com/v3/mail/send', { Authorization: `Bearer ${env.SENDGRID_API_KEY}` }, { personalizations: [{ to: [{ email: to }] }], from: { email: from.email, ...(from.name ? { name: from.name } : {}) }, subject, content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }] });
    }
    if (kind === 'smtp') {
      return smtpSend(smtp, from, to, subject, text, html);
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

  return { kind, configured: Boolean(kind), real, from, smtp, send };
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
