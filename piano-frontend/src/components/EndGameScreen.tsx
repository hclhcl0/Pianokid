import React, { useEffect, useState } from 'react';

interface EndGameScreenProps {
  score: number;
  stars: number;
  accuracy: number;
  totalNotes: number;
  hitNotes: number;
  combo: number;
  lessonTitle: string;
  onReplay: () => void;
  onNextLesson: () => void;
  onHome: () => void;
}

export const EndGameScreen: React.FC<EndGameScreenProps> = ({
  score, stars, accuracy, totalNotes, hitNotes, combo, lessonTitle, onReplay, onNextLesson, onHome
}) => {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1500;
    const steps = 60;
    const increment = score / steps;
    const intervalTime = duration / steps;
    
    if (score === 0) return;

    const timer = setInterval(() => {
      start += increment;
      if (start >= score) {
        setDisplayScore(score);
        clearInterval(timer);
      } else {
        setDisplayScore(Math.floor(start));
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [score]);

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, animation: 'slideInUp 0.5s ease-out forwards'
    }}>
      <h1 style={{ fontSize: '48px', color: 'white', marginBottom: '20px', textShadow: '0 4px 10px rgba(0,0,0,0.5)', fontFamily: '"Fredoka One", cursive' }}>
        {lessonTitle} Complete! 🎉
      </h1>
      
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
        {[1, 2, 3].map((starIndex) => (
          <div key={starIndex} style={{
            fontSize: '64px',
            color: starIndex <= stars ? '#FFD700' : '#555',
            filter: starIndex <= stars ? 'drop-shadow(0 0 15px rgba(255, 215, 0, 0.8))' : 'none',
            animation: starIndex <= stars ? `starPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) ${starIndex * 0.3}s backwards` : 'none'
          }}>
            ⭐
          </div>
        ))}
      </div>

      <div style={{ fontSize: '64px', color: '#00FFFF', marginBottom: '30px', animation: 'countUp 1.5s ease-out', fontFamily: '"Fredoka One", cursive' }}>
        {displayScore}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px',
        background: 'rgba(255,255,255,0.1)', padding: '30px', borderRadius: '16px', marginBottom: '40px',
        fontFamily: '"Fredoka One", cursive'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#aaa' }}>Accuracy</div>
          <div style={{ fontSize: '24px', color: 'white' }}>{accuracy.toFixed(1)}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#aaa' }}>Max Combo</div>
          <div style={{ fontSize: '24px', color: '#FFD700' }}>{combo}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#aaa' }}>Notes Hit</div>
          <div style={{ fontSize: '24px', color: '#00FFFF' }}>{hitNotes}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#aaa' }}>Total Notes</div>
          <div style={{ fontSize: '24px', color: 'white' }}>{totalNotes}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', fontFamily: '"Fredoka One", cursive' }}>
        <button onClick={onHome} style={{ padding: '15px 30px', fontSize: '20px', borderRadius: '30px', border: 'none', background: '#333', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }} aria-label="Home">🏠 Home</button>
        <button onClick={onReplay} style={{ padding: '15px 30px', fontSize: '20px', borderRadius: '30px', border: 'none', background: 'linear-gradient(45deg, #667eea, #764ba2)', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }} aria-label="Replay">🔄 Replay</button>
        <button onClick={onNextLesson} style={{ padding: '15px 30px', fontSize: '20px', borderRadius: '30px', border: 'none', background: 'linear-gradient(45deg, #f093fb, #f5576c)', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }} aria-label="Next Lesson">⏭️ Next</button>
      </div>
    </div>
  );
};
