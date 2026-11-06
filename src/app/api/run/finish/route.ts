import { seedFor } from '@/lib/config';
import { fail, ok, validId } from '@/lib/http';
import { overLimit } from '@/lib/ratelimit';
import { checkRun } from '@/lib/scoring';
import { K, ROUND_BOARD_TTL, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

interface Ticket { playerId: string; round: number; start: number }

/** Submits a finished ranked run. Each ticket can be used once. */
export async function POST(req: Request) {
  if (await overLimit(req, 'finish', 60, 60)) return fail(429, 'Too many requests from this network. Wait a minute and try again.');
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !validId(b.runId) || !validId(b.playerId)) return fail(400, 'Missing run ticket.');

  const ticket = await store.takeJSON<Ticket>(K.run(b.runId));
  if (!ticket || ticket.playerId !== b.playerId) return fail(404, 'This run ticket expired or was already used.');

  const sub = { score: Math.floor(Number(b.score)), dist: Number(b.dist), bones: Math.floor(Number(b.bones)), closes: Math.floor(Number(b.closes)) };
  const problem = checkRun(sub, (Date.now() - ticket.start) / 1000, seedFor(ticket.round));
  if (problem) return fail(422, problem);

  const id = ticket.playerId;
  await store.zMax(K.round(ticket.round), id, sub.score);
  await Promise.all([
    store.expire(K.round(ticket.round), ROUND_BOARD_TTL),
    store.zMax(K.allTime, id, sub.score),
    sub.bones > 0 ? store.zIncr(K.bones, id, sub.bones) : Promise.resolve(0),
  ]);
  const [round, all, bones] = await Promise.all([
    store.zRank(K.round(ticket.round), id),
    store.zRank(K.allTime, id),
    store.zRank(K.bones, id),
  ]);
  return ok({
    roundRank: round?.rank ?? null,
    roundBest: round?.score ?? sub.score,
    allTimeRank: all?.rank ?? null,
    totalBones: bones?.score ?? 0,
  });
}
