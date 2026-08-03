import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { GameCanvas } from './GameCanvas';
import { GameHUD } from './GameHUD';
import { useGameLoop } from '../hooks/useGameLoop';
import { useMidiDevice } from '../hooks/useMidiDevice';
import { useScoring } from '../hooks/useScoring';
import { GameConfig, NoteEvent, ActiveNote, HitResult } from '../types';
import { ParticleSystem } from '../lib/particles';
import { soundEffects } from '../lib/soundEffects';
import { HitFeedback, FeedbackData } from './HitFeedback';
import { EndGameScreen } from './EndGameScreen';
import { ComboMilestone } from './ComboMilestone';
import { getPianoKeyLayout, NUM_WHITE_KEYS } from '../lib/pianoLayout';
import { useMicrophonePitch } from '../hooks/useMicrophonePitch';

// ── Demo Bài Học Nhạc Lý (Các loại nốt nhạc) ─────────────────────────────────
// Tempo: 120 BPM -> 1 phách (Beat) = 0.5 giây
const mockNotes: NoteEvent[] = [
  // Nốt Đen (Quarter note, 1 phách = 0.5s) -> Khối hình vuông cơ bản
  { note: 'C4', midiNumber: 60, startTime: 1.0, duration: 0.5, track: 'right' },
  { note: 'D4', midiNumber: 62, startTime: 1.5, duration: 0.5, track: 'right' },
  
  // Nốt Trắng (Half note, 2 phách = 1.0s) -> Khối chữ nhật dài vừa
  { note: 'E4', midiNumber: 64, startTime: 2.0, duration: 1.0, track: 'right' },
  { note: 'F4', midiNumber: 65, startTime: 3.0, duration: 1.0, track: 'right' },
  
  // Nốt Tròn (Whole note, 4 phách = 2.0s) -> Một khối cực dài
  { note: 'G4', midiNumber: 67, startTime: 4.0, duration: 2.0, track: 'right' },
  
  // Nốt Đơn (Eighth note, 1/2 phách = 0.25s) -> Khối rất ngắn, rơi nhanh
  { note: 'A4', midiNumber: 69, startTime: 6.5, duration: 0.25, track: 'right' },
  { note: 'B4', midiNumber: 71, startTime: 6.75, duration: 0.25, track: 'right' },
  { note: 'C5', midiNumber: 72, startTime: 7.0, duration: 0.25, track: 'right' },
  { note: 'B4', midiNumber: 71, startTime: 7.25, duration: 0.25, track: 'right' },
  
  // Nốt Kép (Sixteenth note, 1/4 phách = 0.125s) -> Khối cực ngắn, từng chùm
  { note: 'A4', midiNumber: 69, startTime: 8.0, duration: 0.125, track: 'right' },
  { note: 'G4', midiNumber: 67, startTime: 8.125, duration: 0.125, track: 'right' },
  { note: 'F4', midiNumber: 65, startTime: 8.25, duration: 0.125, track: 'right' },
  { note: 'E4', midiNumber: 64, startTime: 8.375, duration: 0.125, track: 'right' },
  
  // Kết thúc bằng Nốt Tròn dài 4 phách
  { note: 'C4', midiNumber: 60, startTime: 9.0, duration: 2.0, track: 'left' },
];

/**
 * Computer keyboard → MIDI number mapping (no MIDI device required for testing).
 * Covers the notes used in Twinkle Twinkle and the surrounding octave.
 *
 * Layout (like a piano):
 *   White: A S D F G H J  K  L  → C3 D3 E3 F3 G3 A3 B3 C4 D4
 *   White: Z X C V B N M  ,  .  → C4 D4 E4 F4 G4 A4 B4 C5 D5
 *
 * We use the bottom row (Z…) for the demo notes.
 */
const KEY_TO_MIDI: Record<string, number> = {
  a: 48, // C3
  w: 49, // C#3
  s: 50, // D3
  e: 51, // D#3
  d: 52, // E3
  f: 53, // F3
  t: 54, // F#3
  g: 55, // G3
  y: 56, // G#3
  h: 57, // A3
  u: 58, // A#3
  j: 59, // B3
  k: 60, // C4  ← Twinkle note
  o: 61, // C#4
  l: 62, // D4  ← Twinkle note
  p: 63, // D#4
  ';': 64, // E4  ← Twinkle note
  "'": 65, // F4  ← Twinkle note
  z: 67,  // G4  ← Twinkle note (mapped to Z for comfort)
  x: 69,  // A4  ← Twinkle note
  c: 71,  // B4
  v: 72,  // C5
};

export const GameScreen: React.FC = () => {
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hasStarted, setHasStarted] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FeedbackData[]>([]);
  const [showEndGame, setShowEndGame] = useState(false);
  const [waitModeEnabled, setWaitModeEnabled] = useState(true);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);

  const effectsCanvasRef = useRef<HTMLCanvasElement>(null);
  const particleSystem = useRef<ParticleSystem | null>(null);
  const [gameStats, setGameStats] = useState({
    hitNotes: 0,
    totalNotes: mockNotes.length,
    maxCombo: 0,
  });

  // ── Responsive canvas size ──────────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Particle effects canvas ─────────────────────────────────────────────────
  useEffect(() => {
    if (hasStarted && effectsCanvasRef.current) {
      const ctx = effectsCanvasRef.current.getContext('2d');
      if (ctx) {
        particleSystem.current = new ParticleSystem(ctx);
        let id: number;
        const loop = () => {
          ctx.clearRect(0, 0, dimensions.width, dimensions.height);
          particleSystem.current?.update();
          id = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(id);
      }
    }
  }, [hasStarted, dimensions]);

  // ── Game config ─────────────────────────────────────────────────────────────
  const config = useMemo<GameConfig>(
    () => {
      // Tính toán FallSpeed để đảm bảo Nốt Đen (0.5s) hiển thị thành "Khối hình vuông cơ bản"
      const noteWidth = (dimensions.width / NUM_WHITE_KEYS) * 0.8;
      // height = duration * fallSpeed => fallSpeed = height / duration = noteWidth / 0.5
      const fallSpeed = noteWidth * 2; 
      
      const keyHeight = Math.min(dimensions.height * 0.3, (dimensions.width / NUM_WHITE_KEYS) * 5);
      const hitZoneY = dimensions.height - keyHeight;
      const lookAheadTime = hitZoneY / fallSpeed; // Thời gian từ đỉnh màn hình xuống hit zone
      
      return {
        fallSpeed,
        lookAheadTime,
        hitWindowMs: 250, // Nới lỏng một chút cho trẻ em
        waitMode: waitModeEnabled,
        autoPlay: autoPlayEnabled,
      };
    },
    [dimensions.width, dimensions.height, waitModeEnabled, autoPlayEnabled]
  );

  const { score, combo, stars, addHit, addMiss, calculateHit } = useScoring();

  // ── Combo milestones ────────────────────────────────────────────────────────
  useEffect(() => {
    setGameStats(prev => ({ ...prev, maxCombo: Math.max(prev.maxCombo, combo) }));
    if ([5, 10, 20, 50].includes(combo)) {
      soundEffects.playComboMilestone(combo);
    }
  }, [combo]);

  // ── Hit / Miss handlers (now receive note as first arg) ────────────────────
  const handleHit = useCallback(
    (note: ActiveNote, result: HitResult) => {
      if (!config.autoPlay) {
        addHit(note, result);
        setGameStats(prev => ({ ...prev, hitNotes: prev.hitNotes + 1 }));
      }

      const layout = getPianoKeyLayout(note.midiNumber, dimensions.width);
      const x = layout ? layout.centerX : dimensions.width / 2;
      const keyHeight = Math.min(dimensions.height * 0.3, (dimensions.width / NUM_WHITE_KEYS) * 5);
      const y = dimensions.height - keyHeight;

      if (config.autoPlay) {
        soundEffects.playPianoNote(note.midiNumber);
      }

      particleSystem.current?.emitHit(x, y, result as 'perfect' | 'good');

      if (!config.autoPlay) {
        const id = crypto.randomUUID();
        setFeedbacks(prev => [...prev, { id, x, y, result, timestamp: Date.now() }]);
        setTimeout(() => setFeedbacks(prev => prev.filter(f => f.id !== id)), 800);
      }
    },
    [addHit, dimensions, config.autoPlay]
  );

  const handleMiss = useCallback(
    (note: ActiveNote) => {
      addMiss(note);
      const layout = getPianoKeyLayout(note.midiNumber, dimensions.width);
      const x = layout ? layout.centerX : dimensions.width / 2;
      const keyHeight = Math.min(dimensions.height * 0.3, (dimensions.width / NUM_WHITE_KEYS) * 5);
      const y = dimensions.height - keyHeight;

      soundEffects.playMiss();
      particleSystem.current?.emitMiss(x, y);

      const id = crypto.randomUUID();
      setFeedbacks(prev => [...prev, { id, x, y, result: 'miss', timestamp: Date.now() }]);
      setTimeout(() => setFeedbacks(prev => prev.filter(f => f.id !== id)), 800);
    },
    [addMiss, dimensions]
  );

  // ── Game loop ───────────────────────────────────────────────────────────────
  const {
    gameState,
    activeNotes,
    waitingForNote,
    startGame,
    pauseGame,
    resumeGame,
    stopGame,
    processNoteHit,
    processNoteOff,
  } = useGameLoop(handleHit, handleMiss);

  // ── MIDI device ─────────────────────────────────────────────────────────────
  const { isConnected, error: midiError } = useMidiDevice(
    e => {
      if (hasStarted && !showEndGame) {
        soundEffects.playPianoNote(e.midiNumber);
        processNoteHit(e.midiNumber, config.hitWindowMs, calculateHit);
      }
    },
    e => {
      if (hasStarted && !showEndGame) {
        processNoteOff(e.midiNumber);
      }
    }
  );

  // ── Microphone Pitch Detection ──────────────────────────────────────────────
  const handlePitchDetected = useCallback((midiNumber: number) => {
    if (hasStarted && !showEndGame) {
      // Don't play the sound for microphone since the acoustic piano is already making sound!
      processNoteHit(midiNumber, config.hitWindowMs, calculateHit);
    }
  }, [hasStarted, showEndGame, processNoteHit, config.hitWindowMs, calculateHit]);

  const { isEnabled: isMicEnabled, error: micError, toggleMicrophone } = useMicrophonePitch(
    handlePitchDetected, 
    hasStarted && !showEndGame
  );

  // ── Computer keyboard fallback ──────────────────────────────────────────────
  useEffect(() => {
    if (!hasStarted || showEndGame) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // ignore held keys
      const midiNumber = KEY_TO_MIDI[e.key.toLowerCase()];
      if (midiNumber !== undefined) {
        soundEffects.playPianoNote(midiNumber);
        processNoteHit(midiNumber, config.hitWindowMs, calculateHit);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const midiNumber = KEY_TO_MIDI[e.key.toLowerCase()];
      if (midiNumber !== undefined) {
        processNoteOff(midiNumber);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [hasStarted, showEndGame, processNoteHit, processNoteOff, config.hitWindowMs, calculateHit]);

  // ── Start game ──────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    soundEffects.init();
    setHasStarted(true);
    setShowEndGame(false);
    setFeedbacks([]);
    setGameStats({ hitNotes: 0, totalNotes: mockNotes.length, maxCombo: 0 });
    startGame(mockNotes, config);
  }, [startGame, config]);

  // ── End-game detection ──────────────────────────────────────────────────────
  // Trigger when audio clock passes the last note's end time
  const lastNote = mockNotes[mockNotes.length - 1];
  useEffect(() => {
    if (!hasStarted || showEndGame) return;
    if (gameState.currentTime > lastNote.startTime + lastNote.duration + 1.5) {
      setShowEndGame(true);
      particleSystem.current?.emitVictory(dimensions.width, dimensions.height);
      soundEffects.playVictory();
    }
  }, [gameState.currentTime, hasStarted, showEndGame, lastNote, dimensions]);

  const isPaused = gameState.isPaused || waitingForNote !== null;

  return (
    <div className="game-screen" style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      {!hasStarted ? (
        // ── Start screen ───────────────────────────────────────────────────────
        <div className="start-screen glass">
          <h1>🎹 KidsPiano</h1>
          <p style={{ marginBottom: 8, opacity: 0.8 }}>Learn Piano With Fun!</p>

          {/* Wait Mode toggle */}
          <div style={{ margin: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, opacity: 0.9 }}>⏸ Wait Mode</span>
            <button
              onClick={() => setWaitModeEnabled(v => !v)}
              style={{
                padding: '6px 18px',
                borderRadius: 20,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Fredoka One, sans-serif',
                fontSize: 15,
                background: waitModeEnabled
                  ? 'linear-gradient(135deg,#FFD700,#FFA500)'
                  : 'rgba(255,255,255,0.15)',
                color: waitModeEnabled ? '#000' : '#fff',
                transition: 'all 0.3s',
              }}
            >
              {waitModeEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Auto-Play Mode toggle */}
          <div style={{ margin: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, opacity: 0.9 }}>🎧 Nghe Thử (Auto-Play)</span>
            <button
              onClick={() => setAutoPlayEnabled(v => !v)}
              style={{
                padding: '6px 18px',
                borderRadius: 20,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Fredoka One, sans-serif',
                fontSize: 15,
                background: autoPlayEnabled
                  ? 'linear-gradient(135deg,#FF416C,#FF4B2B)'
                  : 'rgba(255,255,255,0.15)',
                color: autoPlayEnabled ? '#fff' : '#fff',
                transition: 'all 0.3s',
              }}
            >
              {autoPlayEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Microphone toggle */}
          <div style={{ margin: '8px 0 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, opacity: 0.9 }}>🎙️ Mic Piano Cơ</span>
            <button
              onClick={toggleMicrophone}
              style={{
                padding: '6px 18px',
                borderRadius: 20,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Fredoka One, sans-serif',
                fontSize: 15,
                background: isMicEnabled
                  ? 'linear-gradient(135deg,#00C9FF,#92FE9D)'
                  : 'rgba(255,255,255,0.15)',
                color: isMicEnabled ? '#000' : '#fff',
                transition: 'all 0.3s',
              }}
            >
              {isMicEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          {micError && <p style={{ color: '#ff6b6b', fontSize: 14, marginBottom: 12 }}>{micError}</p>}

          {midiError
            ? <p className="error">{midiError}</p>
            : <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>
                MIDI: {isConnected ? '🟢 Connected' : '🔴 Not connected'}
              </p>
          }

          <p style={{ fontSize: 12, opacity: 0.55, marginBottom: 16 }}>
            No MIDI? Use keyboard: <b>K=C4 · Z=G4 · X=A4 · L=D4 · ;=E4 · '=F4</b>
          </p>

          <button className="start-btn" onClick={handleStart}>
            ▶ START GAME
          </button>
        </div>
      ) : (
        <>
          {/* Game Canvas */}
          <GameCanvas
            activeNotes={activeNotes}
            config={config}
            canvasWidth={dimensions.width}
            canvasHeight={dimensions.height}
            waitingForNote={waitingForNote}
          />

          {/* Particle effects overlay */}
          <canvas
            ref={effectsCanvasRef}
            width={dimensions.width}
            height={dimensions.height}
            style={{
              position: 'absolute', top: 0, left: 0,
              pointerEvents: 'none', zIndex: 20,
            }}
          />

          {/* HUD */}
          <GameHUD
            score={score}
            combo={combo}
            stars={stars}
            waitMode={config.waitMode}
            onPause={isPaused ? resumeGame : pauseGame}
          />

          {/* Hit feedback floating text */}
          <HitFeedback feedbacks={feedbacks} />

          {/* Combo milestone banner */}
          <ComboMilestone combo={combo} />

          {/* End game screen */}
          {showEndGame && (
            <EndGameScreen
              score={score}
              stars={stars}
              accuracy={gameStats.totalNotes > 0
                ? (gameStats.hitNotes / gameStats.totalNotes) * 100
                : 0}
              totalNotes={gameStats.totalNotes}
              hitNotes={gameStats.hitNotes}
              combo={gameStats.maxCombo}
              lessonTitle="Twinkle Twinkle Little Star"
              onReplay={handleStart}
              onNextLesson={() => {}}
              onHome={() => { stopGame(); setHasStarted(false); }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default GameScreen;
