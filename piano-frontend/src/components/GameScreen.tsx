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
import { calcOptimalOctaves, getPianoKeyLayout, buildKeyboardRange, DEFAULT_RANGE, KEY_TO_MIDI, NUM_WHITE_KEYS, KeyboardRange } from '../lib/pianoLayout';
import { useMicrophonePitch } from '../hooks/useMicrophonePitch';

// ── Chord name detection ─────────────────────────────────────────────────────
const NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function getChordName(midiNumbers: number[]): string {
  if (midiNumbers.length === 0) return '';
  const sorted = [...midiNumbers].sort((a, b) => a - b);
  const root = sorted[0] % 12;
  const rootName = NOTE_NAMES_SHARP[root];
  if (sorted.length === 1) return rootName;
  const intervals = sorted.slice(1).map(n => (n - sorted[0]) % 12);
  const hasMinor3rd = intervals.includes(3);
  const hasMajor3rd = intervals.includes(4);
  const has5th = intervals.includes(7);
  const hasDim5 = intervals.includes(6);
  if (hasMajor3rd && has5th) return rootName;
  if (hasMinor3rd && has5th) return rootName + 'm';
  if (hasMinor3rd && hasDim5) return rootName + 'dim';
  if (hasMajor3rd) return rootName;
  if (hasMinor3rd) return rootName + 'm';
  return rootName + '5';
}



interface GameScreenProps {
  lesson: import('../types').Lesson;
  onBack: () => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({ lesson, onBack }) => {
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hasStarted, setHasStarted] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FeedbackData[]>([]);
  const [showEndGame, setShowEndGame] = useState(false);
  const [waitModeEnabled, setWaitModeEnabled] = useState(true);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [chordMode, setChordMode] = useState<'simple' | 'full' | 'arpeggio'>('simple');
  const [countdownValue, setCountdownValue] = useState<number | null>(null);

  const effectsCanvasRef = useRef<HTMLCanvasElement>(null);
  const particleSystem = useRef<ParticleSystem | null>(null);
  const [loadedNotes, setLoadedNotes] = useState<NoteEvent[]>([]);
  const [timeSignature, setTimeSignature] = useState<string>('4/4');
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [gameStats, setGameStats] = useState({ hitNotes: 0, totalNotes: 0, maxCombo: 0 });

  const chordTimelineRef = useRef<{time: number; name: string}[]>([]);
  const [currentChordName, setCurrentChordName] = useState<string>('');
  const lastNoteEndTimeRef = useRef<number>(0);
  const [userActiveKeys, setUserActiveKeys] = useState<Set<number>>(new Set());
  const [keyboardRange, setKeyboardRange] = useState<KeyboardRange>(DEFAULT_RANGE);
  const [numOctaves, setNumOctaves] = useState<number>(5); // sẽ được tính lại sau khi load notes

  // Giải phóng AudioBuffer khi rời khỏi bài
  useEffect(() => {
    return () => { soundEffects.dispose(); };
  }, []);


  useEffect(() => {
    const fetchNotes = async () => {
      try {
        setLoadingNotes(true);
        const res = await fetch(lesson.midiJsonUrl);
        if (!res.ok) throw new Error('Failed to fetch lesson notes');
        const data = await res.json();
        setLoadedNotes(data.notes || []);
        setTimeSignature(data.timeSignature || '4/4');
      } catch (err: any) {
        setNotesError(err.message);
      } finally {
        setLoadingNotes(false);
      }
    };
    fetchNotes();
  }, [lesson.midiJsonUrl]);


  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Tự động tính số quãng tối ưu khi biết màn hình + bài hát ───────────────
  useEffect(() => {
    if (loadedNotes.length === 0) return;
    const allMidi = loadedNotes.map(n => n.midiNumber);
    const songMin = Math.min(...allMidi);
    const songMax = Math.max(...allMidi);
    const optimal = calcOptimalOctaves(dimensions.width, 42);
    const range = buildKeyboardRange(songMin, songMax, optimal);
    setNumOctaves(optimal);
    setKeyboardRange(range);
  }, [loadedNotes, dimensions.width]);



  // Khởi động Tone.js ngay khi user chạm/click lần đầu (trình duyệt yêu cầu gesture)
  useEffect(() => {
    const handleFirstGesture = () => {
      soundEffects.init();
      window.removeEventListener('mousedown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
    window.addEventListener('mousedown', handleFirstGesture);
    window.addEventListener('touchstart', handleFirstGesture);
    window.addEventListener('keydown', handleFirstGesture);
    return () => {
      window.removeEventListener('mousedown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, []);

  useEffect(() => {
    if (hasStarted && effectsCanvasRef.current) {
      const canvas = effectsCanvasRef.current;
      const ctx = canvas.getContext('2d');
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

  const config = useMemo<GameConfig>(() => {
    const noteWidth = (dimensions.width / NUM_WHITE_KEYS) * 0.8;
    const fallSpeed = Math.max(noteWidth * 4, 200) * speed; // nhanh hơn, tối thiểu 200px/s
    const keyHeight = Math.min(dimensions.height * 0.3, (dimensions.width / NUM_WHITE_KEYS) * 5);
    const hitZoneY = dimensions.height - keyHeight;
    const lookAheadTime = Math.min(hitZoneY / fallSpeed, 3.0); // tối đa 3 giây nhìn trước
    return { fallSpeed, lookAheadTime, hitWindowMs: 250, waitMode: waitModeEnabled, autoPlay: autoPlayEnabled };
  }, [dimensions, waitModeEnabled, autoPlayEnabled, speed]);


  const { score, combo, stars, addHit, addMiss, calculateHit } = useScoring();

  useEffect(() => {
    setGameStats(prev => ({ ...prev, maxCombo: Math.max(prev.maxCombo, combo) }));
    if ([5, 10, 20, 50].includes(combo)) soundEffects.playComboMilestone(combo);
  }, [combo]);

  const handleHit = useCallback((note: ActiveNote, result: HitResult) => {
    if (!config.autoPlay) {
      addHit(note, result);
      setGameStats(prev => ({ ...prev, hitNotes: prev.hitNotes + 1 }));
    }
    const layout = getPianoKeyLayout(note.midiNumber, dimensions.width);
    const x = layout ? layout.centerX : dimensions.width / 2;
    const keyHeight = Math.min(dimensions.height * 0.3, (dimensions.width / NUM_WHITE_KEYS) * 5);
    const y = dimensions.height - keyHeight;
    if (config.autoPlay) soundEffects.playPianoNote(note.midiNumber);
    // particleSystem.current?.emitHit(x, y, result as 'perfect' | 'good');
    if (!config.autoPlay) {
      const id = crypto.randomUUID();
      setFeedbacks(prev => [...prev, { id, x, y, result, timestamp: Date.now() }]);
      setTimeout(() => setFeedbacks(prev => prev.filter(f => f.id !== id)), 800);
    }
  }, [addHit, dimensions, config.autoPlay]);

  const handleMiss = useCallback((note: ActiveNote) => {
    addMiss(note);
    const layout = getPianoKeyLayout(note.midiNumber, dimensions.width);
    const x = layout ? layout.centerX : dimensions.width / 2;
    const keyHeight = Math.min(dimensions.height * 0.3, (dimensions.width / NUM_WHITE_KEYS) * 5);
    const y = dimensions.height - keyHeight;
    soundEffects.playMiss();
    // particleSystem.current?.emitMiss(x, y);
    const id = crypto.randomUUID();
    setFeedbacks(prev => [...prev, { id, x, y, result: 'miss', timestamp: Date.now() }]);
    setTimeout(() => setFeedbacks(prev => prev.filter(f => f.id !== id)), 800);
  }, [addMiss, dimensions]);

  const { gameState, activeNotes, waitingForNote, startGame, pauseGame, resumeGame, stopGame, processNoteHit, processNoteOff } = useGameLoop(handleHit, handleMiss);

  const { isConnected, error: midiError } = useMidiDevice(
    e => {
      setUserActiveKeys(prev => { const n = new Set(prev); n.add(e.midiNumber); return n; });
      soundEffects.playPianoNote(e.midiNumber);
      if (hasStarted && !showEndGame) {
        processNoteHit(e.midiNumber, config.hitWindowMs, calculateHit);
      }
    },
    e => {
      setUserActiveKeys(prev => { const n = new Set(prev); n.delete(e.midiNumber); return n; });
      if (hasStarted && !showEndGame) processNoteOff(e.midiNumber);
    }
  );

  const handlePitchDetected = useCallback((midiNumber: number) => {
    if (hasStarted && !showEndGame) processNoteHit(midiNumber, config.hitWindowMs, calculateHit);
  }, [hasStarted, showEndGame, processNoteHit, config.hitWindowMs, calculateHit]);

  const { isEnabled: isMicEnabled, error: micError, toggleMicrophone } = useMicrophonePitch(handlePitchDetected, hasStarted && !showEndGame);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const midiNumber = KEY_TO_MIDI[e.key.toLowerCase()];
      if (midiNumber !== undefined) {
        setUserActiveKeys(prev => { const n = new Set(prev); n.add(midiNumber); return n; });
        soundEffects.playPianoNote(midiNumber);
        if (hasStarted && !showEndGame) {
          processNoteHit(midiNumber, config.hitWindowMs, calculateHit);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const midiNumber = KEY_TO_MIDI[e.key.toLowerCase()];
      if (midiNumber !== undefined) {
        setUserActiveKeys(prev => { const n = new Set(prev); n.delete(midiNumber); return n; });
        if (hasStarted && !showEndGame) {
          processNoteOff(midiNumber);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [hasStarted, showEndGame, processNoteHit, processNoteOff, config.hitWindowMs, calculateHit]);

  const handleStart = useCallback(() => {
    if (loadedNotes.length === 0) return;
    soundEffects.init();
    
    let processedNotes = [...loadedNotes];

    // ── Auto-transpose tay trái nếu quá trầm so với giai điệu ──────────────
    // Tính tầm giai điệu tay phải
    const rightNotesMidi = loadedNotes.filter(n => n.track === 'right').map(n => n.midiNumber);
    if (rightNotesMidi.length > 0) {
      const melodyMin = Math.min(...rightNotesMidi);
      // Tay trái lý tưởng: từ (melodyMin - 12) đến (melodyMin - 1)
      const idealBassMax = melodyMin - 1;
      const idealBassMin = melodyMin - 13;

      processedNotes = processedNotes.map(n => {
        if (n.track !== 'left') return n;
        let midi = n.midiNumber;
        // Shift lên cho đến khi nằm trong vùng lý tưởng
        while (midi < idealBassMin && midi + 12 <= idealBassMax) midi += 12;
        // Shift xuống nếu vô tình vượt lên quá cao
        while (midi > idealBassMax && midi - 12 >= idealBassMin) midi -= 12;
        if (midi === n.midiNumber) return n;
        return {
          ...n,
          midiNumber: midi,
          note: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12] + Math.floor(midi / 12 - 1),
        };
      });
    }

    if (chordMode === 'arpeggio') {
      const leftNotes = loadedNotes.filter(n => n.track === 'left');
      const rightNotes = loadedNotes.filter(n => n.track === 'right');
      const startTimes = Array.from(new Set(leftNotes.map(n => n.startTime))).sort((a, b) => a - b);
      const newLeftNotes: NoteEvent[] = [];
      startTimes.forEach(t => {
        const chord = leftNotes.filter(n => n.startTime === t).sort((a, b) => a.midiNumber - b.midiNumber);
        const root  = chord[0];
        const third = chord[1] ?? chord[0];
        const fifth = chord[2] ?? chord[1] ?? chord[0];
        const totalDuration = root.duration;
        const ts = timeSignature;

        if (ts === '2/4') {
          const step = totalDuration / 2;
          newLeftNotes.push({ ...root,  startTime: t,          duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step,   duration: step });
        } else if (ts === '3/4') {
          const step = totalDuration / 3;
          newLeftNotes.push({ ...root,  startTime: t,            duration: step });
          newLeftNotes.push({ ...third, startTime: t + step,     duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step * 2, duration: step });
        } else if (ts === '6/8') {
          const step = totalDuration / 6;
          newLeftNotes.push({ ...root,  startTime: t,            duration: step });
          newLeftNotes.push({ ...third, startTime: t + step,     duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step * 2, duration: step });
          newLeftNotes.push({ ...root,  startTime: t + step * 3, duration: step });
          newLeftNotes.push({ ...third, startTime: t + step * 4, duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step * 5, duration: step });
        } else {
          const step = totalDuration / 4;
          newLeftNotes.push({ ...root,  startTime: t,            duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step,     duration: step });
          newLeftNotes.push({ ...third, startTime: t + step * 2, duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step * 3, duration: step });
        }
      });
      processedNotes = [...rightNotes, ...newLeftNotes];
    }

    {
      const leftNotes = loadedNotes.filter(n => n.track === 'left');
      const startTimes = Array.from(new Set(leftNotes.map(n => n.startTime))).sort((a,b)=>a-b);
      chordTimelineRef.current = startTimes.map(t => {
        const chord = leftNotes.filter(n => n.startTime === t);
        const name = getChordName(chord.map(n => n.midiNumber));
        return { time: t / speed + 3, name };
      });
    }
    
    const finalNotes = processedNotes
      .filter(note => {
        if (note.track === 'left' && chordMode === 'simple' && note.role === 'chord_tone') return false;
        return true;
      })
      .map(note => ({
        ...note,
        startTime: (note.startTime / speed) + 3,
        duration: note.duration / speed,
      }));

    setHasStarted(true);
    setShowEndGame(false);
    setFeedbacks([]);
    setGameStats({ hitNotes: 0, totalNotes: finalNotes.length, maxCombo: 0 });
    setCountdownValue(3);

    if (finalNotes.length > 0) {
      const last = finalNotes.reduce((a, b) => (a.startTime + a.duration > b.startTime + b.duration) ? a : b);
      lastNoteEndTimeRef.current = last.startTime + last.duration;
    }

    startGame(finalNotes, config);
  }, [loadedNotes, chordMode, speed, config, startGame, timeSignature]);

  useEffect(() => {
    if (countdownValue === null) return;
    if (countdownValue > 0) {
      const timer = setTimeout(() => setCountdownValue(countdownValue - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setCountdownValue(null), 500);
      return () => clearTimeout(timer);
    }
  }, [countdownValue]);

  useEffect(() => {
    if (!hasStarted || showEndGame) return;
    const endTime = lastNoteEndTimeRef.current;
    if (endTime > 0 && gameState.currentTime > endTime + 1.5) {
      setShowEndGame(true);
      particleSystem.current?.emitVictory(dimensions.width, dimensions.height);
      soundEffects.playVictory();
    }
  }, [gameState.currentTime, hasStarted, showEndGame, dimensions]);

  useEffect(() => {
    if (!hasStarted) return;
    const t = gameState.currentTime;
    const timeline = chordTimelineRef.current;
    if (timeline.length === 0) return;
    let found = '';
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (t >= timeline[i].time) {
        found = timeline[i].name;
        break;
      }
    }
    setCurrentChordName(found);
  }, [gameState.currentTime, hasStarted]);

  const isPaused = gameState.isPaused || waitingForNote !== null;

  return (
    <div className="game-screen" style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      {!hasStarted ? (
        <div className="start-screen glass">
          <button onClick={onBack} style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '12px', padding: '10px 16px', color: '#fff', cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
            ← Back to Lessons
          </button>
          <h1 style={{ fontFamily: 'Nunito, sans-serif' }}>🎹 {lesson.title}</h1>
          <p style={{ marginBottom: 8, opacity: 0.8 }}>Level {lesson.level} • {lesson.tempo} BPM</p>

          <div style={{ margin: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, opacity: 0.9 }}>⏸ Wait Mode</span>
            <button onClick={() => setWaitModeEnabled(v => !v)} style={{ padding: '6px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 15, background: waitModeEnabled ? 'linear-gradient(135deg,#FFD700,#FFA500)' : 'rgba(255,255,255,0.15)', color: '#fff' }}>
              {waitModeEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          
          <div style={{ margin: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, opacity: 0.9 }}>🤖 Auto Play</span>
            <button onClick={() => setAutoPlayEnabled(v => !v)} style={{ padding: '6px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 15, background: autoPlayEnabled ? 'linear-gradient(135deg,#FF416C,#FF4B2B)' : 'rgba(255,255,255,0.15)', color: '#fff' }}>
              {autoPlayEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div style={{ margin: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, opacity: 0.9 }}>🚀 Speed</span>
            {[0.5, 0.75, 1, 1.25].map(val => (
              <button key={val} onClick={() => setSpeed(val)} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 14, background: speed === val ? 'linear-gradient(135deg,#00C9FF,#92FE9D)' : 'rgba(255,255,255,0.15)', color: speed === val ? '#000' : '#fff' }}>
                {val}x
              </button>
            ))}
          </div>

          <div style={{ margin: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, opacity: 0.9 }}>🎸 Hợp âm (Trái)</span>
            <button onClick={() => setChordMode('simple')} style={{ padding: '6px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 15, background: chordMode === 'simple' ? 'linear-gradient(135deg,#11998e,#38ef7d)' : 'rgba(255,255,255,0.15)', color: '#fff' }}>
              Đơn giản (Bass)
            </button>
            <button onClick={() => setChordMode('full')} style={{ padding: '6px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 15, background: chordMode === 'full' ? 'linear-gradient(135deg,#11998e,#38ef7d)' : 'rgba(255,255,255,0.15)', color: '#fff' }}>
              Đầy đủ (Chord)
            </button>
            <button onClick={() => setChordMode('arpeggio')} style={{ padding: '6px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 15, background: chordMode === 'arpeggio' ? 'linear-gradient(135deg,#11998e,#38ef7d)' : 'rgba(255,255,255,0.15)', color: '#fff' }}>
              Rải (Arpeggio)
            </button>
          </div>

          {/* ── Số quãng bàn phím ─────────────────────────────── */}
          <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, opacity: 0.9 }}>🎹 Số quãng</span>
            <button
              onClick={() => { const n = Math.max(2, numOctaves - 1); setNumOctaves(n); const allMidi = loadedNotes.map(x => x.midiNumber); setKeyboardRange(buildKeyboardRange(Math.min(...allMidi), Math.max(...allMidi), n)); }}
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
              -
            </button>
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: '#FFD700' }}>{numOctaves}</span>
              <div style={{ fontSize: 11, opacity: 0.7 }}>quãng • {numOctaves * 7 + 1} phím trắng</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>{Math.round(dimensions.width / (numOctaves * 7 + 1))}px/phím
                {dimensions.width / (numOctaves * 7 + 1) >= 44 ? ' ✅' : dimensions.width / (numOctaves * 7 + 1) >= 32 ? ' ⚠️' : ' ❌'}
              </div>
            </div>
            <button
              onClick={() => { const n = Math.min(5, numOctaves + 1); setNumOctaves(n); const allMidi = loadedNotes.map(x => x.midiNumber); setKeyboardRange(buildKeyboardRange(Math.min(...allMidi), Math.max(...allMidi), n)); }}
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
              +
            </button>
          </div>

          <div style={{ margin: '8px 0 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, opacity: 0.9 }}>🎙️ Mic Piano Cơ</span>
            <button onClick={toggleMicrophone} style={{ padding: '6px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 15, background: isMicEnabled ? 'linear-gradient(135deg,#00C9FF,#92FE9D)' : 'rgba(255,255,255,0.15)', color: isMicEnabled ? '#000' : '#fff' }}>
              {isMicEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          {micError && <p style={{ color: '#ff6b6b', fontSize: 14, marginBottom: 12 }}>{micError}</p>}
          {midiError ? <p className="error">{midiError}</p> : <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>MIDI: {isConnected ? '🟢 Connected' : '🔴 Not connected'}</p>}
          <p style={{ fontSize: 12, opacity: 0.55, marginBottom: 16 }}>No MIDI? Use keyboard: <b>K=C4 · Z=G4 · X=A4 · L=D4 · ;=E4 · '=F4</b></p>
          {loadingNotes ? <p>Loading notes...</p> : notesError ? <p style={{ color: 'red' }}>Error: {notesError}</p> : (
            <button className="start-btn" onClick={handleStart} style={{ fontFamily: 'Nunito, sans-serif' }}>▶ START GAME</button>
          )}
        </div>
      ) : (
        <>
          <GameCanvas activeNotes={activeNotes} userActiveKeys={userActiveKeys} config={config} canvasWidth={dimensions.width} canvasHeight={dimensions.height} waitingForNote={waitingForNote} keyboardRange={keyboardRange} />
          <canvas ref={effectsCanvasRef} width={dimensions.width} height={dimensions.height} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 20 }} />
          <GameHUD score={score} combo={combo} stars={stars} waitMode={config.waitMode} onPause={isPaused ? resumeGame : pauseGame} />
          
          {currentChordName && (
            <div style={{ position: 'absolute', bottom: Math.min(dimensions.height * 0.3, (dimensions.width / NUM_WHITE_KEYS) * 5) + 12, left: 16, zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'Nunito, sans-serif', letterSpacing: 1, textTransform: 'uppercase' }}>Hợp âm</span>
              <div style={{ background: 'linear-gradient(135deg, rgba(86,204,242,0.85), rgba(30,87,153,0.85))', backdropFilter: 'blur(8px)', border: '1.5px solid rgba(255,255,255,0.25)', borderRadius: 16, padding: '6px 20px', fontFamily: 'Nunito, sans-serif', fontSize: Math.min(36, dimensions.width * 0.045), color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.4)', boxShadow: '0 4px 16px rgba(86,204,242,0.35)', transition: 'all 0.2s ease', minWidth: 60, textAlign: 'center' }}>
                {currentChordName}
              </div>
            </div>
          )}

          {countdownValue !== null && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }}>
              <h1 style={{ fontSize: 120, color: '#fff', fontFamily: 'Nunito, sans-serif', textShadow: '0 4px 20px rgba(0,0,0,0.5)', animation: 'popIn 0.3s ease-out' }}>
                {countdownValue > 0 ? countdownValue : 'GO!'}
              </h1>
            </div>
          )}
          <HitFeedback feedbacks={feedbacks} />
          <ComboMilestone combo={combo} />
          {showEndGame && (
            <EndGameScreen score={score} stars={stars} accuracy={gameStats.totalNotes > 0 ? (gameStats.hitNotes / gameStats.totalNotes) * 100 : 0} totalNotes={gameStats.totalNotes} hitNotes={gameStats.hitNotes} combo={gameStats.maxCombo} lessonTitle={lesson.title} onReplay={handleStart} onNextLesson={() => {}} onHome={() => { stopGame(); setHasStarted(false); onBack(); }} />
          )}
        </>
      )}
    </div>
  );
};
export default GameScreen;
