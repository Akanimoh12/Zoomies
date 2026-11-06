import type { Metadata } from 'next';
import Leaderboard from '@/components/Leaderboard';
import { GAME } from '@/lib/config';

export const metadata: Metadata = { title: `Leaderboard · ${GAME.name}` };

export default function LeaderboardPage() {
  return <Leaderboard />;
}
