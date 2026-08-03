import React, { useEffect, useState } from 'react';

interface ComboMilestoneProps {
  combo: number;
}

export const ComboMilestone: React.FC<ComboMilestoneProps> = ({ combo }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (combo === 5 || combo === 10 || combo === 20 || combo === 50) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [combo]);

  if (!visible) return null;

  let background = '';
  let emojis = '';
  if (combo >= 50) { background = 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff)'; emojis = '🔥🔥🔥'; }
  else if (combo >= 20) { background = 'linear-gradient(90deg, #FFD700, #FFA500)'; emojis = '🌟🌟'; }
  else if (combo >= 10) { background = 'linear-gradient(90deg, #f093fb, #f5576c)'; emojis = '🔥🔥'; }
  else if (combo >= 5) { background = 'linear-gradient(90deg, #ff9a9e, #fecfef)'; emojis = '🔥'; }
  else return null;

  return (
    <div style={{
      position: 'absolute', top: '100px', left: 0, width: '100%',
      background, padding: '15px 0', textAlign: 'center', zIndex: 50,
      animation: 'slideInRight 0.3s ease-out forwards',
      boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
    }}>
      <h2 style={{ margin: 0, fontSize: '36px', color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.5)', fontFamily: '"Fredoka One", cursive' }}>
        {emojis} {combo} COMBO! {emojis}
      </h2>
    </div>
  );
};
