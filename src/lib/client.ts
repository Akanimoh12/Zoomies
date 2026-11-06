'use client';
import { useEffect, useState } from 'react';
import type { Echo } from '@/game/engine';

/* ---------- API calls ---------- */
export interface Status {
  round: number; seed: number; endsAt: number; now: number;
  runsPerRound: number; runsLeft: number; roundBest: number | null; roundRank: number | null; players: number; bones: number;
}
export interface StartRes { runId: string; round: number; seed: number; runsLeft: number }
export interface FinishRes { roundRank: number | null; roundBest: number; allTimeRank: number | null; totalBones: number }
export interface Row { rank: number; name: string; score: number; you: boolean }
export interface BoardRes { board: string; label: string; round: number; endsAt: number; entries: Row[]; you: { rank: number; score: number; name: string } | null }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not reach the server. Try again.');
  return data as T;
}
export const api = {
  status: (playerId: string) => call<Status>(`/api/status?playerId=${playerId}`),
  start: (playerId: string, name: string) => call<StartRes>('/api/run/start', { method: 'POST', body: JSON.stringify({ playerId, name }) }),
  finish: (body: { runId: string; playerId: string; score: number; dist: number; bones: number; closes: number }) =>
    call<FinishRes>('/api/run/finish', { method: 'POST', body: JSON.stringify(body) }),
  board: (board: string, playerId?: string) => call<BoardRes>(`/api/leaderboard?board=${board}${playerId ? `&playerId=${playerId}` : ''}`),
};

/* ---------- this-device storage ---------- */
const read = (k: string) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* storage blocked: keep going */ }
};

export function usePlayer() {
  const [id, setId] = useState('');
  const [name, setNameState] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let pid = read('zoomies-id');
    if (!pid) {
      pid = crypto.randomUUID();
      write('zoomies-id', pid);
    }
    setId(pid);
    setNameState(read('zoomies-name') ?? '');
    setReady(true);
  }, []);
  const setName = (n: string) => {
    setNameState(n);
    write('zoomies-name', n);
  };
  return { id, name, setName, ready };
}

const ECHO_PREFIX = 'zoomies-echo-';
export const loadEcho = (round: number): Echo | null => {
  try {
    const v = JSON.parse(read(`${ECHO_PREFIX}${round}`) ?? 'null') as Partial<Echo> | null;
    return v && Number.isFinite(v.score) && Number.isFinite(v.dist) ? { score: v.score!, dist: v.dist! } : null;
  } catch {
    return null;
  }
};
/** Saves this round's echo and drops echoes from earlier rounds so storage doesn't pile up. */
export const saveEcho = (round: number, e: Echo) => {
  const keep = `${ECHO_PREFIX}${round}`;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(ECHO_PREFIX) && k !== keep) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
  write(keep, JSON.stringify({ score: e.score, dist: e.dist }));
};
export const loadMuted = () => read('zoomies-muted') === '1';
export const saveMuted = (m: boolean) => write('zoomies-muted', m ? '1' : '0');

export const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
