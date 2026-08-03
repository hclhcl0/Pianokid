import React, { useRef, useEffect } from 'react';
import { ActiveNote, GameConfig } from '../types';
import { getPianoKeyLayout, START_MIDI, NUM_KEYS, NUM_WHITE_KEYS } from '../lib/pianoLayout';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface GameCanvasProps {
  activeNotes: ActiveNote[];
  config: GameConfig;
  canvasWidth: number;
  canvasHeight: number;
  waitingForNote: number | null;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  activeNotes,
  config,
  canvasWidth,
  canvasHeight,
  waitingForNote,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<number>(0);
  const rafRef = useRef<number>();
  const particlesRef = useRef<{x: number, y: number, vx: number, vy: number, life: number, color: string}[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      phaseRef.current += 0.05;
      const pulse = (Math.sin(phaseRef.current) + 1) / 2;

      // ── Background ────────────────────────────────────────────────────
      const bgGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
      bgGradient.addColorStop(0, '#0a0a1a');
      bgGradient.addColorStop(1, '#1a1a3e');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      const whiteKeyWidth = canvasWidth / NUM_WHITE_KEYS;
      
      // Proportional key height (approx 1:5 ratio for white keys)
      // Cap at 30% of screen height to leave room for falling notes
      const keyHeight = Math.min(canvasHeight * 0.3, whiteKeyWidth * 5);
      const hitZoneY = canvasHeight - keyHeight;
      const blackKeyHeight = keyHeight * 0.6;

      const activeKeys = new Set<number>();
      
      activeNotes.forEach(note => {
          // Tính Y chính xác dựa trên hitZoneY và thời gian
          const timeFromHit = note.y / config.fallSpeed - config.lookAheadTime;
          const trueY = hitZoneY + timeFromHit * config.fallSpeed;
          const height = Math.max(note.duration * config.fallSpeed, 20);
          const noteTopY = trueY - height;
          
          if (!note.hit && !note.missed && trueY >= hitZoneY && noteTopY <= hitZoneY) {
              activeKeys.add(note.midiNumber);
              
              // Phát nổ hạt (particles) khi đụng phím ở chế độ Standard hoặc khi đang Hold nốt
              if (!config.waitMode || note.isHeld) {
                  const layout = getPianoKeyLayout(note.midiNumber, canvasWidth);
                  if (layout && Math.random() > 0.2) {
                      for(let i=0; i<2; i++) {
                          particlesRef.current.push({
                             x: layout.centerX + (Math.random() - 0.5) * layout.width,
                             y: hitZoneY,
                             vx: (Math.random() - 0.5) * 8,
                             vy: (Math.random() * -6) - 1,
                             life: 1.0,
                             color: note.track === 'left' ? '#56CCF2' : '#A8E063'
                          });
                      }
                  }
              }
          }
      });

      // ── Hit zone line ─────────────────────────────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, hitZoneY);
      ctx.lineTo(canvasWidth, hitZoneY);
      ctx.strokeStyle = '#ff2a2a'; // Red hitline like Synthesia
      ctx.lineWidth = 3;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff2a2a';
      ctx.stroke();
      ctx.restore();

      // ── Piano keyboard ────────────────────────────────────────────────
      // Draw white keys first so they are underneath black keys
      for (let i = 0; i < NUM_KEYS; i++) {
        const midiNum = START_MIDI + i;
        const layout = getPianoKeyLayout(midiNum, canvasWidth);
        if (layout && layout.type === 'white') {
          const isWaiting = waitingForNote === midiNum;
          const isActive = activeKeys.has(midiNum);
          
          ctx.save();
          if (isWaiting || isActive) {
            ctx.fillStyle = isWaiting 
              ? `rgba(255, 200, 50, 1)` // Yellow for wait
              : `rgba(130, 240, 100, 1)`; // Bright Green for active
          } else {
            // Completely flat white key like Synthesia
            ctx.fillStyle = '#ffffff';
          }
          
          // Simulated 'pressed down' effect: key gets slightly shorter
          const currentKeyHeight = (isWaiting || isActive) ? keyHeight - 4 : keyHeight;
          
          ctx.beginPath();
          ctx.rect(layout.x, hitZoneY, layout.width, currentKeyHeight);
          ctx.fill();
          
          ctx.strokeStyle = '#000000'; // Hard black border
          ctx.lineWidth = 1;
          ctx.stroke();

          // Draw note text on white keys
          ctx.fillStyle = '#000000';
          ctx.font = `bold ${Math.max(10, layout.width * 0.4)}px "Fredoka One", sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(NOTE_NAMES[midiNum % 12], layout.centerX, hitZoneY + currentKeyHeight - 15);
          
          ctx.restore();
        }
      }

      // Draw black keys on top
      for (let i = 0; i < NUM_KEYS; i++) {
        const midiNum = START_MIDI + i;
        const layout = getPianoKeyLayout(midiNum, canvasWidth);
        if (layout && layout.type === 'black') {
          const isWaiting = waitingForNote === midiNum;
          const isActive = activeKeys.has(midiNum);
          
          ctx.save();
          if (isWaiting || isActive) {
            ctx.fillStyle = isWaiting
              ? `rgba(255, 200, 0, 1)`
              : `rgba(130, 240, 100, 1)`;
          } else {
            // Completely flat black key
            ctx.fillStyle = '#222222';
          }
          
          // Bóng đổ bên trái (Drop shadow to the left)
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = -3; // Negative X to cast shadow to the left
          ctx.shadowOffsetY = 2;
          
          // Simulated 'pressed down' effect: key gets slightly shorter
          const currentBlackKeyHeight = (isWaiting || isActive) ? blackKeyHeight - 3 : blackKeyHeight;
          
          ctx.beginPath();
          ctx.rect(layout.x, hitZoneY, layout.width, currentBlackKeyHeight);
          ctx.fill();
          
          // Clear shadow for border and text
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Draw note text on black keys
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.max(9, layout.width * 0.4)}px "Fredoka One", sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(NOTE_NAMES[midiNum % 12], layout.centerX, hitZoneY + currentBlackKeyHeight - 12);
          
          ctx.restore();
        }
      }

      // ── Falling note pills ─────────────────────────────────────────────
      activeNotes.forEach(note => {
        if ((note.hit && !note.isHeld) || note.missed) return;

        const layout = getPianoKeyLayout(note.midiNumber, canvasWidth);
        if (!layout) return;

        const isLeft = note.track === 'left';
        // Note pills are slightly narrower than the physical keys
        const width = layout.type === 'white' ? layout.width * 0.8 : layout.width * 0.9;
        const x = layout.centerX - width / 2;
        const height = Math.max(note.duration * config.fallSpeed, 20);
        
        // Tính toán true Y
        const timeFromHit = note.y / config.fallSpeed - config.lookAheadTime;
        let noteBottomY = hitZoneY + timeFromHit * config.fallSpeed;
        let noteTopY = noteBottomY - height;

        // "Biến mất": Cắt nốt khi đang Hold HOẶC đi qua hit zone (chui vào phím) ở chế độ standard
        if (note.isHeld || (!config.waitMode && noteBottomY > hitZoneY)) {
           noteBottomY = hitZoneY;
        }

        const drawHeight = noteBottomY - noteTopY;
        if (drawHeight <= 0) return; // Đã chìm hết

        ctx.save();

        if (note.isWaiting) {
          ctx.fillStyle = '#FFD700'; // Solid yellow
          ctx.strokeStyle = '#FFFFFF';
        } else if (isLeft) {
          ctx.fillStyle = '#56CCF2'; // Solid flat blue
          ctx.strokeStyle = '#1E5799';
        } else {
          ctx.fillStyle = '#A8E063'; // Solid flat green
          ctx.strokeStyle = '#3E8E41';
        }

        ctx.beginPath();
        // Slightly rounded corners like the video
        ctx.roundRect(x, noteTopY, width, drawHeight, 8);
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.stroke();

        // Always draw note name inside the pill if it's tall enough
        if (drawHeight > 15) {
          ctx.fillStyle = note.isWaiting ? '#000000' : '#000000'; // Black text for high contrast on flat notes
          ctx.font = `bold ${Math.min(width * 0.6, 18)}px Fredoka One, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Ensure text is printed near the bottom of the pill (where it hits) if it's long
          const textY = drawHeight > 40 ? noteBottomY - 15 : noteBottomY - drawHeight / 2;
          ctx.fillText(NOTE_NAMES[note.midiNumber % 12], layout.centerX, textY);
        }

        ctx.restore();
      });

      // ── Explosion Particles ───────────────────────────────────────────
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      particlesRef.current.forEach(p => {
         p.x += p.vx;
         p.y += p.vy;
         p.vy += 0.3; // Trọng lực (Gravity)
         p.life -= 0.03;
         
         ctx.save();
         ctx.globalAlpha = Math.max(0, p.life);
         ctx.fillStyle = p.color;
         ctx.beginPath();
         // Vẽ các tia lửa hình tròn
         ctx.arc(p.x, p.y, Math.random() * 3 + 1.5, 0, Math.PI * 2);
         ctx.fill();
         
         // Đổ bóng phát sáng cho tia lửa
         ctx.shadowBlur = 5;
         ctx.shadowColor = p.color;
         ctx.fill();
         ctx.restore();
      });

      // ── Wait Mode overlay banner ──────────────────────────────────────
      if (waitingForNote !== null) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 200, 0, ${0.08 + 0.05 * pulse})`;
        ctx.fillRect(0, 0, canvasWidth, hitZoneY);

        ctx.font = 'bold 18px Fredoka One, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255, 220, 80, ${0.6 + 0.4 * pulse})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#FFD700';
        ctx.fillText('⏸ PRESS THE HIGHLIGHTED KEY', canvasWidth / 2, 36);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [activeNotes, canvasWidth, canvasHeight, config.fallSpeed, waitingForNote]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
    />
  );
};
