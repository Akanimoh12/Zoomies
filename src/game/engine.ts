/* Pure game logic: no DOM, no React. The renderer and UI read from World. */

export const WORLD_H = 640;
export const GROUND = 486;
export const DOG_X = 96;
export const GRAV = 2700;
export const JUMP_V = 900; // full jump peaks ~150 world px
export const SHORT_HOP_V = 540; // releasing early caps upward speed here
export const SEG_LEN = 1000; // 100 m
export const ZOOM_TIME = 6;
export const MAX_SPEED = 860;
export const speedAt = (d: number) => Math.min(MAX_SPEED, 380 + d * 0.017);
export const DOG_SCALE = 1.3;
/** Fixed simulation step. Same physics on every device and frame rate. */
export const STEP = 1 / 120;
/** Pigeons and skateboards start moving this far ahead of the dog, on every screen size. */
export const MOVER_WAKE = 1000;

export type ObstacleKind = 'hydrant' | 'cone' | 'trash' | 'bench' | 'crates' | 'pigeon' | 'skate';
export type Kind = ObstacleKind | 'bone' | 'ball';

export interface Item {
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  gone?: boolean;
  passed?: boolean;
  minGap?: number;
}
export interface Echo { score: number; dist: number }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; s: number }
export interface FloatText { txt: string; x: number; y: number; color: string; life: number }
export type Sfx = 'jump' | 'slide' | 'bone' | 'zoom' | 'crash' | 'close' | 'echo' | 'mile';
export type Phase = 'attract' | 'play' | 'dying' | 'paused';

export interface Run {
  ranked: boolean;
  rng: () => number;
  items: Item[];
  nextD: number;
  dist: number;
  score: number;
  bones: number;
  h: number;
  vy: number;
  slideT: number;
  slideHold: boolean;
  queuedSlide: boolean;
  jumpHeld: boolean;
  jumpBuffer: number;
  jumpAt: number;
  t: number;
  mult: number;
  zoomT: number;
  segBones: number[];
  segGot: number[];
  cause: string;
  dead: boolean;
  deathT: number;
  spin: number;
  closes: number;
  nextMile: number;
  ghost: Echo | null;
  ghostCalled: boolean;
}

export interface World {
  run: Run | null;
  particles: Particle[];
  texts: FloatText[];
  shake: number;
  clock: number;
  attractD: number;
  events: Sfx[];
}

export const CAUSES: Record<ObstacleKind | 'quit', string> = {
  hydrant: 'Hit a hydrant',
  cone: 'Clipped a cone',
  trash: 'Crashed into a trash can',
  bench: 'Tripped over a bench',
  crates: 'Smacked into crates',
  pigeon: 'Bumped a pigeon',
  skate: 'Flattened by a skateboard',
  quit: 'Ended the run',
};

const DIMS: Record<ObstacleKind, { w: number; h: number; lift?: number; vx?: number }> = {
  hydrant: { w: 30, h: 40 },
  cone: { w: 26, h: 34 },
  trash: { w: 36, h: 56 },
  bench: { w: 96, h: 34 },
  crates: { w: 60, h: 70 },
  pigeon: { w: 40, h: 24, lift: 40, vx: 60 },
  skate: { w: 52, h: 18, vx: 190 },
};

/* kind, weight, first appears at distance */
const POOL: [ObstacleKind, number, number][] = [
  ['hydrant', 3, 0],
  ['cone', 2, 0],
  ['trash', 3, 1200],
  ['bench', 2, 2200],
  ['pigeon', 3, 2600],
  ['crates', 2, 4000],
  ['skate', 2, 6000],
];

export function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashN(n: number) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function createWorld(): World {
  return { run: null, particles: [], texts: [], shake: 0, clock: 0, attractD: 0, events: [] };
}

export function newRun(seed: number, ranked: boolean, ghost: Echo | null): Run {
  return {
    ranked, rng: mulberry32(seed), items: [], nextD: 1400, dist: 0, score: 0, bones: 0,
    h: 0, vy: 0, slideT: 0, slideHold: false, queuedSlide: false, jumpHeld: false, jumpBuffer: 0, jumpAt: -1,
    t: 0, mult: 1, zoomT: 0, segBones: [], segGot: [], cause: '', dead: false, deathT: 0, spin: 0,
    closes: 0, nextMile: 5000, ghost, ghostCalled: false,
  };
}

/* ---------- course generation ---------- */
function addObstacle(r: Run, kind: ObstacleKind, x: number) {
  const d = DIMS[kind];
  r.items.push({ kind, x, y: GROUND - d.h - (d.lift ?? 0), w: d.w, h: d.h });
}
function addBone(r: Run, x: number, y: number) {
  r.items.push({ kind: 'bone', x, y, w: 24, h: 15 });
  const s = Math.floor(x / SEG_LEN);
  r.segBones[s] = (r.segBones[s] || 0) + 1;
}
function pickKind(r: Run, d: number): ObstacleKind {
  const opts = POOL.filter((p) => d >= p[2]);
  let v = r.rng() * opts.reduce((a, p) => a + p[1], 0);
  for (const p of opts) {
    v -= p[1];
    if (v <= 0) return p[0];
  }
  return 'hydrant';
}

export function generate(r: Run, upto: number) {
  while (r.nextD < upto) {
    const d = r.nextD;
    const rnd = r.rng;
    const sp = speedAt(d);
    let first: ObstacleKind;
    let end: number;

    if (d > 9000 && rnd() < 0.24) {
      // combos that need two different moves in a row
      if (rnd() < 0.5) {
        addObstacle(r, 'pigeon', d);
        const x2 = d + 40 + sp * 0.55;
        addObstacle(r, 'hydrant', x2);
        first = 'pigeon';
        end = x2 + 30;
      } else {
        addObstacle(r, 'hydrant', d);
        const x2 = d + 30 + sp * 0.88;
        addObstacle(r, rnd() < 0.5 ? 'cone' : 'trash', x2);
        first = 'hydrant';
        end = x2 + 36;
      }
    } else {
      first = pickKind(r, d);
      addObstacle(r, first, d);
      end = d + DIMS[first].w + (first === 'skate' ? sp * 0.35 : 0);
    }

    const w = DIMS[first].w;
    const center = d + w / 2;
    const b = rnd();
    if (first !== 'pigeon' && first !== 'skate' && b < 0.45) {
      // an arc of bones along a full jump: reward for good timing
      for (let i = -2; i <= 2; i++) {
        const dt = i * 0.11;
        const hb = 150 - 1350 * dt * dt + 15;
        addBone(r, center - 12 + sp * dt, GROUND - hb - 15);
      }
    } else if (first === 'pigeon' && b < 0.6) {
      for (let i = 0; i < 4; i++) addBone(r, d - 70 + i * 40, GROUND - 21);
    } else if (b < 0.78) {
      const start = end + sp * 0.42;
      for (let i = 0; i < 4; i++) addBone(r, start + i * 40, GROUND - 23);
    }
    if (d > 4000 && rnd() < 0.07) r.items.push({ kind: 'ball', x: end + sp * 0.62, y: GROUND - 100, w: 24, h: 24 });

    r.nextD = end + sp * (0.7 + rnd() * 0.8) + 100;
  }
}

/* ---------- helpers ---------- */
interface Box { l: number; r: number; t: number; b: number }
export function dogBox(r: Run): Box {
  const bottom = GROUND - r.h;
  const k = DOG_SCALE;
  if (r.slideT > 0 && r.h === 0) return { l: DOG_X + 6 * k, r: DOG_X + 78 * k, t: bottom - 28 * k, b: bottom - 2 };
  return { l: DOG_X + 10 * k, r: DOG_X + 74 * k, t: bottom - 54 * k, b: bottom - 2 };
}
const hit = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

export function burst(w: World, x: number, y: number, color: string, n: number, spread = 160) {
  for (let i = 0; i < n; i++)
    w.particles.push({ x, y, vx: (Math.random() - 0.5) * spread, vy: -Math.random() * spread, life: 0.5 + Math.random() * 0.3, color, s: 4 });
}
export function say(w: World, txt: string, x: number, y: number, color = '#F5EFE0') {
  w.texts.push({ txt, x, y, color, life: 1 });
}

/* ---------- controls ---------- */
function doJump(w: World, r: Run) {
  r.slideT = 0;
  r.slideHold = false;
  r.queuedSlide = false;
  r.vy = r.jumpHeld ? JUMP_V : SHORT_HOP_V + 120;
  r.h = 0.01;
  r.jumpAt = r.t;
  r.jumpBuffer = 0;
  w.events.push('jump');
}
export function pressJump(w: World) {
  const r = w.run;
  if (!r || r.dead) return;
  r.jumpHeld = true;
  if (r.h === 0) doJump(w, r);
  else r.jumpBuffer = 0.13; // pressed just before landing: jump as soon as we touch down
}
export function releaseJump(w: World) {
  const r = w.run;
  if (!r) return;
  r.jumpHeld = false;
  if (r.h > 0 && r.vy > SHORT_HOP_V) r.vy = SHORT_HOP_V; // tap = medium hop, hold = full jump
}
function startSlide(w: World, r: Run, hold: boolean) {
  r.slideT = 0.6;
  r.slideHold = hold;
  w.events.push('slide');
}
export function slide(w: World, hold: boolean) {
  const r = w.run;
  if (!r || r.dead) return;
  if (r.h > 0) {
    if (r.t - r.jumpAt < 0.14 && r.vy > 0) {
      r.h = 0;
      r.vy = 0;
      startSlide(w, r, hold);
    } else {
      r.vy = -1600; // fast-fall into a slide
      r.queuedSlide = true;
      r.slideHold = hold;
    }
  } else if (r.slideT <= 0) startSlide(w, r, hold);
  else r.slideHold = hold;
}
export function releaseSlide(w: World) {
  if (w.run) w.run.slideHold = false;
}

function die(w: World, r: Run, kind: ObstacleKind) {
  r.dead = true;
  r.cause = CAUSES[kind];
  r.deathT = 0.9;
  r.vy = 520;
  r.h = Math.max(r.h, 0.01);
  r.slideT = 0;
  w.shake = 0.35;
  w.events.push('crash');
  burst(w, DOG_X + 60, GROUND - r.h - 40, '#F5EFE0', 12, 260);
}

/* ---------- step ---------- */
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

/** Advances the world. Returns 'over' once a death animation has finished. */
export function update(w: World, dt: number, viewW: number, phase: Phase): 'over' | null {
  w.clock += dt;
  if (w.shake > 0) w.shake = Math.max(0, w.shake - dt);
  for (const p of w.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 900 * dt;
    p.life -= dt;
  }
  w.particles = w.particles.filter((p) => p.life > 0);
  for (const t of w.texts) {
    t.y -= 40 * dt;
    t.life -= dt * 0.9;
  }
  w.texts = w.texts.filter((t) => t.life > 0);

  const r = w.run;
  if (phase === 'attract' || !r) {
    w.attractD += 220 * dt;
    return null;
  }
  if (phase === 'paused') return null;

  if (phase === 'dying' || r.dead) {
    r.vy -= GRAV * dt;
    r.h += r.vy * dt;
    r.spin += dt * 9;
    if (r.h <= 0) {
      r.h = 0;
      r.vy = 0;
    }
    r.deathT -= dt;
    return r.deathT <= 0 ? 'over' : null;
  }

  const sp = speedAt(r.dist);
  const dd = sp * dt;
  r.dist += dd;
  r.t += dt;
  r.score += (dd / 10) * r.mult;

  if (r.ghost && !r.ghostCalled && r.dist > r.ghost.dist) {
    r.ghostCalled = true;
    say(w, 'PASSED YOUR ECHO', DOG_X + 130, GROUND - 200, '#9DBBFF');
    w.events.push('echo');
  }
  if (r.dist >= r.nextMile) {
    say(w, `${fmt(r.nextMile / 10)} M`, DOG_X + 130, GROUND - 170, '#8FD3A8');
    w.events.push('mile');
    r.nextMile += 5000;
  }

  generate(r, r.dist + Math.max(viewW, MOVER_WAKE) + 400);

  if (r.h > 0 || r.vy > 0) {
    r.vy -= GRAV * dt;
    r.h += r.vy * dt;
    if (r.h <= 0) {
      r.h = 0;
      r.vy = 0;
      burst(w, DOG_X + 30, GROUND, '#8A6A48', 5, 100);
      if (r.jumpBuffer > 0) doJump(w, r);
      else if (r.queuedSlide) {
        r.queuedSlide = false;
        startSlide(w, r, r.slideHold);
      }
    }
  }
  r.jumpBuffer = Math.max(0, r.jumpBuffer - dt);
  if (r.slideT > 0) {
    r.slideT -= dt;
    if (r.slideT <= 0 && r.slideHold) r.slideT = 0.05;
  }
  if (r.zoomT > 0) {
    r.zoomT -= dt;
    if (r.zoomT <= 0) {
      r.zoomT = 0;
      r.mult = 1;
    }
  }
  if (r.h === 0 && Math.random() < dt * 9)
    w.particles.push({ x: DOG_X + 8, y: GROUND - 2, vx: -sp * 0.4, vy: -40, life: 0.3, color: '#8A6A48', s: 4 });

  const box = dogBox(r);
  for (const it of r.items) {
    let sx = it.x - r.dist + DOG_X;
    const mover = it.kind === 'pigeon' || it.kind === 'skate' ? DIMS[it.kind].vx ?? 0 : 0;
    if (mover && it.x - r.dist < MOVER_WAKE) {
      it.x -= mover * dt;
      sx = it.x - r.dist + DOG_X;
    }
    if (sx < -140) {
      it.gone = true;
      continue;
    }
    if (sx > viewW + 40) continue;

    if (it.kind === 'bone') {
      if (hit(box, { l: sx - 2, r: sx + it.w + 2, t: it.y - 2, b: it.y + it.h + 2 })) {
        it.gone = true;
        r.bones++;
        r.score += 10 * r.mult;
        const s = Math.floor(it.x / SEG_LEN);
        r.segGot[s] = (r.segGot[s] || 0) + 1;
        burst(w, sx + 12, it.y + 6, '#F2B53A', 5, 140);
        w.events.push('bone');
      }
    } else if (it.kind === 'ball') {
      if (hit(box, { l: sx, r: sx + 24, t: it.y, b: it.y + 24 })) {
        it.gone = true;
        r.mult = 2;
        r.zoomT = ZOOM_TIME;
        burst(w, sx + 12, it.y + 12, '#4A7FC1', 14, 240);
        say(w, 'ZOOMIES x2', DOG_X + 130, GROUND - 230, '#7FB0FF');
        w.events.push('zoom');
      }
    } else {
      const ob = { l: sx + 4, r: sx + it.w - 4, t: it.y + 4, b: it.y + it.h - 2 };
      if (hit(box, ob)) {
        die(w, r, it.kind);
        break;
      }
      if (it.kind !== 'pigeon') {
        if (box.l < ob.r && box.r > ob.l) it.minGap = Math.min(it.minGap ?? 999, ob.t - box.b);
        else if (!it.passed && ob.r <= box.l) {
          it.passed = true;
          if ((it.minGap ?? 999) < 16) {
            r.closes++;
            const g = 25 * r.mult;
            r.score += g;
            say(w, `CLOSE! +${g}`, DOG_X + 130, GROUND - 140, '#F2B53A');
            w.events.push('close');
          }
        }
      }
    }
  }
  r.items = r.items.filter((i) => !i.gone);
  return null;
}
