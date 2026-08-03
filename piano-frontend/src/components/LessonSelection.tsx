import React, { useEffect, useState } from 'react';
import { Lesson } from '../types';

interface LessonSelectionProps {
  onSelectLesson: (lesson: Lesson) => void;
}

export const LessonSelection: React.FC<LessonSelectionProps> = ({ onSelectLesson }) => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLessons = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/lessons?published=true');
        if (!res.ok) throw new Error('Failed to fetch lessons');
        const data = await res.json();
        setLessons(data.data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchLessons();
  }, []);

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Nunito, sans-serif' }}>
      <h1 style={{ fontSize: '48px', marginBottom: '20px', textAlign: 'center', color: '#fff' }}>🎹 KidsPiano</h1>
      <h2 style={{ fontSize: '24px', marginBottom: '40px', textAlign: 'center', opacity: 0.8, color: '#fff' }}>Chọn bài hát để chơi nhé!</h2>
      
      {loading && <p style={{ color: '#fff', textAlign: 'center' }}>Đang tải bài hát...</p>}
      {error && <p style={{ color: '#ff6b6b', textAlign: 'center' }}>Lỗi: {error}</p>}
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', justifyContent: 'center' }}>
        {lessons.map(lesson => (
          <div 
            key={lesson.id}
            onClick={() => onSelectLesson(lesson)}
            style={{
              width: '280px',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              padding: '20px',
              cursor: 'pointer',
              border: '2px solid rgba(255, 255, 255, 0.2)',
              transition: 'transform 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {lesson.thumbnail ? (
              <img src={lesson.thumbnail} alt={lesson.title} style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '12px', marginBottom: '16px' }} />
            ) : (
              <div style={{ width: '100%', height: '160px', background: '#333', borderRadius: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '48px' }}>🎵</span>
              </div>
            )}
            <h3 style={{ fontSize: '20px', color: '#fff', marginBottom: '8px' }}>{lesson.title}</h3>
            <p style={{ color: '#aaa', fontSize: '14px' }}>Cấp độ {lesson.level} • {lesson.tempo} BPM</p>
          </div>
        ))}
        {lessons.length === 0 && !loading && !error && (
          <p style={{ color: '#fff', textAlign: 'center' }}>Chưa có bài hát nào được xuất bản.</p>
        )}
      </div>
    </div>
  );
};
export default LessonSelection;
