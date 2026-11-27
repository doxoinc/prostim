import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { appleClientSecret, appleName, authorizeUrl, oauthProviders } from '../server/oauth.mjs';
import { createMailer, smtpSettings } from '../server/mail.mjs';

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
