import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import http from 'node:http';
import { appleClientSecret, appleName, authorizeUrl, oauthProviders } from '../server/oauth.mjs';
import { codeLetter, createMailer, gmailSettings, smtpSettings } from '../server/mail.mjs';

test('Apple client secret is an ES256 JWT the .p8 key signs, with the team, key and service', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const env = { APPLE_CLIENT_ID: 'com.example.web', APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: pem.replace(/\n/g, '\\n') };
  const jwt = appleClientSecret(env, Date.UTC(2026, 10, 27));
  const [head, body, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), { alg: 'ES256', kid: 'KEY1234567' });
  const claims = JSON.parse(Buffer.from(body, 'base64url'));
  assert.equal(claims.iss, 'TEAM123456');
  assert.equal(claims.sub, 'com.example.web');
  assert.equal(claims.aud, 'https://appleid.apple.com');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.ok(verify('sha256', Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
  const bare = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  assert.ok(appleClientSecret({ ...env, APPLE_PRIVATE_KEY: bare }).split('.').length === 3, 'the key body without PEM lines works too');
  assert.deepEqual(oauthProviders(env), ['apple']);
  assert.deepEqual(oauthProviders({ APPLE_CLIENT_ID: 'x' }), [], 'half the Apple settings is not enough');
});

test('Apple name and authorize URL', () => {
  assert.equal(appleName(JSON.stringify({ name: { firstName: 'Ольга', lastName: 'Смирнова' }, email: 'o@x.ru' })), 'Ольга Смирнова');
  assert.equal(appleName('not json'), '');
  const url = new URL(authorizeUrl('apple', { redirectUri: 'https://site/cb', state: 's1' }, { APPLE_CLIENT_ID: 'svc' }));
  assert.equal(url.searchParams.get('response_mode'), 'form_post');
  assert.match(url.search, /scope=name%20email/);
});

test('mail: the names other projects use for SMTP work, Gmail needs no host', () => {
  assert.equal(smtpSettings({}), null);
  assert.deepEqual(smtpSettings({ GMAIL_USER: 'studio@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh' }), { host: 'smtp.gmail.com', port: 465, user: 'studio@gmail.com', pass: 'abcd efgh', secure: true });
  assert.deepEqual(smtpSettings({ EMAIL_HOST: 'smtp.yandex.ru', EMAIL_PORT: '587', EMAIL_USER: 'a@ya.ru', EMAIL_PASSWORD: 'p' }), { host: 'smtp.yandex.ru', port: 587, user: 'a@ya.ru', pass: 'p', secure: false });
  assert.equal(smtpSettings({ EMAIL_USER: 'team@gmail.com', EMAIL_PASS: 'x' }).host, 'smtp.gmail.com');
  const mailer = createMailer({ RENDER: 'true', EMAIL_USER: 'team@gmail.com', EMAIL_PASS: 'x', EMAIL_FROM: 'Warkuda Games <team@gmail.com>' });
  assert.equal(mailer.kind, 'smtp');
  assert.equal(mailer.real, true);
  assert.equal(mailer.from.name, 'Warkuda Games');
  assert.equal(createMailer({ RENDER: 'true', SENDGRID_API_KEY: 'k' }).kind, 'sendgrid');
  assert.equal(createMailer({ RENDER: 'true' }).configured, false, 'on hosting without settings letters are off');
});

test('mail through the Gmail API: the same four variables as The Box 26, one token for many letters', async () => {
  const calls = [];
  const mock = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    calls.push({ path: request.url, auth: request.headers.authorization || '', body });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    if (request.url === '/token') {
      const form = new URLSearchParams(body);
      const ok = form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === 'r-1' && form.get('client_secret') === 's-1';
      return response.end(JSON.stringify(ok ? { access_token: 'gm-token', expires_in: 3599 } : { error: 'invalid_grant' }));
    }
    response.end(JSON.stringify({ id: 'm-1' }));
  });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  try {
    const env = { RENDER: 'true', GOOGLE_MAIL_CLIENT_ID: 'c-1', GOOGLE_MAIL_CLIENT_SECRET: 's-1', GOOGLE_MAIL_REFRESH_TOKEN: 'r-1', GOOGLE_MAIL_SENDER: 'warcudagames@gmail.com', MAIL_FROM: 'Warkuda Games <noreply@other.com>', GOOGLE_MAIL_MOCK_URL: `http://127.0.0.1:${mock.address().port}` };
    assert.equal(gmailSettings({ ...env, GOOGLE_MAIL_REFRESH_TOKEN: undefined, GOOGLE_MAIL_REFRESH: 'r-2' }).refreshToken, 'r-2', 'the token name is matched by its start');
    assert.equal(gmailSettings({ GOOGLE_MAIL_CLIENT_ID: 'c-1' }), null);
    const mailer = createMailer(env);
    assert.equal(mailer.kind, 'gmail');
    assert.equal(mailer.real, true, 'a real mailbox: e-mail confirmation turns on');
    assert.deepEqual(mailer.from, { name: 'Warkuda Games', email: 'warcudagames@gmail.com' }, 'the name from MAIL_FROM, the address of the Gmail account');
    await mailer.send({ to: 'player@example.com', ...codeLetter('123456', 'register') });
    await mailer.send({ to: 'second@example.com', ...codeLetter('654321', 'login') });
    assert.deepEqual(calls.map(call => call.path), ['/token', '/send', '/send'], 'the access token is reused');
    assert.equal(calls[1].auth, 'Bearer gm-token');
    const letter = Buffer.from(JSON.parse(calls[1].body).raw, 'base64url').toString('utf8');
    assert.match(letter, /^From: "Warkuda Games" <warcudagames@gmail\.com>/m);
    assert.match(letter, /^To: <player@example\.com>/m);
    assert.match(Buffer.from(letter.split('\r\n\r\n')[2].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString('utf8'), /123456/);
    const broken = createMailer({ ...env, GOOGLE_MAIL_REFRESH_TOKEN: 'expired' });
    await assert.rejects(broken.send({ to: 'x@example.com', subject: 's', text: 't', html: 'h' }), /Gmail не выдал доступ: 200 invalid_grant/);
  } finally {
    mock.close();
  }
});
