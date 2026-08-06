import React, { useRef, useEffect } from 'react';
import { ActiveNote, GameConfig } from '../types';
import { getPianoKeyLayout, KeyboardRange, DEFAULT_RANGE, MIDI_TO_KEY } from '../lib/pianoLayout';

const NOTE_NAMES = [
  'C (Do)', 'C#', 'D (Re)', 'D#', 'E (Mi)', 'F (Fa)', 
  'F#', 'G (Sol)', 'G#', 'A (La)', 'A#', 'B (Si)'
];

interface GameCanvasProps {
  registerDrawCallback: (cb: (currentTime: number, activeNotes: ActiveNote[]) => void) => () => void;
  config: GameConfig;
  canvasWidth: number;
  canvasHeight: number;
  waitingForNote: number | null;
  userActiveKeysRef?: React.MutableRefObject<Set<number>>;
  keyboardRange?: KeyboardRange;
  showFingering?: boolean;
  onKeyPress?: (midiNumber: number) => void;
  onKeyRelease?: (midiNumber: number) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = React.memo(({
  registerDrawCallback,
  config,
  canvasWidth,
  canvasHeight,
  waitingForNote,
  userActiveKeysRef,
  keyboardRange = DEFAULT_RANGE,
  showFingering = true,
  onKeyPress,
  onKeyRelease,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<number>(0);
  const particlesRef = useRef<{x: number, y: number, vx: number, vy: number, life: number, size: number, color: string}[]>([]);
  const activePointersRef = useRef<Map<number, number>>(new Map()); // pointerId -> midiNumber

  const getMidiNumberFromPointer = (x: number, y: number): number | null => {
    const whiteKeyWidth = canvasWidth / keyboardRange.numWhiteKeys;
    const keyHeight = Math.min(canvasHeight * 0.3, whiteKeyWidth * 5);
    const hitZoneY = canvasHeight - keyHeight;
    const blackKeyHeight = keyHeight * 0.6;

    if (y < hitZoneY) return null;

    // Check black keys first
    if (y <= hitZoneY + blackKeyHeight) {
      for (let i = 0; i < keyboardRange.numKeys; i++) {
        const midiNum = keyboardRange.startMidi + i;
        const layout = getPianoKeyLayout(midiNum, canvasWidth, keyboardRange);
        if (layout && layout.type === 'black') {
          if (x >= layout.x && x <= layout.x + layout.width) return midiNum;
        }
      }
    }

    // Check white keys
    for (let i = 0; i < keyboardRange.numKeys; i++) {
      const midiNum = keyboardRange.startMidi + i;
      const layout = getPianoKeyLayout(midiNum, canvasWidth, keyboardRange);
      if (layout && layout.type === 'white') {
        if (x >= layout.x && x <= layout.x + layout.width) return midiNum;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midiNum = getMidiNumberFromPointer(x, y);
    if (midiNum !== null) {
      activePointersRef.current.set(e.pointerId, midiNum);
      onKeyPress?.(midiNum);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midiNum = getMidiNumberFromPointer(x, y);
    const currentMidi = activePointersRef.current.get(e.pointerId);

    if (midiNum !== currentMidi) {
      if (currentMidi !== undefined) onKeyRelease?.(currentMidi);
      if (midiNum !== null) {
        activePointersRef.current.set(e.pointerId, midiNum);
        onKeyPress?.(midiNum);
      } else {
        activePointersRef.current.delete(e.pointerId);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const midiNum = activePointersRef.current.get(e.pointerId);
    if (midiNum !== undefined) {
      onKeyRelease?.(midiNum);
      activePointersRef.current.delete(e.pointerId);
    }
  };


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const unregister = registerDrawCallback((currentTime, activeNotes) => {
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
          const isPhysicallyActive = userActiveKeysRef?.current.has(midiNum);
          const isActive = activeKeys.has(midiNum) || isPhysicallyActive;
          
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
          if (showFingering) {
            ctx.fillStyle = '#000000';
            ctx.font = `bold ${Math.max(9, layout.width * 0.22)}px Nunito, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(NOTE_NAMES[midiNum % 12], layout.centerX, hitZoneY + currentKeyHeight - 15);
          }
          ctx.restore();
        }
      }

      // Draw black keys on top
      for (let i = 0; i < keyboardRange.numKeys; i++) {
        const midiNum = keyboardRange.startMidi + i;
        const layout = getPianoKeyLayout(midiNum, canvasWidth, keyboardRange);
        if (layout && layout.type === 'black') {
          const isWaiting = waitingForNote === midiNum;
          const isPhysicallyActive = userActiveKeysRef?.current.has(midiNum);
          const isActive = activeKeys.has(midiNum) || isPhysicallyActive;
          
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
          
          ctx.restore();
        }
      }

      // ── Falling note pills ─────────────────────────────────────────────
      activeNotes.forEach(note => {
        if ((note.hit && !note.isHeld) || note.missed) return;

        const layout = getPianoKeyLayout(note.midiNumber, canvasWidth, keyboardRange);
        if (!layout) return;

        const isLeft = note.track === 'left';
        const width = layout.type === 'white' ? layout.width * 0.8 : layout.width * 0.9;
        const x = layout.centerX - width / 2;
        const height = Math.max(note.duration * config.fallSpeed, 20);
        
        const timeFromHit = note.y / config.fallSpeed - config.lookAheadTime;
        let noteBottomY = hitZoneY + timeFromHit * config.fallSpeed;
        let noteTopY = noteBottomY - height;

        if (note.isHeld || (!config.waitMode && noteBottomY > hitZoneY)) {
           noteBottomY = hitZoneY;
        }

        const drawHeight = noteBottomY - noteTopY;
        if (drawHeight <= 0) return;

        ctx.save();
        if (note.isWaiting) {
          ctx.fillStyle = '#FFD700';
          ctx.strokeStyle = '#FFFFFF';
        } else if (isLeft) {
          ctx.fillStyle = '#56CCF2';
          ctx.strokeStyle = '#1E5799';
        } else {
          ctx.fillStyle = '#A8E063';
          ctx.strokeStyle = '#3E8E41';
        }
        ctx.shadowBlur = 15;
        ctx.beginPath();
        const isTouchingBottom = noteBottomY >= hitZoneY - 2;
        const radii = isTouchingBottom ? [8, 8, 0, 0] : [8, 8, 8, 8];
        ctx.roundRect(x, noteTopY, width, drawHeight, radii);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
        ctx.stroke();

        if (drawHeight > 15) {
          ctx.fillStyle = '#000000';
          ctx.font = `900 ${Math.max(12, width * 0.5)}px Nunito, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const textY = drawHeight > 40 ? noteBottomY - 20 : noteBottomY - drawHeight / 2;
          const fullLabel = NOTE_NAMES[note.midiNumber % 12];
          const shortLabel = fullLabel.split(' ')[0]; // Only take "C", "C#" etc.
          ctx.fillText(shortLabel, layout.centerX, textY);
        }
        ctx.restore();
      });

      // ── Spark Particles ───────────────────────────────────────────
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      particlesRef.current.forEach(p => {
         p.x += p.vx;
         p.y += p.vy;
         p.vx *= 0.95;
         p.vy *= 0.95;
         p.life -= 0.03;
         ctx.save();
         ctx.globalCompositeOperation = 'screen';
         ctx.globalAlpha = Math.max(0, p.life * p.life * 0.8);
         ctx.fillStyle = p.color;
         ctx.beginPath();
         ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
         ctx.fill();
         ctx.shadowBlur = 8;
         ctx.shadowColor = p.color;
         ctx.fill();
         ctx.restore();
      });
    });

    return unregister;
  }, [canvasWidth, canvasHeight, config.fallSpeed, config.waitMode, config.lookAheadTime, keyboardRange, registerDrawCallback, showFingering, waitingForNote, userActiveKeysRef]);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{ display: 'block', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerOut={handlePointerUp}
      />
    </div>
  );
});
