import React, { useRef, useEffect } from 'react';
import { ActiveNote, GameConfig } from '../types';
import { getPianoKeyLayout, KeyboardRange, DEFAULT_RANGE, MIDI_TO_KEY } from '../lib/pianoLayout';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface GameCanvasProps {
  activeNotes: ActiveNote[];
  config: GameConfig;
  canvasWidth: number;
  canvasHeight: number;
  waitingForNote: number | null;
  userActiveKeys?: Set<number>;
  keyboardRange?: KeyboardRange;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  activeNotes,
  config,
  canvasWidth,
  canvasHeight,
  waitingForNote,
  userActiveKeys = new Set(),
  keyboardRange = DEFAULT_RANGE,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<number>(0);
  const rafRef = useRef<number>();
  const particlesRef = useRef<{x: number, y: number, vx: number, vy: number, life: number, size: number, color: string}[]>([]);

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

      const whiteKeyWidth = canvasWidth / keyboardRange.numWhiteKeys;
      
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
          
          if (note.isHeld || (!note.hit && !note.missed && trueY >= hitZoneY && noteTopY <= hitZoneY)) {
              activeKeys.add(note.midiNumber);
              
              if (note.isHeld) {
                  const layout = getPianoKeyLayout(note.midiNumber, canvasWidth, keyboardRange);
                  if (layout) {
                      // Tạo hạt mịn hơn (kích thước nhỏ, bay nhẹ nhàng)
                      for (let i = 0; i < 2; i++) {
                          particlesRef.current.push({
                             x: layout.centerX + (Math.random() - 0.5) * layout.width * 0.5,
                             y: hitZoneY, 
                             vx: (Math.random() - 0.5) * 1.5,
                             vy: (Math.random() * -5) - 1, 
                             life: 1.0,
                             size: Math.random() * 2 + 1, // Hạt mịn và nhỏ hơn
                             color: '#ffffff'
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
      for (let i = 0; i < keyboardRange.numKeys; i++) {
        const midiNum = keyboardRange.startMidi + i;
        const layout = getPianoKeyLayout(midiNum, canvasWidth, keyboardRange);
        if (layout && layout.type === 'white') {
          const isWaiting = waitingForNote === midiNum;
          const isActive = activeKeys.has(midiNum) || userActiveKeys.has(midiNum);
          
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
          ctx.font = `900 ${Math.max(14, layout.width * 0.5)}px "Nunito", sans-serif`; // To và đậm hơn
          ctx.textAlign = 'center';
          // Nâng lên một chút để chữ to không chạm viền đáy
          ctx.fillText(NOTE_NAMES[midiNum % 12], layout.centerX, hitZoneY + currentKeyHeight - 12);
          
          ctx.restore();
        }
      }

      // Draw black keys on top
      for (let i = 0; i < keyboardRange.numKeys; i++) {
        const midiNum = keyboardRange.startMidi + i;
        const layout = getPianoKeyLayout(midiNum, canvasWidth, keyboardRange);
        if (layout && layout.type === 'black') {
          const isWaiting = waitingForNote === midiNum;
          const isActive = activeKeys.has(midiNum) || userActiveKeys.has(midiNum);
          
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
          // (Usually we don't draw note names on black keys to avoid clutter)
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.max(9, layout.width * 0.4)}px "Nunito", sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(NOTE_NAMES[midiNum % 12], layout.centerX, hitZoneY + currentBlackKeyHeight - 12);
          
          ctx.restore();
        }
      }

      // ── Falling note pills ─────────────────────────────────────────────
      activeNotes.forEach(note => {
        if ((note.hit && !note.isHeld) || note.missed) return;

        const layout = getPianoKeyLayout(note.midiNumber, canvasWidth, keyboardRange);
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
          ctx.shadowColor = '#FFD700';
        } else if (isLeft) {
          ctx.fillStyle = '#56CCF2'; // Solid flat blue
          ctx.strokeStyle = '#1E5799';
          ctx.shadowColor = '#56CCF2';
        } else {
          ctx.fillStyle = '#A8E063'; // Solid flat green
          ctx.strokeStyle = '#3E8E41';
          ctx.shadowColor = '#A8E063';
        }

        // Tạo hiệu ứng phát sáng nổi bật
        ctx.shadowBlur = 15;
        
        ctx.beginPath();
        // Nếu nốt nhạc chạm đáy (vùng hit zone), xóa bo tròn góc dưới để dính chặt vào phím đàn không bị hở
        const isTouchingBottom = noteBottomY >= hitZoneY - 2;
        const radii = isTouchingBottom ? [8, 8, 0, 0] : [8, 8, 8, 8];
        ctx.roundRect(x, noteTopY, width, drawHeight, radii);
        
        ctx.globalAlpha = 1.0; // Không làm mờ tay trái nữa để nốt nổi bật hơn
        
        ctx.fill();

        ctx.lineWidth = 2;
        // Bỏ shadow khi vẽ viền để viền được sắc nét
        ctx.shadowBlur = 0;
        ctx.stroke();

        // Always draw note name inside the pill if it's tall enough
        if (drawHeight > 15) {
          ctx.fillStyle = '#000000'; // Đen đậm trên nền sáng
          // Bỏ giới hạn 18px, cho phép chữ to theo chiều ngang của nốt
          ctx.font = `900 ${Math.max(14, width * 0.7)}px Nunito, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // In chữ ở gần đáy thanh nhạc, thụt lên một chút để không bị che bởi tia lửa
          const textY = drawHeight > 40 ? noteBottomY - 20 : noteBottomY - drawHeight / 2;
          ctx.fillText(NOTE_NAMES[note.midiNumber % 12], layout.centerX, textY);
        }

        // Hiệu ứng "đốt cháy" mượt và không che lấp nốt nhạc
        if (note.isHeld) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen'; // Blend mode giúp hiệu ứng sáng lên mà không đè bít nốt nhạc
            const glowWidth = width * 1.5; // Kéo rộng thêm để vệt mờ lan xa
            const glowHeight = 8; 
            
            // Vẽ vệt mờ nhòe cực mạnh
            ctx.shadowBlur = 40; // Tăng mạnh độ nhòe
            ctx.shadowColor = isLeft ? '#56CCF2' : '#A8E063';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; // Gần như trong suốt, chỉ lấy cái bóng (shadow)
            
            ctx.beginPath();
            ctx.ellipse(layout.centerX, hitZoneY, glowWidth / 2, glowHeight / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fill(); // Vẽ 2 lần để cái bóng nhòe đậm hơn mà lõi không bị cứng
            
            // Vẽ lõi laser (cũng làm nhòe để không bị sắc cạnh)
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#FFFFFF';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.beginPath();
            ctx.ellipse(layout.centerX, hitZoneY, width * 0.4, glowHeight * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }

        ctx.restore();
      });

      // ── Spark Particles ───────────────────────────────────────────
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      particlesRef.current.forEach(p => {
         p.x += p.vx;
         p.y += p.vy;
         
         // Ma sát không khí (Drag) làm hạt bay chậm dần
         p.vx *= 0.95;
         p.vy *= 0.95;
         
         p.life -= 0.03; // Tan biến từ từ
         
         ctx.save();
         ctx.globalCompositeOperation = 'screen'; // Blend mode sáng mịn, không che nốt
         ctx.globalAlpha = Math.max(0, p.life * p.life * 0.8); // Giảm nhẹ alpha tối đa
         ctx.fillStyle = p.color;
         
         ctx.beginPath();
         ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
         ctx.fill();
         
         ctx.shadowBlur = 8;
         ctx.shadowColor = p.color;
         ctx.fill();
         ctx.restore();
      });

      // ── Wait Mode overlay banner removed per user request ──────────────

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
