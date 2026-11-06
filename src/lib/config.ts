/** Everything brand- and rule-related lives here. Rename the game by changing `name`. */
export const GAME = {
  name: 'Zoomies',
  tagline: 'Same course for everyone. Race your echo.',
  runsPerRound: 10,
  roundMinutes: 30,
} as const;

export const ROUND_MS = GAME.roundMinutes * 60_000;

/** A round is a fixed 30-minute slot. Everyone in the same round gets the same course. */
export const roundOf = (t: number = Date.now()) => Math.floor(t / ROUND_MS);
export const roundEndsAt = (round: number) => (round + 1) * ROUND_MS;

/** Deterministic course seed for a round, shared by server and client. */
export function seedFor(round: number): number {
  let h = 2166136261;
  for (const c of `${GAME.name.toLowerCase()}-${round}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const NAME_RE = /^[A-Za-z0-9_.\- ]{2,16}$/;
export const ID_RE = /^[0-9a-f-]{36}$/i;
