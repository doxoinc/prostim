// Sign-in with Google, Yandex ID and GitHub (OAuth 2.0, authorization code).
// A provider shows up on the site once both of its variables are set:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET, GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET.
// The callback address to register with each provider: <site>/api/auth/oauth/<provider>/callback.
// OAUTH_MOCK_URL points every provider at a stand-in server (tests only).

const providers = {
  google: {
    label: 'Google',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    extra: { prompt: 'select_account' },
    async profile(accessToken, base) {
      const data = await getJson(base ? `${base}/google/userinfo` : 'https://openidconnect.googleapis.com/v1/userinfo', { Authorization: `Bearer ${accessToken}` });
      return { id: String(data.sub || ''), email: data.email || '', emailVerified: data.email_verified === true || data.email_verified === 'true', name: data.name || data.given_name || '', login: String(data.email || '').split('@')[0] };
    }
  },
  yandex: {
    label: 'Яндекс ID',
    authorize: 'https://oauth.yandex.ru/authorize',
    token: 'https://oauth.yandex.ru/token',
    scope: '',
    extra: { force_confirm: 'yes' },
    async profile(accessToken, base) {
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
    async profile(accessToken, base) {
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

export function oauthProviders(env = process.env) {
  return Object.keys(providers).filter(id => env[`${id.toUpperCase()}_CLIENT_ID`] && env[`${id.toUpperCase()}_CLIENT_SECRET`]);
}

export function oauthLabel(id) {
  return providers[id]?.label || id;
}

export function authorizeUrl(id, { redirectUri, state }, env = process.env) {
  const provider = providers[id];
  const base = env.OAUTH_MOCK_URL;
  const url = new URL(base ? `${base}/${id}/authorize` : provider.authorize);
  const params = { client_id: env[`${id.toUpperCase()}_CLIENT_ID`], redirect_uri: redirectUri, response_type: 'code', state, ...(provider.scope ? { scope: provider.scope } : {}), ...provider.extra };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

// Trades the one-time code for a token, then reads who the person is.
export async function oauthProfile(id, { code, redirectUri }, env = process.env) {
  const provider = providers[id];
  const base = env.OAUTH_MOCK_URL;
  const form = new URLSearchParams({ client_id: env[`${id.toUpperCase()}_CLIENT_ID`], client_secret: env[`${id.toUpperCase()}_CLIENT_SECRET`], code, grant_type: 'authorization_code', redirect_uri: redirectUri });
  const response = await fetch(base ? `${base}/${id}/token` : provider.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`Вход через ${provider.label} не удался`);
  const profile = await provider.profile(data.access_token, base);
  if (!profile.id) throw new Error(`${provider.label} не вернул профиль`);
  return { ...profile, email: String(profile.email || '').trim().toLowerCase() };
}
