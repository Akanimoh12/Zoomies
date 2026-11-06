import { DOG_SCALE, DOG_X, GROUND, WORLD_H, hashN, type World } from './engine';
import type { Sprites } from './sprites';

/** `top` is how many world px are cropped off the top when the camera zooms in on wide screens. */
export interface View { scale: number; dpr: number; viewW: number; top: number }
export type RenderMode = 'home' | 'play' | 'paused' | 'dying' | 'over';

const PIX = '"Press Start 2P", ui-monospace, monospace';
const STARS = Array.from({ length: 40 }, (_, i) => ({
  x: hashN(i * 3) * 1200,
  y: 16 + hashN(i * 3 + 1) * 200,
  s: hashN(i * 3 + 2) < 0.25 ? 4 : 3,
  o: 0.3 + hashN(i * 7) * 0.6,
}));

function skyline(ctx: CanvasRenderingContext2D, D: number, viewW: number, clock: number) {
  const k = 0.15;
  const spacing = 92;
  const off = (D * k) % spacing;
  const first = Math.floor((D * k) / spacing);
  for (let i = -1; i < viewW / spacing + 2; i++) {
    const idx = first + i;
    const w = 58 + hashN(idx * 11) * 52;
    const h = 110 + hashN(idx * 17) * 170;
    const x = Math.round(i * spacing - off + hashN(idx * 5) * 20);
    const y = Math.round(GROUND - 40 - h);
    ctx.fillStyle = '#2B1D55';
    ctx.fillRect(x, y, Math.round(w), h + 40);
    // lit windows
    for (let row = 0; row < Math.floor(h / 22); row++)
      for (let col = 0; col < Math.floor(w / 16); col++) {
        const seed = hashN(idx * 131 + row * 17 + col * 7);
        if (seed < 0.26) {
          ctx.globalAlpha = seed < 0.04 ? 0.5 + 0.4 * Math.sin(clock * 3 + idx) : 0.75;
          ctx.fillStyle = seed < 0.12 ? '#FFD27A' : '#F2B53A';
          ctx.fillRect(x + 6 + col * 16, y + 10 + row * 22, 7, 10);
        }
      }
    ctx.globalAlpha = 1;
  }
}

function trees(ctx: CanvasRenderingContext2D, D: number, k: number, spacing: number, img: HTMLCanvasElement, baseH: number, viewW: number) {
  const off = (D * k) % spacing;
  const first = Math.floor((D * k) / spacing);
  for (let i = -1; i < viewW / spacing + 2; i++) {
    const idx = first + i;
    const sz = 0.65 + hashN(idx * 13 + spacing) * 0.6;
    const h = baseH * sz;
    const w = (h * 10) / 16;
    const x = i * spacing - off + hashN(idx * 7 + spacing) * spacing * 0.5;
    ctx.drawImage(img, Math.round(x), Math.round(GROUND - h + 6), Math.round(w), Math.round(h));
  }
}

function lamps(ctx: CanvasRenderingContext2D, D: number, viewW: number) {
  const spacing = 560;
  const off = D % spacing;
  for (let i = -1; i < viewW / spacing + 2; i++) {
    const x = Math.round(i * spacing - off + 300);
    const top = GROUND - 176;
    const g = ctx.createLinearGradient(0, top, 0, GROUND);
    g.addColorStop(0, 'rgba(255,231,168,0.32)');
    g.addColorStop(1, 'rgba(255,231,168,0.02)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + 18, top + 10);
    ctx.lineTo(x + 30, top + 10);
    ctx.lineTo(x + 92, GROUND);
    ctx.lineTo(x - 44, GROUND);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#141A2E';
    ctx.fillRect(x, top, 6, GROUND - top);
    ctx.fillRect(x, top, 30, 6);
    ctx.fillStyle = '#FFE7A8';
    ctx.fillRect(x + 18, top + 6, 12, 6);
  }
}

function ground(ctx: CanvasRenderingContext2D, D: number, viewW: number) {
  ctx.fillStyle = '#3FA36B';
  ctx.fillRect(-20, GROUND, viewW + 40, 12);
  ctx.fillStyle = '#2F8A57';
  const toff = D % 28;
  const tfirst = Math.floor(D / 28);
  for (let i = -1; i < viewW / 28 + 2; i++) if (hashN(tfirst + i) < 0.55) ctx.fillRect(Math.round(i * 28 - toff), GROUND - 4, 4, 4);
  // sidewalk
  ctx.fillStyle = '#3E4262';
  ctx.fillRect(-20, GROUND + 12, viewW + 40, 62);
  ctx.fillStyle = '#33375A';
  const soff = D % 64;
  for (let i = -1; i < viewW / 64 + 2; i++) ctx.fillRect(Math.round(i * 64 - soff), GROUND + 12, 3, 62);
  ctx.fillStyle = '#5A5F86';
  ctx.fillRect(-20, GROUND + 72, viewW + 40, 6);
  // street
  ctx.fillStyle = '#1C1E33';
  ctx.fillRect(-20, GROUND + 78, viewW + 40, WORLD_H - GROUND);
  ctx.fillStyle = '#F2B53A';
  const roff = (D * 1.15) % 120;
  for (let i = -1; i < viewW / 120 + 2; i++) ctx.fillRect(Math.round(i * 120 - roff), GROUND + 118, 54, 5);
}

export function drawWorld(ctx: CanvasRenderingContext2D, cw: number, ch: number, w: World, v: View, S: Sprites, mode: RenderMode) {
  const { scale, dpr, viewW } = v;
  const run = w.run && mode !== 'home' ? w.run : null;
  const D = run ? run.dist : w.attractD;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#120E2A';
  ctx.fillRect(0, 0, cw, ch);
  const k = scale * dpr;
  const sx = w.shake > 0 ? ((Math.random() - 0.5) * 14 * w.shake) / 0.35 : 0;
  const sy = w.shake > 0 ? ((Math.random() - 0.5) * 10 * w.shake) / 0.35 : 0;
  ctx.setTransform(k, 0, 0, k, sx * k, (sy - v.top) * k);
  ctx.imageSmoothingEnabled = false;

  // dusk sky
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#140F33');
  sky.addColorStop(0.55, '#3A1E63');
  sky.addColorStop(0.85, '#B8456E');
  sky.addColorStop(1, '#F08A4B');
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, viewW + 40, GROUND + 20);
  for (const s of STARS) {
    const x = (((s.x - D * 0.02) % 1200) + 1200) % 1200;
    if (x > viewW) continue;
    ctx.globalAlpha = s.o * (0.75 + 0.25 * Math.sin(w.clock * 2 + s.x));
    ctx.fillStyle = '#F5EFE0';
    ctx.fillRect(Math.round(x), Math.round(s.y), s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // striped retro sun
  const sunX = Math.round(viewW * 0.68);
  const sunY = GROUND - 130;
  const sunG = ctx.createLinearGradient(0, sunY - 110, 0, sunY + 110);
  sunG.addColorStop(0, '#FFD27A');
  sunG.addColorStop(1, '#F2683A');
  ctx.fillStyle = sunG;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#C24F6A';
  for (let i = 0; i < 6; i++) ctx.fillRect(sunX - 120, sunY + 8 + i * 17, 240, 3 + i);

  skyline(ctx, D, viewW, w.clock);
  trees(ctx, D, 0.4, 170, S.treeNear, 132, viewW);
  lamps(ctx, D, viewW);
  ground(ctx, D, viewW);

  // items
  if (run) {
    for (const it of run.items) {
      const x = Math.round(it.x - run.dist + DOG_X);
      if (x < -120 || x > viewW + 40) continue;
      if (it.kind !== 'bone' && it.kind !== 'ball' && it.kind !== 'pigeon') {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x + 2, GROUND - 2, it.w, 5);
      }
      switch (it.kind) {
        case 'hydrant': ctx.drawImage(S.hydrant, x, it.y, it.w, it.h); break;
        case 'cone': ctx.drawImage(S.cone, x, it.y, it.w, it.h); break;
        case 'trash': ctx.drawImage(S.trash, x, it.y, it.w, it.h); break;
        case 'bench': ctx.drawImage(S.bench, x, it.y, it.w, it.h); break;
        case 'crates':
          ctx.drawImage(S.crate, x, it.y + 35, 60, 35);
          ctx.drawImage(S.crate, x + 4, it.y, 52, 35);
          break;
        case 'skate': {
          ctx.drawImage(S.skate, x, it.y, it.w, it.h);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(x + it.w + 4, it.y + 6, 18, 3);
          ctx.fillRect(x + it.w + 10, it.y + 12, 12, 3);
          break;
        }
        case 'pigeon': ctx.drawImage(Math.floor(w.clock * 8) % 2 ? S.pigeon1 : S.pigeon2, x, it.y); break;
        case 'bone': ctx.drawImage(S.bone, x, Math.round(it.y + Math.sin(w.clock * 5 + it.x * 0.05) * 2)); break;
        case 'ball': {
          const cy = it.y + 12 + Math.sin(w.clock * 4) * 3;
          ctx.globalAlpha = 0.25 + 0.15 * Math.sin(w.clock * 8);
          ctx.fillStyle = '#4A7FC1';
          ctx.beginPath();
          ctx.arc(x + 12, cy, 20, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(x + 12, cy, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#F5EFE0';
          ctx.fillRect(x + 1, Math.round(cy) - 2, 22, 4);
          break;
        }
      }
    }
  }

  // flag marking where your best run this round ended
  if (run?.ghost) {
    const g = run.ghost;
    const fx = Math.round(g.dist - run.dist + DOG_X + 70 * DOG_SCALE);
    if (fx > -40 && fx < viewW + 40) {
      ctx.fillStyle = '#9DBBFF';
      ctx.fillRect(fx, GROUND - 96, 4, 96);
      ctx.fillRect(fx + 4, GROUND - 96, 44, 22);
      ctx.fillStyle = '#141A2E';
      ctx.font = `8px ${PIX}`;
      ctx.textAlign = 'left';
      ctx.fillText('ECHO', fx + 9, GROUND - 81);
    }
  }

  // zoomies streaks
  if (run && run.zoomT > 0 && mode === 'play') {
    ctx.fillStyle = '#7FB0FF';
    for (let i = 0; i < 3; i++) {
      const len = 30 + ((w.clock * 400 + i * 37) % 40);
      ctx.globalAlpha = 0.65;
      const L = len * DOG_SCALE;
      ctx.fillRect(Math.round(DOG_X - L - 6 * DOG_SCALE), Math.round(GROUND - run.h - (50 - i * 16) * DOG_SCALE), Math.round(L), Math.round(4 * DOG_SCALE));
    }
    ctx.globalAlpha = 1;
  }

  // dog + shadow
  const K = DOG_SCALE;
  const h = run ? run.h : 0;
  const shW = Math.max(26, 66 - h * 0.25) * K;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(DOG_X + 42 * K, GROUND + 3, shW / 2, 5 * K, 0, 0, Math.PI * 2);
  ctx.fill();
  const dog = S.dog;
  const drawDog = (img: HTMLCanvasElement, x: number, y: number) =>
    ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(img.width * K), Math.round(img.height * K));
  if (run && (run.dead || mode === 'over')) {
    ctx.save();
    ctx.translate(DOG_X + 40 * K, GROUND - h - 30 * K);
    ctx.rotate(-Math.min(run.spin, Math.PI * 0.5));
    drawDog(dog.jump, -40 * K, -30 * K);
    ctx.restore();
  } else if (run && run.slideT > 0 && run.h === 0) {
    drawDog(dog.slide, DOG_X, GROUND - 35 * K);
  } else if (h > 0) {
    drawDog(dog.jump, DOG_X, GROUND - h - 60 * K);
  } else {
    drawDog(Math.floor(D / 38) % 2 ? dog.run1 : dog.run2, DOG_X, GROUND - 60 * K);
  }

  for (const p of w.particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'left';
  ctx.font = `14px ${PIX}`;
  for (const t of w.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2);
    ctx.fillStyle = '#141A2E';
    ctx.fillText(t.txt, t.x + 2, t.y + 2);
    ctx.fillStyle = t.color;
    ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
