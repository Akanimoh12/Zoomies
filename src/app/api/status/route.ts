import type { NextRequest } from 'next/server';
import { GAME, roundEndsAt, roundOf, seedFor } from '@/lib/config';
import { fail, ok, validId } from '@/lib/http';
import { K, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Round info plus this player's runs left, best and Bones. */
export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId');
  if (!validId(playerId)) return fail(400, 'Missing player id.');
  const round = roundOf();
  const [used, best, bones, players] = await Promise.all([
    store.getNum(K.runs(round, playerId)),
    store.zRank(K.round(round), playerId),
    store.zRank(K.bones, playerId),
    store.zCount(K.round(round)),
  ]);
  return ok({
    round,
    seed: seedFor(round),
    endsAt: roundEndsAt(round),
    now: Date.now(),
    runsPerRound: GAME.runsPerRound,
    runsLeft: Math.max(0, GAME.runsPerRound - used),
    roundBest: best?.score ?? null,
    roundRank: best?.rank ?? null,
    players,
    bones: bones?.score ?? 0,
  });
}
