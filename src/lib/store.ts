import 'server-only';
import { Redis } from '@upstash/redis';

/**
 * Storage for runs, scores and Bones.
 * Uses Upstash Redis when its env vars exist (Vercel Marketplace sets KV_REST_API_*),
 * otherwise an in-memory store so `npm run dev` works with no setup.
 */
export interface Entry { id: string; score: number }
export interface Store {
  /** Increments a counter. The TTL is set when the key is first created and not extended after. */
  incr(key: string, ttlSec: number): Promise<number>;
  expire(key: string, ttlSec: number): Promise<void>;
  getNum(key: string): Promise<number>;
  setJSON(key: string, val: unknown, ttlSec: number): Promise<void>;
  takeJSON<T>(key: string): Promise<T | null>;
  zMax(key: string, member: string, score: number): Promise<void>;
  zIncr(key: string, member: string, by: number): Promise<number>;
  zTop(key: string, n: number): Promise<Entry[]>;
  zRank(key: string, member: string): Promise<{ rank: number; score: number } | null>;
  zCount(key: string): Promise<number>;
  setName(id: string, name: string): Promise<void>;
  names(ids: string[]): Promise<Record<string, string>>;
}

class RedisStore implements Store {
  constructor(private r: Redis) {}
  async incr(key: string, ttl: number) {
    // one round trip, and the expiry can't be lost between the two commands
    const [v] = await this.r.pipeline().incr(key).expire(key, ttl, 'NX').exec<[number, number]>();
    return Number(v);
  }
  async expire(key: string, ttl: number) {
    await this.r.expire(key, ttl);
  }
  async getNum(key: string) {
    return Number((await this.r.get<number | string>(key)) ?? 0);
  }
  async setJSON(key: string, val: unknown, ttl: number) {
    await this.r.set(key, val, { ex: ttl });
  }
  async takeJSON<T>(key: string) {
    return (await this.r.getdel<T>(key)) ?? null;
  }
  async zMax(key: string, member: string, score: number) {
    await this.r.zadd(key, { gt: true }, { score, member });
  }
  async zIncr(key: string, member: string, by: number) {
    return Number(await this.r.zincrby(key, by, member));
  }
  async zTop(key: string, n: number) {
    const raw = await this.r.zrange<(string | number)[]>(key, 0, n - 1, { rev: true, withScores: true });
    const out: Entry[] = [];
    for (let i = 0; i < raw.length; i += 2) out.push({ id: String(raw[i]), score: Number(raw[i + 1]) });
    return out;
  }
  async zRank(key: string, member: string) {
    const [rank, score] = await Promise.all([this.r.zrevrank(key, member), this.r.zscore(key, member)]);
    if (rank === null || rank === undefined || score === null) return null;
    return { rank: Number(rank) + 1, score: Number(score) };
  }
  async zCount(key: string) {
    return Number(await this.r.zcard(key));
  }
  async setName(id: string, name: string) {
    await this.r.hset('names', { [id]: name });
  }
  async names(ids: string[]) {
    if (!ids.length) return {};
    return ((await this.r.hmget<Record<string, string>>('names', ...ids)) ?? {}) as Record<string, string>;
  }
}

class MemoryStore implements Store {
  private kv = new Map<string, { v: unknown; exp: number }>();
  private z = new Map<string, Map<string, number>>();
  private nm = new Map<string, string>();
  private live(key: string) {
    const e = this.kv.get(key);
    if (e && e.exp < Date.now()) {
      this.kv.delete(key);
      return undefined;
    }
    return e;
  }
  private zset(key: string) {
    let s = this.z.get(key);
    if (!s) this.z.set(key, (s = new Map()));
    return s;
  }
  private sorted(key: string) {
    return [...this.zset(key)].sort((a, b) => b[1] - a[1]);
  }
  async incr(key: string, ttl: number) {
    const e = this.live(key);
    const v = Number(e?.v ?? 0) + 1;
    this.kv.set(key, { v, exp: e?.exp ?? Date.now() + ttl * 1000 });
    return v;
  }
  async expire() {
    /* dev-only store: sorted sets live until the server restarts */
  }
  async getNum(key: string) {
    return Number(this.live(key)?.v ?? 0);
  }
  async setJSON(key: string, val: unknown, ttl: number) {
    this.kv.set(key, { v: val, exp: Date.now() + ttl * 1000 });
  }
  async takeJSON<T>(key: string) {
    const e = this.live(key);
    this.kv.delete(key);
    return (e?.v as T) ?? null;
  }
  async zMax(key: string, member: string, score: number) {
    const s = this.zset(key);
    if (!s.has(member) || score > s.get(member)!) s.set(member, score);
  }
  async zIncr(key: string, member: string, by: number) {
    const s = this.zset(key);
    const v = (s.get(member) ?? 0) + by;
    s.set(member, v);
    return v;
  }
  async zTop(key: string, n: number) {
    return this.sorted(key).slice(0, n).map(([id, score]) => ({ id, score }));
  }
  async zRank(key: string, member: string) {
    const i = this.sorted(key).findIndex(([id]) => id === member);
    return i < 0 ? null : { rank: i + 1, score: this.zset(key).get(member)! };
  }
  async zCount(key: string) {
    return this.zset(key).size;
  }
  async setName(id: string, name: string) {
    this.nm.set(id, name);
  }
  async names(ids: string[]) {
    return Object.fromEntries(ids.filter((i) => this.nm.has(i)).map((i) => [i, this.nm.get(i)!]));
  }
}

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

const g = globalThis as unknown as { __zoomiesStore?: Store };
export const store: Store = (g.__zoomiesStore ??= url && token ? new RedisStore(new Redis({ url, token })) : new MemoryStore());
export const usingRedis = Boolean(url && token);

if (!usingRedis && process.env.VERCEL) {
  console.error(
    '[zoomies] No Redis env vars (KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN). ' +
      'Falling back to an in-memory store, which is NOT shared between serverless instances: scores will appear to vanish. ' +
      'Connect Upstash for Redis in the Vercel project and redeploy.',
  );
}

/* Key names in one place */
export const K = {
  runs: (round: number, id: string) => `runs:${round}:${id}`,
  run: (runId: string) => `run:${runId}`,
  round: (round: number) => `lb:round:${round}`,
  rate: (bucket: string, ip: string, win: number) => `rl:${bucket}:${ip}:${win}`,
  allTime: 'lb:all',
  bones: 'lb:bones',
};

/** Round boards are kept this long after they're last written, then Redis drops them. */
export const ROUND_BOARD_TTL = 7 * 24 * 3600;
