import { GAME, ROUND_MS, roundOf, seedFor } from '@/lib/config';
import { cleanName, fail, ok, validId } from '@/lib/http';
import { overLimit } from '@/lib/ratelimit';
import { K, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Spends one of the round's runs and hands back a run ticket. */
export async function POST(req: Request) {
  if (await overLimit(req, 'start', 60, 60)) return fail(429, 'Too many runs from this network. Wait a minute and try again.');
  const body = (await req.json().catch(() => null)) as { playerId?: unknown; name?: unknown } | null;
  if (!body || !validId(body.playerId)) return fail(400, 'Missing player id.');
  const name = cleanName(body.name);
  if (!name) return fail(400, 'Pick a name with 2 to 16 letters or numbers.');

  const round = roundOf();
  const used = await store.incr(K.runs(round, body.playerId), Math.ceil(ROUND_MS / 1000) + 60);
  if (used > GAME.runsPerRound) return fail(429, `You've used all ${GAME.runsPerRound} runs this round. Practice while you wait.`);

  const runId = crypto.randomUUID();
  await Promise.all([
    store.setJSON(K.run(runId), { playerId: body.playerId, round, start: Date.now() }, 60 * 30),
    store.setName(body.playerId, name),
  ]);
  return ok({ runId, round, seed: seedFor(round), runsLeft: GAME.runsPerRound - used });
}
