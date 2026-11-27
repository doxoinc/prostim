import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { encryptPayload, pushEndpointAllowed, vapidAuthorization, vapidKeys } from '../server/push.mjs';
import { isQuietHour, noticeText, notifyPrefs, cleanNotifyPrefs } from '../server/notify.mjs';

const b64 = text => Buffer.from(text, 'base64url');

test('push encryption reproduces the RFC 8291 example byte for byte', () => {
  const body = encryptPayload(
    { keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } },
    b64('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
    { senderPrivateKey: b64('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), salt: b64('DGv6ra1nlYgDCS1FRnbzlw') }
  );
  assert.equal(body.toString('base64url'), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('VAPID keys are made once, kept, and sign a token the push service can check', () => {
  const store = {};
  const keys = vapidKeys({}, store);
  assert.equal(b64(keys.publicKey).length, 65);
  assert.deepEqual(vapidKeys({}, store), keys, 'the same keys come back from the store');
  assert.equal(vapidKeys({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }, store).publicKey, 'pub', 'environment keys win');
  const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'mailto:a@b.c', Date.UTC(2026, 0, 1));
  const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(key, keys.publicKey);
  const [head, claims, signature] = token.split('.');
  assert.deepEqual(JSON.parse(b64(claims)), { aud: 'https://fcm.googleapis.com', exp: Date.UTC(2026, 0, 1) / 1000 + 43200, sub: 'mailto:a@b.c' });
  const raw = b64(keys.publicKey);
  const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.equal(verify('sha256', Buffer.from(`${head}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, b64(signature)), true);
});

test('only real push services are called, and quiet hours follow the subscriber clock', () => {
  assert.equal(pushEndpointAllowed('https://fcm.googleapis.com/fcm/send/x'), true);
  assert.equal(pushEndpointAllowed('https://web.push.apple.com/abc'), true);
  assert.equal(pushEndpointAllowed('https://wns2-par02p.notify.windows.com/w/?token=1'), true);
  assert.equal(pushEndpointAllowed('https://evil.example/fcm.googleapis.com'), false);
  assert.equal(pushEndpointAllowed('http://fcm.googleapis.com/x'), false);
  assert.equal(pushEndpointAllowed('http://127.0.0.1:9/push'), false);
  assert.equal(pushEndpointAllowed('http://127.0.0.1:9/push', { PUSH_TEST_ENDPOINTS: '1' }), true);
  const noonUtc = Date.UTC(2026, 5, 1, 12);
  assert.equal(isQuietHour('Europe/Moscow', noonUtc), false);
  assert.equal(isQuietHour('Asia/Vladivostok', noonUtc), false, '22:00 there, quiet starts at 23');
  assert.equal(isQuietHour('Asia/Kamchatka', noonUtc), true, 'midnight there');
  assert.equal(isQuietHour('Nowhere/Wrong', Date.UTC(2026, 5, 1, 2)), true, 'a bad zone falls back to UTC');
});

test('notification texts group people and keep the right words', () => {
  const names = { a: 'Аня', b: 'Боря' };
  const text = item => noticeText(item, id => names[id] || 'Кто-то', () => 'Пульс');
  assert.equal(text({ type: 'like', actors: ['a'], count: 1 }), 'Аня поддерживает «Пульс»');
  assert.equal(text({ type: 'like', actors: ['b', 'a'], count: 4 }), 'Боря и ещё 3 поддерживают «Пульс»');
  assert.equal(text({ type: 'reply', actors: ['a'], snippet: 'да' }), 'Аня отвечает на твой комментарий: «да»');
  assert.equal(text({ type: 'follow', actors: ['b'] }), 'Новый подписчик: Боря');
  assert.deepEqual(notifyPrefs({}), { messages: true, comments: true, likes: true, follows: true, updates: true, quiet: false });
  assert.deepEqual(cleanNotifyPrefs({ likes: false, quiet: true, admin: true, follows: 'no' }, notifyPrefs({})), { messages: true, comments: true, likes: false, follows: true, updates: true, quiet: true });
});
