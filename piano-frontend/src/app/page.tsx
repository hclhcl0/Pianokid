'use client';
import dynamic from 'next/dynamic';

const GameScreen = dynamic(() => import('../components/GameScreen'), { ssr: false });

export default function Home() {
  return (
    <main className="main-container">
      <GameScreen />
    </main>
  );
}
