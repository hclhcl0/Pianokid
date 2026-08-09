'use client';
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Lesson } from '../types';

const GameScreen = dynamic(() => import('../components/GameScreen'), { ssr: false });

export default function Home() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLessons = async () => {
      try {
        const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const res = await fetch(`${API}/api/lessons?published=true`);
        if (!res.ok) throw new Error('Failed to fetch lessons');
        const data = await res.json();
        const loadedLessons = data.data || [];
        setLessons(loadedLessons);
        if (loadedLessons.length > 0) {
          setSelectedLesson(loadedLessons[0]);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchLessons();
  }, []);

  if (loading) {
    return <main className="main-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}><h2 style={{color: '#fff', fontFamily: 'Nunito, sans-serif', opacity: 0.8}}>🎹 Đang tải bài hát...</h2></main>;
  }

  if (error || !selectedLesson) {
    return <main className="main-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}><h2 style={{color: '#ff6b6b', fontFamily: 'Nunito, sans-serif'}}>Lỗi tải dữ liệu: {error || 'Không tìm thấy bài hát'}</h2></main>;
  }

  return (
    <main className="main-container">
      <GameScreen 
        lesson={selectedLesson} 
        allLessons={lessons}
        onSelectLesson={setSelectedLesson} 
      />
    </main>
  );
}
