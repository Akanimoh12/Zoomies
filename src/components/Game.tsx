'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME, NAME_RE } from '@/lib/config';
import { api, clock, fmt, loadEcho, loadMuted, saveEcho, saveMuted, usePlayer, type FinishRes, type Status } from '@/lib/client';
import { CAUSES, SEG_LEN, STEP, WORLD_H, ZOOM_TIME, createWorld, newRun, pressJump, releaseJump, releaseSlide, slide, update, type Echo, type Phase } from '@/game/engine';
import { drawWorld, type RenderMode, type View } from '@/game/render';
import { getSprites } from '@/game/sprites';
import { Sound } from '@/game/audio';
import { BoneIcon, PauseIcon, SpeakerIcon } from './icons';

type Seg = 'gold' | 'green' | 'red';
interface Result {
  ranked: boolean;
  score: number;
  dist: number;
  bones: number;
  closes: number;
  cause: string;
  segs: Seg[];
  state: 'none' | 'sending' | 'ok' | 'error';
  error?: string;
  res?: FinishRes;
  newEcho: boolean;
}

export default function Game() {
  const player = usePlayer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef(createWorld());
  const view = useRef<View>({ scale: 1, dpr: 1, viewW: 400, top: 0 });
  const sound = useRef<Sound | null>(null);
  const ticket = useRef<{ runId: string; round: number } | null>(null);

  const [mode, setModeState] = useState<RenderMode>('home');
  const modeRef = useRef<RenderMode>('home');
  const setMode = (m: RenderMode) => {
    modeRef.current = m;
    setModeState(m);
  };

  const [status, setStatus] = useState<Status | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const skew = useRef(0);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shareRef = useRef<HTMLTextAreaElement>(null);

  // HUD nodes are written directly from the game loop, so React doesn't re-render 60 times a second
  const hudScore = useRef<HTMLSpanElement>(null);
  const hudDist = useRef<HTMLSpanElement>(null);
  const hudBones = useRef<HTMLSpanElement>(null);
  const hudZoom = useRef<HTMLDivElement>(null);
  const hudZoomFill = useRef<HTMLDivElement>(null);
  const hudHint = useRef<HTMLDivElement>(null);
  const shown = useRef({ score: -1, dist: -1, bones: -1 });

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  /* ---------- server status ---------- */
  const refreshing = useRef(false);
  const refreshStatus = useCallback(async () => {
    if (!player.id || refreshing.current) return;
    refreshing.current = true;
    try {
      const s = await api.status(player.id);
      skew.current = s.now - Date.now();
      setStatus(s);
      setStatusErr(null);
    } catch (e) {
      setStatusErr((e as Error).message);
    } finally {
      refreshing.current = false;
    }
  }, [player.id]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);
  useEffect(() => {
    setNameDraft(player.name);
  }, [player.name]);
  useEffect(() => {
    setMuted(loadMuted());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const serverNow = now + skew.current;
  const msLeft = status ? status.endsAt - serverNow : 0;
  const lastRoundRefresh = useRef(0);
  useEffect(() => {
    // round is over: fetch the new one, but at most every 10 s so we don't hammer the server while offline
    if (!status || msLeft > 0 || modeRef.current === 'play') return;
    if (Date.now() - lastRoundRefresh.current < 10_000) return;
    lastRoundRefresh.current = Date.now();
    void refreshStatus();
  }, [status, msLeft, refreshStatus]);

  /* ---------- run lifecycle ---------- */
  const start = async (ranked: boolean) => {
    if (busy) return;
    sound.current ??= new Sound();
    sound.current.muted = muted;
    sound.current.unlock();
    let seed: number;
    let ghost: Echo | null = null;
    if (ranked) {
      const n = nameDraft.trim().replace(/\s+/g, ' ');
      if (!NAME_RE.test(n)) {
        showToast('Pick a name with 2 to 16 letters or numbers first.');
        return;
      }
      if (n !== player.name) player.setName(n);
      setBusy(true);
      try {
        const s = await api.start(player.id, n);
        ticket.current = { runId: s.runId, round: s.round };
        seed = s.seed;
        ghost = loadEcho(s.round);
        setStatus((p) => (p ? { ...p, runsLeft: s.runsLeft } : p));
      } catch (e) {
        showToast((e as Error).message);
        setBusy(false);
        void refreshStatus();
        return;
      }
      setBusy(false);
    } else {
      ticket.current = null;
      seed = (Math.random() * 4294967296) >>> 0;
    }
    const w = world.current;
    w.run = newRun(seed, ranked, ghost);
    w.particles = [];
    w.texts = [];
    w.shake = 0;
    shown.current = { score: -1, dist: -1, bones: -1 };
    setResult(null);
    setMode('play');
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const finish = () => {
    const r = world.current.run;
    if (!r) return;
    const count = Math.floor(r.dist / SEG_LEN) + 1;
    const segs: Seg[] = [];
    for (let i = 0; i < count; i++) {
      if (i === count - 1 && r.cause !== CAUSES.quit) segs.push('red');
      else segs.push((r.segBones[i] || 0) > 0 && (r.segGot[i] || 0) >= r.segBones[i] ? 'gold' : 'green');
    }
    const score = Math.floor(r.score);
    const t = ticket.current;
    ticket.current = null;
    const dist = Math.floor(r.dist);
    setResult({
      ranked: r.ranked, score, dist: Math.floor(r.dist / 10), bones: r.bones, closes: r.closes, cause: r.cause, segs,
      state: r.ranked && t ? 'sending' : 'none', newEcho: false,
    });
    setMode('over');
    if (r.ranked && t) {
      api
        .finish({ runId: t.runId, playerId: player.id, score, dist: r.dist, bones: r.bones, closes: r.closes })
        .then((res) => {
          // only runs the server accepted become your echo
          const prev = loadEcho(t.round);
          const newEcho = !prev || score > prev.score;
          if (newEcho) saveEcho(t.round, { score, dist });
          setResult((p) => (p ? { ...p, state: 'ok', res, newEcho } : p));
          void refreshStatus();
        })
        .catch((e: Error) => setResult((p) => (p ? { ...p, state: 'error', error: e.message } : p)));
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const pause = () => {
    if (modeRef.current === 'play') setMode('paused');
  };
  const resume = () => {
    if (modeRef.current === 'paused') setMode('play');
  };
  const quit = () => {
    if (modeRef.current !== 'paused' || !world.current.run) return;
    world.current.run.cause = CAUSES.quit;
    finish();
  };
  const ctl = useRef({ pause, resume });
  ctl.current = { pause, resume };

  /* ---------- game loop ---------- */
  useEffect(() => {
    const cvs = canvasRef.current!;
    const ctx = cvs.getContext('2d')!;
    const S = getSprites();
    const resize = () => {
      const r = cvs.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cvs.width = Math.max(1, Math.round(r.width * dpr));
      cvs.height = Math.max(1, Math.round(r.height * dpr));
      // fit the full world height, but zoom in on wide screens (cropping sky off the top)
      const base = r.height / WORLD_H;
      const zoom = Math.min(r.height / 470, r.width / 820);
      const scale = Math.max(base, zoom) || 1;
      view.current = { scale, dpr, viewW: r.width / scale, top: Math.max(0, WORLD_H - r.height / scale) };
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cvs);
    resize();

    let last = performance.now();
    let acc = 0;
    let raf = 0;
    const frame = (t: number) => {
      // Fixed-step simulation: identical physics at 30, 60 or 144 fps, and a slow device
      // can't get slow motion. Long hitches (tab switch) are capped at 0.1 s.
      acc += Math.min(0.1, Math.max(0, (t - last) / 1000));
      last = t;
      const w = world.current;
      while (acc >= STEP) {
        acc -= STEP;
        const sm = modeRef.current;
        const phase: Phase = sm === 'play' ? 'play' : sm === 'dying' ? 'dying' : sm === 'paused' ? 'paused' : 'attract';
        const out = update(w, STEP, view.current.viewW, phase);
        if (sm === 'play' && w.run?.dead) setMode('dying');
        if (out === 'over') finishRef.current();
      }
      for (const e of w.events) sound.current?.play(e);
      w.events.length = 0;
      const m = modeRef.current;
      drawWorld(ctx, cvs.width, cvs.height, w, view.current, S, m);

      const r = w.run;
      if (r && (m === 'play' || m === 'dying')) {
        const sc = Math.floor(r.score);
        const dm = Math.floor(r.dist / 10);
        const s = shown.current;
        if (hudScore.current && sc !== s.score) {
          hudScore.current.textContent = String(sc).padStart(5, '0');
          s.score = sc;
        }
        if (hudDist.current && dm !== s.dist) {
          hudDist.current.textContent = `${fmt(dm)} m${r.ghost ? ` · echo ${fmt(r.ghost.dist / 10)} m` : ''}`;
          s.dist = dm;
        }
        if (hudBones.current && r.bones !== s.bones) {
          hudBones.current.textContent = String(r.bones);
          s.bones = r.bones;
        }
        if (hudZoom.current) hudZoom.current.hidden = r.zoomT <= 0;
        if (hudZoomFill.current && r.zoomT > 0) hudZoomFill.current.style.width = `${(r.zoomT / ZOOM_TIME) * 100}%`;
        if (hudHint.current) hudHint.current.style.opacity = r.t > 5 ? '0' : '1';
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  /* ---------- input ---------- */
  useEffect(() => {
    const cvs = canvasRef.current!;
    let ptr: { id: number; y: number; slid: boolean } | null = null;
    const down = (e: PointerEvent) => {
      if (modeRef.current !== 'play') return;
      e.preventDefault();
      ptr = { id: e.pointerId, y: e.clientY, slid: false };
      pressJump(world.current);
    };
    const move = (e: PointerEvent) => {
      if (!ptr || e.pointerId !== ptr.id || ptr.slid || modeRef.current !== 'play') return;
      if (e.clientY - ptr.y > 22) {
        ptr.slid = true;
        releaseJump(world.current);
        slide(world.current, false);
      }
    };
    const up = (e: PointerEvent) => {
      if (ptr && e.pointerId === ptr.id) {
        releaseJump(world.current);
        ptr = null;
      }
    };
    const JUMP = ['Space', 'ArrowUp', 'KeyW'];
    const SLIDE = ['ArrowDown', 'KeyS'];
    const kd = (e: KeyboardEvent) => {
      const m = modeRef.current;
      if (m === 'play') {
        if (JUMP.includes(e.code)) {
          e.preventDefault();
          if (!e.repeat) pressJump(world.current);
        } else if (SLIDE.includes(e.code)) {
          e.preventDefault();
          if (!e.repeat) slide(world.current, true);
        } else if (e.code === 'Escape' || e.code === 'KeyP') ctl.current.pause();
      } else if (m === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) ctl.current.resume();
    };
    const ku = (e: KeyboardEvent) => {
      if (JUMP.includes(e.code)) releaseJump(world.current);
      if (SLIDE.includes(e.code)) releaseSlide(world.current);
    };
    const vis = () => {
      if (document.hidden) ctl.current.pause();
    };
    cvs.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    document.addEventListener('visibilitychange', vis);
    return () => {
      cvs.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    saveMuted(m);
    sound.current ??= new Sound();
    sound.current.muted = m;
    if (!m) {
      sound.current.unlock();
      sound.current.play('bone');
    }
  };

  /* ---------- share ---------- */
  const shareText = (R: Result) => {
    const sq = R.segs.slice(-14).map((c) => ({ gold: '🟨', green: '🟩', red: '🟥' })[c]).join('');
    const rank = R.res?.roundRank ? ` · #${R.res.roundRank} this round` : '';
    return `${GAME.name} 🐕 ${fmt(R.score)} pts · ${fmt(R.dist)} m · ${R.bones} bones${rank}\n${sq}\n${window.location.origin}`;
  };
  const copyResult = (R: Result) => {
    const text = shareText(R);
    const fallback = () => {
      const box = shareRef.current;
      if (!box) return;
      box.value = text;
      box.hidden = false;
      box.focus();
      box.select();
      showToast('Select the text and copy it');
    };
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => showToast('Copied. Paste it on X'), fallback);
      else fallback();
    } catch {
      fallback();
    }
  };

  const runsLeft = status?.runsLeft ?? 0;
  const timeLeft = status ? clock(msLeft) : '--:--';
  const playing = mode === 'play' || mode === 'dying' || mode === 'paused';

  return (
    <main className="shell">
      <div className="stage">
        <canvas ref={canvasRef} className="game" aria-label={`${GAME.name} game area. Tap or press Space to jump, swipe down or press Down to slide.`} />

        {mode === 'home' && (
          <section className="layer home">
            <div className="row">
              <div className="chips">
                <span className="chip" title="Your total Bones">
                  <BoneIcon /> {fmt(status?.bones ?? 0)}
                </span>
                <span className="chip">Round ends in {timeLeft}</span>
              </div>
              <button className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
                <SpeakerIcon off={muted} />
              </button>
            </div>

            <div className="panel">
              <h1 className="logo">{GAME.name.toUpperCase()}</h1>
              <p className="sub">
                {GAME.tagline} {GAME.runsPerRound} ranked runs every {GAME.roundMinutes} minutes. Your best run sets your rank.
              </p>

              <div className="field">
                <label htmlFor="player-name">Your name on the leaderboard</label>
                <input
                  id="player-name"
                  className="input"
                  value={nameDraft}
                  maxLength={16}
                  placeholder="e.g. speedypup"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void start(true)}
                />
              </div>

              <div className="stats">
                <div className="stat">
                  <span className="k">Runs left</span>
                  <span className="v">{status ? `${runsLeft} / ${status.runsPerRound}` : '–'}</span>
                </div>
                <div className="stat">
                  <span className="k">Your best</span>
                  <span className="v">{status?.roundBest != null ? fmt(status.roundBest) : '–'}</span>
                </div>
                <div className="stat">
                  <span className="k">Your rank</span>
                  <span className="v">{status?.roundRank ? `#${status.roundRank} of ${status.players}` : '–'}</span>
                </div>
              </div>

              <button className="btn-primary" disabled={busy || !status || runsLeft === 0} onClick={() => void start(true)}>
                {busy ? 'STARTING…' : !status ? 'CONNECTING…' : runsLeft === 0 ? `NEW RUNS IN ${timeLeft}` : 'PLAY RANKED RUN'}
              </button>
              <div className="two">
                <button className="btn-ghost" onClick={() => void start(false)}>
                  Practice run
                </button>
                <Link className="btn-ghost" href="/leaderboard">
                  Leaderboard
                </Link>
              </div>
              {statusErr && <p className="err">{statusErr} Practice still works.</p>}
            </div>

            <div className="howto">
              <span><kbd>Tap</kbd> / <kbd>Space</kbd> jump · hold for higher</span>
              <span><kbd>Swipe down</kbd> / <kbd>↓</kbd> slide under pigeons</span>
              <span>Blue ball: Zoomies, double points for 6 s</span>
              <span>Clear an obstacle by a hair: +25</span>
            </div>
          </section>
        )}

        {playing && (
          <section className="layer hud">
            <div className="row top">
              <button className="icon-btn" onClick={pause} aria-label="Pause">
                <PauseIcon />
              </button>
              <div className="score-wrap">
                <span className="score" ref={hudScore}>00000</span>
                <span className="dist" ref={hudDist}>0 m</span>
              </div>
              <div className="bone-chip">
                <BoneIcon /> <span ref={hudBones}>0</span>
              </div>
            </div>
            {!world.current.run?.ranked && <span className="mode-tag">PRACTICE</span>}
            <div className="zoom" ref={hudZoom} hidden>
              <span className="lbl">ZOOMIES ×2</span>
              <div className="bar"><div ref={hudZoomFill} className="fill" /></div>
            </div>
            <div className="hint" ref={hudHint}>
              <div>Tap · jump (hold = higher)</div>
              <div>Swipe down · slide</div>
            </div>
          </section>
        )}

        {mode === 'paused' && (
          <section className="layer sheet">
            <div className="card">
              <p className="eyebrow">PAUSED</p>
              <button className="btn-primary" onClick={resume} autoFocus>
                RESUME
              </button>
              <button className="btn-ghost" onClick={quit}>
                End run and keep this score
              </button>
            </div>
          </section>
        )}

        {mode === 'over' && result && (
          <section className="layer sheet">
            <div className="card">
              <p className="eyebrow">{result.ranked ? 'RUN OVER' : 'PRACTICE OVER'}</p>
              <p className="big">{fmt(result.score)}</p>
              {!result.ranked ? (
                <span className="badge alt">PRACTICE · NOT RANKED</span>
              ) : result.state === 'sending' ? (
                <span className="badge alt">SAVING SCORE…</span>
              ) : result.state === 'ok' && result.res ? (
                <span className="badge">#{result.res.roundRank} THIS ROUND · BEST {fmt(result.res.roundBest)}</span>
              ) : (
                <span className="badge bad">NOT SAVED</span>
              )}
              {result.state === 'error' && <p className="err">{result.error}</p>}
              {result.ranked && result.newEcho && <p className="note">New echo saved. Your next run races its flag.</p>}

              <div className="tiles">
                <div className="tile">
                  <span className="k">Distance</span>
                  <span className="v">{fmt(result.dist)} m</span>
                  <span className="s">{result.cause}</span>
                </div>
                <div className="tile">
                  <span className="k">Bones</span>
                  <span className="v gold">+{result.ranked ? result.bones : 0}</span>
                  <span className="s">{result.ranked ? (result.res ? `Total ${fmt(result.res.totalBones)}` : 'Adding to your total') : 'Practice earns none'}</span>
                </div>
                <div className="tile">
                  <span className="k">Runs left</span>
                  <span className="v">{status ? `${runsLeft} of ${status.runsPerRound}` : '–'}</span>
                  <span className="s">Refills in {timeLeft}</span>
                </div>
                <div className="tile">
                  <span className="k">Close calls</span>
                  <span className="v">{result.closes}</span>
                  <span className="s">+25 each</span>
                </div>
              </div>

              {result.ranked && (
                <div className="strip">
                  <div className="segs">
                    {result.segs.slice(-14).map((c, i) => (
                      <div key={i} className={`seg ${c}`} />
                    ))}
                  </div>
                  <p>Each block is 100 m. Gold: every bone grabbed. Green: clean. Red: where you crashed.</p>
                  <textarea ref={shareRef} className="share" readOnly hidden aria-label="Result text to copy" />
                </div>
              )}

              {runsLeft > 0 ? (
                <button className="btn-primary" onClick={() => void start(true)} disabled={busy} autoFocus>
                  {busy ? 'STARTING…' : `RANKED RUN · ${runsLeft} LEFT`}
                </button>
              ) : (
                <button className="btn-primary" onClick={() => void start(false)} autoFocus>
                  PRACTICE RUN
                </button>
              )}
              <div className="three">
                {result.ranked ? (
                  <button className="btn-ghost" onClick={() => copyResult(result)}>Copy result</button>
                ) : (
                  <button className="btn-ghost" onClick={() => void start(false)}>Practice again</button>
                )}
                <Link className="btn-ghost" href="/leaderboard">Leaderboard</Link>
                <button className="btn-ghost" onClick={() => { world.current.run = null; setMode('home'); }}>Home</button>
              </div>
            </div>
          </section>
        )}

        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </main>
  );
}
