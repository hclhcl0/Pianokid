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
        const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const res = await fetch(`${API}/api/lessons?published=true`);
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
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Nunito, sans-serif', height: '100%', overflowY: 'auto' }}>
      <h1 style={{ fontSize: '48px', marginBottom: '20px', textAlign: 'center', color: '#fff' }}>🎹 KidsPiano</h1>
      <h2 style={{ fontSize: '24px', marginBottom: '40px', textAlign: 'center', opacity: 0.8, color: '#fff' }}>Chọn bài hát để chơi nhé!</h2>
      
      {loading && <p style={{ color: '#fff', textAlign: 'center' }}>Đang tải bài hát...</p>}
      {error && <p style={{ color: '#ff6b6b', textAlign: 'center' }}>Lỗi: {error}</p>}
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px', width: '100%', maxWidth: '900px', margin: '0 auto' }}>
        {lessons.map(lesson => (
          <div 
            key={lesson.id}
            onClick={() => onSelectLesson(lesson)}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              padding: '12px 16px',
              cursor: 'pointer',
              border: '2px solid rgba(255, 255, 255, 0.1)',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateX(8px)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = '#A8E063';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateX(0)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            {lesson.thumbnail ? (
              <img src={lesson.thumbnail} alt={lesson.title} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', marginRight: '16px' }} />
            ) : (
              <div style={{ width: '60px', height: '60px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', marginRight: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '28px' }}>🎵</span>
              </div>
            )}
            
            <div style={{ flex: 1, textAlign: 'left' }}>
              <h3 style={{ fontSize: '18px', color: '#fff', margin: '0 0 4px 0', fontWeight: 'bold' }}>{lesson.title}</h3>
              <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', margin: 0 }}>
                ⭐ Cấp độ {lesson.level} &nbsp;•&nbsp; ⏱️ {lesson.tempo} BPM
              </p>
            </div>
            
            <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                background: '#A8E063', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#1a1a3e',
                fontSize: '20px',
                paddingLeft: '4px', // Optical alignment for play triangle
                boxShadow: '0 4px 10px rgba(168, 224, 99, 0.4)'
              }}>
              ▶
            </div>
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
