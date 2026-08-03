import React from 'react';

interface GameHUDProps {
  score: number;
  combo: number;
  stars: number;
  waitMode: boolean;
  onPause: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({ score, combo, stars, waitMode, onPause }) => {
  return (
    <div className="hud-container">
      <div className="hud-top">
        <div className="score-badge glass">
          <span className="label">SCORE</span>
          <span className="value">{score}</span>
        </div>
        
        <div className="stars-container glass">
          <div style={{ display: 'flex', gap: '5px' }}>
            {[1, 2, 3].map(s => (
              <span key={s} className={`star ${stars >= s ? 'lit' : ''}`}>⭐</span>
            ))}
          </div>
        </div>

        <div className="combo-badge glass">
          <span className="label">COMBO</span>
          <span className={`value ${combo > 5 ? 'comboFlash' : ''}`}>
            {combo}x {combo > 5 && '🔥'}
          </span>
        </div>
      </div>
      
      <div className="hud-bottom">
        <div className="mode-badge glass">
          {waitMode ? 'WAIT MODE' : 'STANDARD MODE'}
        </div>
        <button className="pause-btn glass" onClick={onPause}>
          ⏸ PAUSE
        </button>
      </div>
    </div>
  );
};
