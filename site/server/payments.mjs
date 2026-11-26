// Payments for promotion and the subscription.
//   YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY — real payments through ЮKassa (cards, СБП, SberPay, ЮMoney).
//     Notifications: <site>/api/payments/yookassa (event payment.succeeded and payment.canceled).
//   Without them the site runs in test mode: the same steps, a «test payment» button, no money moves.
//   PAYMENTS_TEST=0 turns the test mode off, so nothing can be bought until ЮKassa is connected.

const API = 'https://api.yookassa.ru/v3/payments';

export function paymentsMode(env = process.env) {
  if (env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY) return 'yookassa';
  return env.PAYMENTS_TEST === '0' ? '' : 'test';
}

function auth(env) {
  return `Basic ${Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64')}`;
}

// Creates the payment at ЮKassa and returns where to send the buyer.
export async function createYookassaPayment(payment, returnUrl, env = process.env) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { Authorization: auth(env), 'Idempotence-Key': payment.id, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { value: payment.amount.toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: returnUrl },
      description: payment.description.slice(0, 128),
      metadata: { paymentId: payment.id }
    }),
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error(data.description || `ЮKassa ответила ${response.status}`);
  return { providerId: data.id, confirmationUrl: data.confirmation?.confirmation_url || '' };
}

// The status always comes from ЮKassa itself, never from what a notification claims.
export async function yookassaStatus(providerId, env = process.env) {
  const response = await fetch(`${API}/${encodeURIComponent(providerId)}`, { headers: { Authorization: auth(env) }, signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`ЮKassa ответила ${response.status}`);
  return { status: data.status, paid: data.status === 'succeeded' && data.paid !== false, amount: Number(data.amount?.value) || 0, paymentId: data.metadata?.paymentId || '' };
}
