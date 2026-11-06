import type { NextRequest } from 'next/server';
import { roundEndsAt, roundOf } from '@/lib/config';
import { ok, validId } from '@/lib/http';
import { K, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

const BOARDS = { round: 'This round', all: 'All time', bones: 'Bones' } as const;
type Board = keyof typeof BOARDS;

/** Top 50 for a board, plus the caller's own row if they're outside it. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const asked = q.get('board') ?? '';
  const board: Board = Object.hasOwn(BOARDS, asked) ? (asked as Board) : 'round';
  const playerId = q.get('playerId');
  const round = roundOf();
  const key = board === 'round' ? K.round(round) : board === 'all' ? K.allTime : K.bones;

  const top = await store.zTop(key, 50);
  const me = validId(playerId) ? await store.zRank(key, playerId) : null;
  const ids = [...new Set([...top.map((t) => t.id), ...(me && validId(playerId) ? [playerId] : [])])];
  const names = await store.names(ids);

  return ok({
    board,
    label: BOARDS[board],
    round,
    endsAt: roundEndsAt(round),
    entries: top.map((t, i) => ({ rank: i + 1, name: names[t.id] ?? 'Anonymous pup', score: t.score, you: t.id === playerId })),
    you: me && validId(playerId) ? { rank: me.rank, score: me.score, name: names[playerId] ?? 'You' } : null,
  });
}
