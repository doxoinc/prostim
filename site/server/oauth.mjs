import { createPrivateKey, sign } from 'node:crypto';

// Sign-in with Google, Apple, Yandex ID and GitHub (OAuth 2.0, authorization code).
// A provider shows up on the site once its variables are set:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET, GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET;
//   Apple: APPLE_CLIENT_ID (the Services ID), APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the .p8 key) —
//   the site signs the client secret itself; a ready APPLE_CLIENT_SECRET works too, but it expires in 6 months.
// The callback address to register with each provider: <site>/api/auth/oauth/<provider>/callback.
// Apple sends the person back with a POST form; the server turns it into the same GET callback.
// OAUTH_MOCK_URL points every provider at a stand-in server (tests only).

const providers = {
  google: {
    label: 'Google',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    extra: { prompt: 'select_account' },
    async profile({ access_token: accessToken }, base) {
      const data = await getJson(base ? `${base}/google/userinfo` : 'https://openidconnect.googleapis.com/v1/userinfo', { Authorization: `Bearer ${accessToken}` });
      return { id: String(data.sub || ''), email: data.email || '', emailVerified: data.email_verified === true || data.email_verified === 'true', name: data.name || data.given_name || '', login: String(data.email || '').split('@')[0] };
    }
  },
  apple: {
    label: 'Apple',
    authorize: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    scope: 'name email',
    // Asking for the name or the e-mail makes Apple answer with a POST form.
    extra: { response_mode: 'form_post' },
    // Apple has no profile endpoint: who the person is comes in the id_token of the token answer. It arrives
    // straight from Apple over TLS in exchange for our signed secret, so its claims are read, then checked.
    async profile(data, base, env) {
      const claims = jwtClaims(data.id_token);
      if (!base && (claims.iss !== 'https://appleid.apple.com' || claims.aud !== env.APPLE_CLIENT_ID)) throw new Error('Apple вернул чужой токен');
      const email = String(claims.email || '');
      return { id: String(claims.sub || ''), email, emailVerified: claims.email_verified === true || claims.email_verified === 'true', name: '', login: claims.is_private_email === true || claims.is_private_email === 'true' ? '' : email.split('@')[0] };
    }
  },
  yandex: {
    label: 'Яндекс ID',
    authorize: 'https://oauth.yandex.ru/authorize',
    token: 'https://oauth.yandex.ru/token',
    scope: '',
    extra: { force_confirm: 'yes' },
    async profile({ access_token: accessToken }, base) {
      const data = await getJson(base ? `${base}/yandex/userinfo` : 'https://login.yandex.ru/info?format=json', { Authorization: `OAuth ${accessToken}` });
      return { id: String(data.id || ''), email: data.default_email || '', emailVerified: Boolean(data.default_email), name: data.real_name || data.display_name || '', login: data.login || '' };
    }
  },
  github: {
    label: 'GitHub',
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    extra: {},
    async profile({ access_token: accessToken }, base) {
      const headers = { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'prostim' };
      const data = await getJson(base ? `${base}/github/user` : 'https://api.github.com/user', headers);
      const emails = await getJson(base ? `${base}/github/emails` : 'https://api.github.com/user/emails', headers).catch(() => []);
      const primary = Array.isArray(emails) ? emails.find(item => item.primary && item.verified) : null;
      return { id: String(data.id || ''), email: primary?.email || '', emailVerified: Boolean(primary), name: data.name || data.login || '', login: data.login || '' };
    }
  }
};

async function getJson(url, headers) {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Профиль не получен: ${response.status}`);
  return response.json();
}

function jwtClaims(token) {
  try {
    return JSON.parse(Buffer.from(String(token || '').split('.')[1], 'base64url').toString('utf8')) || {};
  } catch {
    return {};
  }
}

// Apple's client secret is a short JWT signed with the team's .p8 key (ES256).
export function appleClientSecret(env = process.env, now = Date.now()) {
  if (env.APPLE_CLIENT_SECRET) return env.APPLE_CLIENT_SECRET;
  let pem = String(env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!pem.includes('BEGIN')) pem = `-----BEGIN PRIVATE KEY-----\n${pem.replace(/\s+/g, '').replace(/.{64}/g, '$&\n')}\n-----END PRIVATE KEY-----`;
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(now / 1000);
  const unsigned = `${part({ alg: 'ES256', kid: env.APPLE_KEY_ID })}.${part({ iss: env.APPLE_TEAM_ID, iat, exp: iat + 3600, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID })}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${signature.toString('base64url')}`;
}

function configured(id, env) {
  if (id === 'apple') return Boolean(env.APPLE_CLIENT_ID && (env.APPLE_CLIENT_SECRET || (env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY)));
  return Boolean(env[`${id.toUpperCase()}_CLIENT_ID`] && env[`${id.toUpperCase()}_CLIENT_SECRET`]);
}

function clientSecret(id, env) {
  return id === 'apple' ? appleClientSecret(env) : env[`${id.toUpperCase()}_CLIENT_SECRET`];
}

export function oauthProviders(env = process.env) {
  return Object.keys(providers).filter(id => configured(id, env));
}

export function oauthLabel(id) {
  return providers[id]?.label || id;
}

export function authorizeUrl(id, { redirectUri, state }, env = process.env) {
  const provider = providers[id];
  const base = env.OAUTH_MOCK_URL;
  const url = new URL(base ? `${base}/${id}/authorize` : provider.authorize);
  const params = { client_id: env[`${id.toUpperCase()}_CLIENT_ID`], redirect_uri: redirectUri, response_type: 'code', state, ...(provider.scope ? { scope: provider.scope } : {}), ...provider.extra };
  // Spaces as %20, not "+": that is how Apple expects "name email".
  url.search = Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  return url.href;
}

// Trades the one-time code for a token, then reads who the person is. Apple gives the name only once, in
// the form it posts back, so the callback passes it along as `name`.
export async function oauthProfile(id, { code, redirectUri, name = '' }, env = process.env) {
  const provider = providers[id];
  const base = env.OAUTH_MOCK_URL;
  const form = new URLSearchParams({ client_id: env[`${id.toUpperCase()}_CLIENT_ID`], client_secret: clientSecret(id, env), code, grant_type: 'authorization_code', redirect_uri: redirectUri });
  const response = await fetch(base ? `${base}/${id}/token` : provider.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !(data.access_token || data.id_token)) throw new Error(`Вход через ${provider.label} не удался`);
  const profile = await provider.profile(data, base, env);
  if (!profile.id) throw new Error(`${provider.label} не вернул профиль`);
  return { ...profile, name: profile.name || String(name || '').trim(), email: String(profile.email || '').trim().toLowerCase() };
}

// The name Apple posts back on the first sign-in: {"name":{"firstName":"…","lastName":"…"}}.
export function appleName(user) {
  try {
    const parsed = JSON.parse(String(user || '{}'));
    return [parsed?.name?.firstName, parsed?.name?.lastName].filter(Boolean).join(' ').slice(0, 40);
  } catch {
    return '';
  }
}
