'use client';
import React, { useRef, useEffect } from 'react';
import { NoteEvent, ActiveNote, GameConfig } from '../types';
import { KeyboardRange } from '../lib/pianoLayout';
import { GameCanvas } from './GameCanvas';
import { OSMDView } from './OSMDView';

interface SheetViewProps {
  notes:         NoteEvent[];
  tempo:         number;
  timeSignature: string;
  canvasWidth:   number;
  canvasHeight:  number;
  keyboardRange: KeyboardRange;
  userActiveKeysRef?: React.MutableRefObject<Set<number>>;
  config:        GameConfig;
  waitingForNote: number | null;
  showFingering: boolean;
  xmlUrl:        string | null;
  registerDrawCallback: (cb: (currentTime: number, activeNotes: ActiveNote[]) => void) => () => void;
}

export const SheetView: React.FC<SheetViewProps> = React.memo(({
  canvasWidth, canvasHeight, keyboardRange, userActiveKeysRef,
  config, waitingForNote, showFingering, registerDrawCallback, xmlUrl, notes, tempo
}) => {
  // ── Layout: match GameCanvas keyboard formula exactly ─────────────────
  const whiteKeyW  = canvasWidth / keyboardRange.numWhiteKeys;
  const keyboardH  = Math.min(canvasHeight * 0.28, whiteKeyW * 5);
  const sheetH     = canvasHeight - keyboardH;

  const duration = notes && notes.length > 0 
    ? notes[notes.length - 1].startTime + notes[notes.length - 1].duration 
    : 100;

  return (
    <div style={{ position: 'relative', width: canvasWidth, height: canvasHeight, background: '#F8F6F0' }}>
      
      {/* ── OSMD Sheet Music Area ────────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: sheetH,
        overflow: 'hidden',
      }}>
        <OSMDView 
           xmlUrl={xmlUrl} 
           canvasWidth={canvasWidth} 
           canvasHeight={sheetH} 
           registerDrawCallback={registerDrawCallback}
           duration={duration}
           tempo={tempo}
           notes={notes}
           speed={config.speed}
        />
      </div>

      {/* Divider */}
      <div style={{
        position: 'absolute', top: sheetH, left: 0, right: 0,
        height: 2, background: 'rgba(0,0,0,0.12)',
        zIndex: 50
      }} />

      {/* ── Piano keyboard ─────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: sheetH, left: 0, right: 0,
        height: keyboardH,
        background: '#F8F6F0',
        overflow: 'hidden',
      }}>
        {/* Position full-height GameCanvas with bottom anchored to container */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0,
          width: canvasWidth, height: canvasHeight,
        }}>
          <GameCanvas
            registerDrawCallback={registerDrawCallback}
            userActiveKeysRef={userActiveKeysRef}
            config={config}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            waitingForNote={waitingForNote}
            keyboardRange={keyboardRange}
            showFingering={showFingering}
          />
        </div>
      </div>
    </div>
  );
});

SheetView.displayName = 'SheetView';
