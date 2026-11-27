import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto';

// Web Push without a library: VAPID (RFC 8292) to say who sends, aes128gcm (RFC 8291) so only the
// browser that subscribed can read the message. The browser's push service (Google, Apple, Mozilla,
// Microsoft) only relays the encrypted bytes.

const b64url = buffer => Buffer.from(buffer).toString('base64url');
const fromB64url = text => Buffer.from(String(text || ''), 'base64url');

// Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (base64url, raw P-256), or are made once and kept
// in the database, so subscriptions survive restarts and deploys.
export function vapidKeys(env, store) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  if (store.vapid?.publicKey && store.vapid?.privateKey) return store.vapid;
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  store.vapid = { publicKey: b64url(Buffer.concat([Buffer.from([4]), fromB64url(jwk.x), fromB64url(jwk.y)])), privateKey: jwk.d };
  return store.vapid;
}

function signingKey(keys) {
  const raw = fromB64url(keys.publicKey);
  return createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64url(raw.subarray(1, 33)), y: b64url(raw.subarray(33, 65)) }, format: 'jwk' });
}

export function vapidAuthorization(endpoint, keys, subject, now = Date.now()) {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: signingKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

// One record, as RFC 8291 describes: salt | record size | key id length | sender key | ciphertext.
// The sender key and salt are fresh for every message; tests pass fixed ones to check the RFC example.
export function encryptPayload(subscription, payload, { senderPrivateKey = null, salt = randomBytes(16) } = {}) {
  const userKey = fromB64url(subscription.keys?.p256dh);
  const authSecret = fromB64url(subscription.keys?.auth);
  if (userKey.length !== 65 || authSecret.length < 16) throw new Error('bad subscription keys');
  const sender = createECDH('prime256v1');
  if (senderPrivateKey) sender.setPrivateKey(senderPrivateKey); else sender.generateKeys();
  const senderKey = sender.getPublicKey();
  const shared = sender.computeSecret(userKey);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), userKey, senderKey]), 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(65, 20);
  return Buffer.concat([header, senderKey, body]);
}

// Push services the server will talk to. Anything else is refused, so a subscription cannot be used
// to make the server call arbitrary addresses. PUSH_TEST_ENDPOINTS=1 also allows http://127.0.0.1 (tests).
const pushHosts = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com', 'api.push.apple.com', 'notify.windows.com', 'push.yandex.ru', 'push.yandex.net'];

export function pushEndpointAllowed(value, env = {}) {
  let url;
  try { url = new URL(String(value || '')); } catch { return false; }
  if (env.PUSH_TEST_ENDPOINTS === '1' && url.protocol === 'http:' && url.hostname === '127.0.0.1') return true;
  if (url.protocol !== 'https:') return false;
  return pushHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

// Returns the push service's status: 201 delivered, 404/410 the subscription is gone.
export async function sendPush(subscription, message, keys, { subject, ttl = 24 * 3600, urgency = 'normal', topic = '' } = {}) {
  const body = encryptPayload(subscription, JSON.stringify(message));
  const headers = {
    TTL: String(ttl),
    Urgency: urgency,
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(body.length),
    Authorization: vapidAuthorization(subscription.endpoint, keys, subject)
  };
  if (topic) headers.Topic = topic.replace(/[^\w-]/g, '').slice(0, 32);
  const response = await fetch(subscription.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
  return response.status;
}
