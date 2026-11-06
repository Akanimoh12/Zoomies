import 'server-only';
import { K, store } from './store';

/** Best-effort client IP. On Vercel, x-forwarded-for is set by the platform. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || req.headers.get('x-real-ip') || 'local';
}

/**
 * Fixed-window rate limit per IP. Returns true when the request is over the limit.
 * Limits are generous so players sharing one network (school, office) aren't blocked.
 */
export async function overLimit(req: Request, bucket: string, max: number, windowSec: number): Promise<boolean> {
  const win = Math.floor(Date.now() / (windowSec * 1000));
  const n = await store.incr(K.rate(bucket, clientIp(req), win), windowSec + 5);
  return n > max;
}
