import { env } from 'cloudflare:workers';
import { RequestError, safeError } from './request-policy';

export function runtime() {
  if (!env.GEMINI_API_KEY) throw new RequestError(503, 'AI analysis is not configured yet. The site owner needs to add the server API key.');
  return { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-3.1-pro-preview' };
}
export async function reserveQuota(userId: string) {
  if (!env.DB) throw new RequestError(503, 'Request limits are not configured.');
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const day = Math.floor(now / 86400000);
  // Atomic increments are shared across Worker instances, not process-local counters.
  const rules = [[`user-minute:${userId}`,minute,30], ['global-day',day,500]] as const;
  for (const [scope, window, limit] of rules) {
    const row = await env.DB.prepare('INSERT INTO request_quotas (scope, window, count, expires_at) VALUES (?, ?, 1, ?) ON CONFLICT(scope, window) DO UPDATE SET count = count + 1 RETURNING count').bind(scope, window, now + 2 * 86400000).first<{count: number}>();
    if (!row || row.count > limit) throw new RequestError(429, 'Request limit reached. Please try again later.');
  }
  await env.DB.prepare('DELETE FROM request_quotas WHERE expires_at < ?').bind(now).run();
}
export function errorResponse(error: unknown) {
  const {status, message} = safeError(error);
  return Response.json({error: message}, {status, headers: {'Cache-Control':'no-store', ...(status === 429 ? {'Retry-After':'60'} : {})}});
}
