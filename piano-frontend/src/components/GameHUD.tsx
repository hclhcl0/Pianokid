import React from 'react';

interface GameHUDProps {
  score: number;
  combo: number;
  stars: number;
}

export const GameHUD: React.FC<GameHUDProps> = ({ score, combo, stars }) => {
  return (
    <div className="hud-overlay" style={{ pointerEvents: 'none' }}>
      <div className="hud-top">
        <div className="score-board glass">
          <span className="label">SCORE</span>
          <span className="value">{score.toLocaleString()}</span>
        </div>
        
        <div className="stars-container">
          {[1, 2, 3].map(s => (
            <span
              key={s}
              className={`star ${s <= stars ? 'active starLight' : ''}`}
            >
              ⭐
            </span>
          ))}
        </div>
        
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="combo-badge glass">
            <span className="label">COMBO</span>
            <span className={`value ${combo > 5 ? 'comboFlash' : ''}`}>
              {combo}x {combo > 5 && '🔥'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
