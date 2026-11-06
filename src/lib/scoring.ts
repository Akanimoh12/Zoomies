import { MAX_SPEED, MOVER_WAKE, ZOOM_TIME, generate, newRun } from '../game/engine';

/**
 * Server-side checks on a submitted ranked run.
 *
 * The server knows the round's seed, so it rebuilds the same course and caps bones, close calls
 * and Zoomies balls at what actually exists up to the claimed distance. Distance itself is capped
 * by real time since the run ticket was issued. This still trusts the client about *how far* it
 * got; for real prizes, replay the run on the server from recorded inputs.
 */
export interface Submission { score: number; dist: number; bones: number; closes: number }

/** How far past the dog's position an item can be and still count (bone/ball reach, skateboards that rolled toward the dog). */
const PICKUP_REACH = 200;
const OBSTACLE_REACH = MOVER_WAKE * 0.5 + 200;

export function courseLimits(seed: number, dist: number) {
  const r = newRun(seed, true, null);
  generate(r, dist + OBSTACLE_REACH + 1000);
  let bones = 0;
  let balls = 0;
  let obstacles = 0;
  for (const it of r.items) {
    if (it.kind === 'bone') bones += it.x < dist + PICKUP_REACH ? 1 : 0;
    else if (it.kind === 'ball') balls += it.x < dist + PICKUP_REACH ? 1 : 0;
    else if (it.kind !== 'pigeon') obstacles += it.x < dist + OBSTACLE_REACH ? 1 : 0; // pigeons don't give close calls
  }
  return { bones, balls, obstacles };
}

export function checkRun(s: Submission, elapsedSec: number, seed: number): string | null {
  const nums = [s.score, s.dist, s.bones, s.closes];
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return 'Bad numbers in the run.';
  if (elapsedSec < 0.5) return 'Run was too short.';
  if (s.dist > MAX_SPEED * elapsedSec + 400) return 'Distance is faster than the dog can run.';

  const lim = courseLimits(seed, s.dist);
  if (s.bones > lim.bones) return 'More bones than the course holds.';
  if (s.closes > lim.obstacles) return 'Too many close calls for that distance.';
  // 1 pt per 10 units run, +1x more while a Zoomies ball is active (at most ZOOM_TIME s each),
  // bones 10 (20 doubled), close calls 25 (50 doubled).
  const maxScore = s.dist / 10 + lim.balls * ZOOM_TIME * (MAX_SPEED / 10) + s.bones * 20 + s.closes * 50 + 50;
  if (s.score > maxScore) return 'Score is higher than the run allows.';
  return null;
}
