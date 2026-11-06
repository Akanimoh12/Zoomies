import { NextResponse } from 'next/server';
import { ID_RE, NAME_RE } from './config';

export const ok = <T,>(data: T) => NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
export const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export const validId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);
export const cleanName = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const n = v.trim().replace(/\s+/g, ' ');
  return NAME_RE.test(n) ? n : null;
};
