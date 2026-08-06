import React from 'react';

interface GameHUDProps {
  score: number;
  combo: number;
  stars: number;
  waitMode: boolean;
  onPause: () => void;
  onSettings: () => void;
  onToggleWaitMode?: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({ score, combo, stars, waitMode, onPause, onSettings, onToggleWaitMode }) => {
  return (
    <div className="hud-overlay">
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
          <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
            <button className="pause-btn glass" onClick={onPause} style={{ fontSize: 22, padding: '8px 14px' }} title="Tạm dừng">
              ⏸
            </button>
            <button className="pause-btn glass" onClick={onSettings} style={{ fontSize: 22, padding: '8px 14px' }} title="Cài đặt">
              ⚙️
            </button>
          </div>
        </div>
      </div>
      
      <div className="hud-bottom">
        <button
          onClick={onToggleWaitMode}
          className="mode-badge glass"
          style={{ cursor: 'pointer', border: 'none', pointerEvents: 'auto', background: waitMode ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.15)' }}
          title="Nhấn để đổi chế độ"
        >
          {waitMode ? '⏳ CHẾ ĐỘ CHỜ (WAIT)' : '🚀 RƠI TỰ DO (STANDARD)'}
        </button>
      </div>
    </div>
  );
};
