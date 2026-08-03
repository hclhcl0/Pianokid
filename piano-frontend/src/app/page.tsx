'use client';
import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Lesson } from '../types';
import { LessonSelection } from '../components/LessonSelection';

const GameScreen = dynamic(() => import('../components/GameScreen'), { ssr: false });

export default function Home() {
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

  return (
    <main className="main-container">
      {selectedLesson ? (
        <GameScreen lesson={selectedLesson} onBack={() => setSelectedLesson(null)} />
      ) : (
        <LessonSelection onSelectLesson={setSelectedLesson} />
      )}
    </main>
  );
}
