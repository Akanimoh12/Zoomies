'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GAME } from '@/lib/config';
import { api, clock, fmt, usePlayer, type BoardRes } from '@/lib/client';
import { BoneIcon } from './icons';

const TABS = [
  { id: 'bones', label: 'Bones' },
  { id: 'all', label: 'All time' },
  { id: 'round', label: 'This round' },
] as const;

export default function Leaderboard() {
  const { id, ready } = usePlayer();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('bones');
  const [data, setData] = useState<BoardRes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ready) return; // wait for the player id so we load once, not twice
    let live = true; // drop responses that land after the tab changed
    const load = async () => {
      try {
        const d = await api.board(tab, id || undefined);
        if (live) {
          setData(d);
          setErr(null);
        }
      } catch (e) {
        if (live) setErr((e as Error).message);
      }
    };
    setData(null);
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [tab, id, ready]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const unit = tab === 'bones' ? 'bones' : 'pts';
  const youInTop = data?.entries.some((e) => e.you);

  return (
    <main className="board-page">
      <header className="board-head">
        <div>
          <Link href="/" className="back">← Play {GAME.name}</Link>
          <h1 className="logo small">LEADERBOARD</h1>
          <p className="sub">
            {tab === 'round'
              ? `Best run per player this round. New round in ${data ? clock(data.endsAt - now) : '--:--'}.`
              : tab === 'all'
                ? 'Best single run per player, across every round.'
                : 'Total Bones collected in ranked runs.'}
          </p>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Leaderboards">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {err && <p className="err">{err}</p>}

      <ol className="ranks">
        {!data && !err && <li className="empty">Loading…</li>}
        {data && data.entries.length === 0 && (
          <li className="empty">No ranked runs yet{tab === 'round' ? ' this round' : ''}. Play one and take #1.</li>
        )}
        {data?.entries.map((e) => (
          <li key={`${e.rank}-${e.name}`} className={`rank-row${e.you ? ' you' : ''}${e.rank <= 3 ? ` top${e.rank}` : ''}`}>
            <span className="pos">{e.rank}</span>
            <span className="who">{e.name}{e.you && <em> (you)</em>}</span>
            <span className="pts">
              {tab === 'bones' && <BoneIcon size={16} />} {fmt(e.score)} <small>{unit}</small>
            </span>
          </li>
        ))}
        {data?.you && !youInTop && (
          <li className="rank-row you detached">
            <span className="pos">{data.you.rank}</span>
            <span className="who">{data.you.name}<em> (you)</em></span>
            <span className="pts">{fmt(data.you.score)} <small>{unit}</small></span>
          </li>
        )}
      </ol>

      <p className="fine">Demo build. Scores are checked on the server for plausibility; this is not a prize leaderboard yet.</p>
    </main>
  );
}
