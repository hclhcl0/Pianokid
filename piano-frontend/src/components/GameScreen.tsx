import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { GameCanvas } from './GameCanvas';
import { GameHUD } from './GameHUD';
import { SheetView } from './SheetView';
import { VexFlowView } from './VexFlowView';
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
  allLessons: import('../types').Lesson[];
  onSelectLesson: (lesson: import('../types').Lesson) => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({ lesson, allLessons, onSelectLesson }) => {
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hasStarted, setHasStarted] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FeedbackData[]>([]);
  const [showEndGame, setShowEndGame] = useState(false);
  const [waitModeEnabled, setWaitModeEnabled] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [chordMode, setChordMode] = useState<'simple' | 'full' | 'arpeggio'>('simple');
  const [viewMode, setViewMode] = useState<'falling' | 'sheet'>('sheet');
  const [sheetMusicEngine, setSheetMusicEngine] = useState<'osmd' | 'vexflow'>('osmd');
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  // Mic pipeline latency compensation (ADC buffer ~93ms + stability buffer ~67ms = 160ms default)
  const [micLatencyMs, setMicLatencyMs] = useState<number>(160);

  const effectsCanvasRef = useRef<HTMLCanvasElement>(null);
  const particleSystem = useRef<ParticleSystem | null>(null);
  const [loadedNotes, setLoadedNotes] = useState<NoteEvent[]>([]);
  const [timeSignature, setTimeSignature] = useState<string>('4/4');
  const [songTempo, setSongTempo] = useState<number>(lesson.tempo);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [gameStats, setGameStats] = useState({ hitNotes: 0, totalNotes: 0, maxCombo: 0 });

  const chordTimelineRef = useRef<{time: number; name: string}[]>([]);
  const [currentChordName, setCurrentChordName] = useState<string>('');
  const lastNoteEndTimeRef = useRef<number>(0);
  const [userActiveKeys, setUserActiveKeys] = useState<Set<number>>(new Set());
  const userActiveKeysRef = useRef<Set<number>>(new Set());
  const [micVolume, setMicVolume] = useState<number>(0);

  // Keep ref in sync for state changes from other sources if any, but we update synchronously in handlers
  useEffect(() => {
    userActiveKeysRef.current = userActiveKeys;
  }, [userActiveKeys]);
  
  const [keyboardRange, setKeyboardRange] = useState<KeyboardRange>(DEFAULT_RANGE);
  const [numOctaves, setNumOctaves] = useState<number>(5); // sẽ được tính lại sau khi load notes
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Giải phóng AudioBuffer khi rời khỏi bài
  useEffect(() => {
    return () => { soundEffects.dispose(); };
  }, []);


  useEffect(() => {
    const CACHE_KEY = `kidspiano_notes_${lesson.midiJsonUrl}`;
    const fetchNotes = async () => {
      try {
        setLoadingNotes(true);

        // ── 1. Try localStorage cache first (works offline / weak network) ──
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const data = JSON.parse(cached);
            setLoadedNotes(data.notes || []);
            setTimeSignature(data.timeSignature || '4/4');
            if (data.tempo) setSongTempo(data.tempo);
            setLoadingNotes(false);
            // Still try to refresh in background (don't block UI)
            fetch(lesson.midiJsonUrl).then(r => r.ok ? r.json() : null).then(data => {
              if (data) localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            }).catch(() => {/* silent — cache is already loaded */});
            return;
          } catch { /* corrupt cache — fall through to network */ }
        }

        // ── 2. No cache: fetch from network ─────────────────────────────────
        const res = await fetch(lesson.midiJsonUrl);
        if (!res.ok) throw new Error('Không tải được bài học. Kiểm tra kết nối mạng.');
        const data = await res.json();
        setLoadedNotes(data.notes || []);
        setTimeSignature(data.timeSignature || '4/4');
        if (data.tempo) setSongTempo(data.tempo);

        // Save to cache for offline use
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* quota exceeded */ }
      } catch (err: any) {
        // If network fails but cache exists, try one more time from cache
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const data = JSON.parse(cached);
            setLoadedNotes(data.notes || []);
            setTimeSignature(data.timeSignature || '4/4');
            if (data.tempo) setSongTempo(data.tempo);
            return; // recovered from cache
          } catch { /* fall through to error */ }
        }
        setNotesError(err.message);
      } finally {
        setLoadingNotes(false);
      }
    };
    fetchNotes();
  }, [lesson.midiJsonUrl, lesson.tempo]);



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
    const numWhite = keyboardRange.numWhiteKeys || 14;
    const noteWidth = (dimensions.width / numWhite) * 0.8;
    const fallSpeed = Math.max(noteWidth * 4, 200) * speed;
    const keyHeight = Math.min(dimensions.height * 0.3, (dimensions.width / numWhite) * 5);
    const hitZoneY = dimensions.height - keyHeight;
    const lookAheadTime = Math.min(hitZoneY / fallSpeed, 3.0);
    return { fallSpeed, lookAheadTime, hitWindowMs: 500, waitMode: waitModeEnabled, autoPlay: autoPlayEnabled, sheetMusicEngine, speed, micLatencyMs };
  }, [dimensions, waitModeEnabled, autoPlayEnabled, speed, sheetMusicEngine, keyboardRange, micLatencyMs]);


  const { score, combo, stars, addHit, addMiss, breakCombo, calculateHit } = useScoring();

  useEffect(() => {
    setGameStats(prev => ({ ...prev, maxCombo: Math.max(prev.maxCombo, combo) }));
    if ([5, 10, 20, 50].includes(combo)) soundEffects.playComboMilestone(combo);
  }, [combo]);

  const handleHit = useCallback((note: ActiveNote, result: HitResult) => {
    if (!config.autoPlay) {
      addHit(note, result);
      setGameStats(prev => ({ ...prev, hitNotes: prev.hitNotes + 1 }));
    }
    const layout = getPianoKeyLayout(note.midiNumber, dimensions.width, keyboardRange);
    const x = layout ? layout.centerX : dimensions.width / 2;
    const numWhite = keyboardRange.numWhiteKeys || 14;
    const keyHeight = Math.min(dimensions.height * 0.3, (dimensions.width / numWhite) * 5);
    const y = dimensions.height - keyHeight;
    if (config.autoPlay && !isMuted) soundEffects.playPianoNote(note.midiNumber);
    // particleSystem.current?.emitHit(x, y, result as 'perfect' | 'good');
    if (!config.autoPlay) {
      const id = crypto.randomUUID();
      setFeedbacks(prev => [...prev, { id, x, y, result, timestamp: Date.now() }]);
      setTimeout(() => setFeedbacks(prev => prev.filter(f => f.id !== id)), 800);
    }
  }, [addHit, dimensions, config.autoPlay, keyboardRange]);

  const handleMiss = useCallback((note: ActiveNote) => {
    addMiss(note);
    const layout = getPianoKeyLayout(note.midiNumber, dimensions.width, keyboardRange);
    const x = layout ? layout.centerX : dimensions.width / 2;
    const numWhite = keyboardRange.numWhiteKeys || 14;
    const keyHeight = Math.min(dimensions.height * 0.3, (dimensions.width / numWhite) * 5);
    const y = dimensions.height - keyHeight;
    soundEffects.playMiss();
    // particleSystem.current?.emitMiss(x, y);
    const id = crypto.randomUUID();
    setFeedbacks(prev => [...prev, { id, x, y, result: 'miss', timestamp: Date.now() }]);
    setTimeout(() => setFeedbacks(prev => prev.filter(f => f.id !== id)), 800);
  }, [addMiss, dimensions, keyboardRange]);

  const { gameState, activeNotes, waitingForNote, startGame, pauseGame, resumeGame, stopGame, processNoteHit, processNoteOff, registerDrawCallback } = useGameLoop(handleHit, handleMiss, breakCombo);

  const { isConnected, error: midiError } = useMidiDevice(
    e => {
      setUserActiveKeys(prev => { const n = new Set(prev); n.add(e.midiNumber); return n; });
      userActiveKeysRef.current.add(e.midiNumber); // Sync update
      if (!isMuted) soundEffects.playPianoNote(e.midiNumber);
      if (hasStarted && !showEndGame) {
        processNoteHit(e.midiNumber, config.hitWindowMs, calculateHit);
      }
    },
    e => {
      setUserActiveKeys(prev => { const n = new Set(prev); n.delete(e.midiNumber); return n; });
      userActiveKeysRef.current.delete(e.midiNumber); // Sync update
      if (hasStarted && !showEndGame) processNoteOff(e.midiNumber);
    }
  );

  const handlePitchDetected = useCallback((midiNumber: number) => {
    if (hasStarted && !showEndGame) {
      // isMicInput=true: a wrong pitch detection must NEVER break the player's combo
      processNoteHit(midiNumber, config.hitWindowMs, calculateHit, true);
    }
  }, [hasStarted, showEndGame, processNoteHit, config.hitWindowMs, calculateHit]);

  const { isEnabled: isMicEnabled, error: micError, toggleMicrophone, detectedNote, detectedFrequency, rmsVolume, stableCount, bufferMax, algorithmUsed } = useMicrophonePitch(
    handlePitchDetected, 
    hasStarted && !showEndGame,
    setMicVolume
  );

  const getNoteName = (midi: number) => {
    const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return notes[midi % 12] + Math.floor(midi / 12 - 1);
  };

  const handleScreenKeyPress = useCallback((midiNumber: number) => {
    setUserActiveKeys(prev => { const n = new Set(prev); n.add(midiNumber); return n; });
    userActiveKeysRef.current.add(midiNumber); // Sync update for game loop
    if (!isMuted) soundEffects.playPianoNote(midiNumber);
    if (hasStarted && !showEndGame) {
      processNoteHit(midiNumber, config.hitWindowMs, calculateHit);
    }
  }, [hasStarted, showEndGame, processNoteHit, config.hitWindowMs, calculateHit]);

  const handleScreenKeyRelease = useCallback((midiNumber: number) => {
    setUserActiveKeys(prev => { const n = new Set(prev); n.delete(midiNumber); return n; });
    userActiveKeysRef.current.delete(midiNumber); // Sync update for game loop
    if (hasStarted && !showEndGame) {
      processNoteOff(midiNumber);
    }
  }, [hasStarted, showEndGame, processNoteOff]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const midiNumber = KEY_TO_MIDI[e.key.toLowerCase()];
      if (midiNumber !== undefined) {
        setUserActiveKeys(prev => { const n = new Set(prev); n.add(midiNumber); return n; });
        userActiveKeysRef.current.add(midiNumber); // Sync update
        if (!isMuted) soundEffects.playPianoNote(midiNumber);
        if (hasStarted && !showEndGame) {
          processNoteHit(midiNumber, config.hitWindowMs, calculateHit);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const midiNumber = KEY_TO_MIDI[e.key.toLowerCase()];
      if (midiNumber !== undefined) {
        setUserActiveKeys(prev => { const n = new Set(prev); n.delete(midiNumber); return n; });
        userActiveKeysRef.current.delete(midiNumber); // Sync update
        if (hasStarted && !showEndGame) {
          processNoteOff(midiNumber);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [hasStarted, showEndGame, processNoteHit, processNoteOff, config.hitWindowMs, calculateHit]);


  const displayNotes = useMemo(() => {
    let processedNotes = [...loadedNotes];

    // Trong chế độ Bản nhạc (sheet), phải giữ nguyên toàn bộ nốt như file MIDI/XML gốc
    // để phím đàn cần bấm khớp 100% với nốt hiển thị trên sheet nhạc.
    if (viewMode === 'sheet') {
      return processedNotes;
    }

    const rightNotesMidi = loadedNotes.filter(n => n.track === 'right').map(n => n.midiNumber);
    if (rightNotesMidi.length > 0 && chordMode === 'full') {
      // Keep notes exactly as they are in the MIDI file
      // Removed auto-transposing logic so falling notes match the sheet music perfectly.
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

    if (chordMode === 'simple') {
      // Keep only the lowest note per startTime group (bass root)
      // This works even if the backend hasn't assigned 'role' yet
      const rightNotes = processedNotes.filter(n => n.track === 'right');
      const leftNotes  = processedNotes.filter(n => n.track === 'left');

      // Group left notes by startTime (with 50ms tolerance)
      const leftBass: NoteEvent[] = [];
      const usedTimes = new Set<number>();

      // Sort by startTime then midiNumber (lowest first)
      const sortedLeft = [...leftNotes].sort((a, b) =>
        a.startTime !== b.startTime ? a.startTime - b.startTime : a.midiNumber - b.midiNumber
      );

      for (const n of sortedLeft) {
        // Check if this startTime is already covered (within 50ms)
        const alreadyCovered = Array.from(usedTimes).some(t => Math.abs(t - n.startTime) < 0.05);
        if (!alreadyCovered) {
          leftBass.push(n);  // first note at this time = lowest = bass root
          usedTimes.add(n.startTime);
        }
      }

      // Extend each bass note's duration to fill the full measure so VexFlow
      // renders a clean whole note (no leftover rest symbols)
      const [beatsPerMeasure] = timeSignature.split('/').map(Number);
      const tempo = lesson?.tempo ?? 120;
      const beatsPerMeasureSec = beatsPerMeasure * (60 / tempo);

      const stretchedBass = leftBass.map((n, idx) => {
        const nextStart = idx + 1 < leftBass.length ? leftBass[idx + 1].startTime : n.startTime + beatsPerMeasureSec;
        const fillDur = Math.max(beatsPerMeasureSec, nextStart - n.startTime);
        return {
          ...n,
          duration:     fillDur,
          durationBeat: fillDur * (tempo / 60),
        };
      });

      return [...rightNotes, ...stretchedBass];
    }

    // For other modes, keep all notes (full/arpeggio already processed above)
    return processedNotes;
  }, [loadedNotes, chordMode, timeSignature, lesson]);

  const handleStart = useCallback(() => {
    if (loadedNotes.length === 0) return;
    soundEffects.init();


    {
      const leftNotes = loadedNotes.filter(n => n.track === 'left');
      const startTimes = Array.from(new Set(leftNotes.map(n => n.startTime))).sort((a,b)=>a-b);
      chordTimelineRef.current = startTimes.map(t => {
        const chord = leftNotes.filter(n => n.startTime === t);
        const name = getChordName(chord.map(n => n.midiNumber));
        return { time: t / speed, name };
      });
    }
    
    const finalNotes = displayNotes.map(note => ({
      ...note,
      startTime: (note.startTime / speed),
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
  }, [loadedNotes, displayNotes, speed, config, startGame, lesson]);

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
    <div className="game-screen" style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── TOP BAR (Unified Settings & Song Selector) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(10px)',
        padding: '8px 16px',
        gap: 16,
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        zIndex: 100,
        height: '60px',
        flexShrink: 0,
        WebkitOverflowScrolling: 'touch'
      }}>
        
        {/* Song Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🎹</span>
          <select 
            value={lesson.id} 
            onChange={e => {
               const newLesson = allLessons.find(l => l.id === e.target.value);
               if (newLesson) {
                 stopGame();
                 setHasStarted(false);
                 onSelectLesson(newLesson);
               }
            }}
            style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', fontFamily: 'Nunito', fontSize: 14, outline: 'none', cursor: 'pointer', maxWidth: 200 }}
          >
            {allLessons.map(l => (
              <option key={l.id} value={l.id} style={{ color: '#000' }}>{l.title} (Lv {l.level})</option>
            ))}
          </select>
        </div>

        {/* Playback Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
          {loadingNotes ? <span style={{fontSize: 14, color: '#FFD700'}}>Đang tải...</span> : (
            <button 
              onClick={hasStarted ? (isPaused ? resumeGame : pauseGame) : handleStart} 
              style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: hasStarted && !isPaused ? 'rgba(255,200,0,0.8)' : '#00C9FF', fontWeight: 'bold', cursor: 'pointer', color: '#000', fontSize: 14 }}
            >
              {hasStarted ? (isPaused ? '▶ TIẾP TỤC' : '⏸ TẠM DỪNG') : '▶ BẮT ĐẦU'}
            </button>
          )}
          {hasStarted && (
            <button onClick={() => { stopGame(); setHasStarted(false); }} style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: 'rgba(255,50,50,0.8)', color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: 14 }}>
              ⏹ DỪNG
            </button>
          )}
        </div>

        {/* Quick Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
          {/* View Mode */}
          <select value={viewMode} onChange={e => setViewMode(e.target.value as any)} style={{ padding: '6px', borderRadius: 8, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>
            <option value="falling" style={{ color: '#000' }}>👁️ Nốt rơi</option>
            <option value="sheet" style={{ color: '#000' }}>👁️ Bản nhạc</option>
          </select>
          
          {/* Auto Play */}
          <button onClick={() => setAutoPlayEnabled(v => !v)} style={{ padding: '6px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', background: autoPlayEnabled ? '#FF416C' : 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, fontWeight: autoPlayEnabled ? 'bold' : 'normal' }}>
            🤖 Auto: {autoPlayEnabled ? 'ON' : 'OFF'}
          </button>
          
          {/* Speed */}
          <select value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{ padding: '6px', borderRadius: 8, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>
            <option value="0.5" style={{ color: '#000' }}>🚀 0.5x</option>
            <option value="0.75" style={{ color: '#000' }}>🚀 0.75x</option>
            <option value="1" style={{ color: '#000' }}>🚀 1.0x</option>
            <option value="1.25" style={{ color: '#000' }}>🚀 1.25x</option>
          </select>

          {/* Wait Mode */}
          <button onClick={() => {
            const newVal = !waitModeEnabled;
            setWaitModeEnabled(newVal);
            if (newVal && !isMicEnabled) toggleMicrophone();
          }} style={{ padding: '6px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', background: waitModeEnabled ? '#FFD700' : 'rgba(255,255,255,0.15)', color: waitModeEnabled ? '#000' : '#fff', fontSize: 13, fontWeight: waitModeEnabled ? 'bold' : 'normal' }}>
            ⏳ Chờ: {waitModeEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Audio & Input Settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
          {/* MIDI Status */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: 12 }}>
            <span style={{ fontSize: 13, color: isConnected ? '#92FE9D' : '#ffcc00' }} title={midiError || ''}>
              {isConnected ? '🎹 MIDI: OK' : '🎹 MIDI: Ngắt kết nối'}
            </span>
          </div>

          {/* Mic */}
          <button onClick={toggleMicrophone} style={{ padding: '6px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', background: isMicEnabled ? '#00C9FF' : 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }}>
            🎙️ Mic: {isMicEnabled ? 'ON' : 'OFF'}
          </button>

          {/* Mic Latency Slider (Only visible if mic is on) */}
          {isMicEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: 12 }}>
              <span style={{ fontSize: 11, opacity: 0.8 }}>Trễ:</span>
              <input
                type="range" min={0} max={350} step={10}
                value={micLatencyMs}
                onChange={e => setMicLatencyMs(Number(e.target.value))}
                style={{ width: 60, accentColor: '#00C9FF' }}
              />
              <span style={{ fontSize: 11, fontWeight: 'bold' }}>{micLatencyMs}ms</span>
            </div>
          )}

          {/* Mute */}
          <button onClick={() => setIsMuted(v => !v)} style={{ padding: '6px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', background: isMuted ? 'rgba(255,50,50,0.8)' : 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }}>
            {isMuted ? '🔇 Tắt tiếng Web' : '🔊 Tiếng Web: Bật'}
          </button>

          {/* Octaves */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 16 }}>
            <span style={{ fontSize: 13 }}>🎹 Quãng:</span>
            <button onClick={() => { const n = Math.max(2, numOctaves - 1); setNumOctaves(n); const allMidi = loadedNotes.map(x => x.midiNumber); setKeyboardRange(buildKeyboardRange(Math.min(...allMidi), Math.max(...allMidi), n)); }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0 4px', fontSize: 16 }}>-</button>
            <span style={{ fontSize: 14, fontWeight: 'bold' }}>{numOctaves}</span>
            <button onClick={() => { const n = Math.min(5, numOctaves + 1); setNumOctaves(n); const allMidi = loadedNotes.map(x => x.midiNumber); setKeyboardRange(buildKeyboardRange(Math.min(...allMidi), Math.max(...allMidi), n)); }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0 4px', fontSize: 16 }}>+</button>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div style={{ flex: 1, position: 'relative', width: '100%', overflow: 'hidden' }}>
        {viewMode === 'falling' ? (
          <GameCanvas registerDrawCallback={registerDrawCallback} userActiveKeysRef={userActiveKeysRef} config={config} canvasWidth={dimensions.width} canvasHeight={dimensions.height - 60} waitingForNote={waitingForNote} keyboardRange={keyboardRange} onKeyPress={handleScreenKeyPress} onKeyRelease={handleScreenKeyRelease} />
        ) : (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: (!hasStarted && !isPaused) ? 0.3 : 1, transition: 'opacity 0.3s' }}>
            {sheetMusicEngine === 'osmd' ? (
              <SheetView notes={displayNotes} tempo={songTempo * speed} timeSignature={timeSignature} canvasWidth={dimensions.width} canvasHeight={dimensions.height - 60} keyboardRange={keyboardRange} userActiveKeysRef={userActiveKeysRef} config={config} waitingForNote={waitingForNote} showFingering={true} xmlUrl={lesson.sheetMusicUrl ?? null} registerDrawCallback={registerDrawCallback} onKeyPress={handleScreenKeyPress} onKeyRelease={handleScreenKeyRelease} />
            ) : (
              <VexFlowView notes={displayNotes} tempo={songTempo * speed} timeSignature={timeSignature} canvasWidth={dimensions.width} canvasHeight={dimensions.height - 60} keyboardRange={keyboardRange} userActiveKeysRef={userActiveKeysRef} config={config} waitingForNote={waitingForNote} showFingering={true} registerDrawCallback={registerDrawCallback} onKeyPress={handleScreenKeyPress} onKeyRelease={handleScreenKeyRelease} />
            )}
          </div>
        )}
        
        {/* Start Game Overlay for Sheet Music Mode */}
        {!hasStarted && viewMode === 'sheet' && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
            <button className="start-btn" onClick={handleStart} style={{ fontFamily: 'Nunito, sans-serif' }}>▶ BẮT ĐẦU CHƠI</button>
          </div>
        )}
          <canvas ref={effectsCanvasRef} width={dimensions.width} height={dimensions.height} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 20 }} />
          {isMicEnabled && (
            <div style={{
              position: 'absolute', top: 60, right: 8, zIndex: 50,
              background: 'rgba(0,0,0,0.82)', borderRadius: 12, padding: '8px 12px',
              fontFamily: 'monospace', fontSize: 12, color: '#fff', minWidth: 200,
              backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)',
              pointerEvents: 'none',
            }}>
              <div style={{ color: '#92FE9D', fontWeight: 'bold', marginBottom: 6, fontSize: 11 }}>
                🎤 MIC DIAGNOSTIC
              </div>

              {/* Volume bar */}
              <div style={{ marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>Volume: </span>
                {rmsVolume === -1 ? (
                  <span style={{ color: '#ff4444', fontWeight: 'bold' }}>
                    ✂️ CLIPPING — xa loa ra 15-20cm!
                  </span>
                ) : (
                  <span style={{ color: rmsVolume > 0.006 ? '#92FE9D' : rmsVolume > 0.002 ? '#FFD700' : '#ff6b6b' }}>
                    {rmsVolume > 0.006 ? '✅' : rmsVolume > 0.002 ? '⚠️' : '🔴'} {(rmsVolume * 1000).toFixed(1)}
                  </span>
                )}
                <div style={{ marginTop: 2, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
                  <div style={{
                    width: rmsVolume === -1 ? '100%' : `${Math.min(100, rmsVolume * 8000)}%`,
                    height: '100%', borderRadius: 2,
                    background: rmsVolume === -1 ? '#ff4444' : rmsVolume > 0.006 ? '#92FE9D' : rmsVolume > 0.002 ? '#FFD700' : '#ff6b6b',
                    transition: 'width 0.05s'
                  }} />
                </div>
              </div>

              {/* Frequency */}
              <div style={{ marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>Frequency: </span>
                <span style={{ color: detectedFrequency ? '#00C9FF' : '#666' }}>
                  {detectedFrequency ? `${detectedFrequency} Hz` : '—'}
                </span>
              </div>

              {/* MIDI Note */}
              <div style={{ marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>Note: </span>
                <span style={{ color: detectedNote ? '#FFD700' : '#666', fontWeight: 'bold', fontSize: 14 }}>
                  {detectedNote ? getNoteName(detectedNote) : '—'}
                  {detectedNote ? ` (MIDI ${detectedNote})` : ''}
                </span>
              </div>

              {/* Stability buffer */}
              <div>
                <span style={{ opacity: 0.7 }}>Ổn định: </span>
                {[1, 2, 3, 4].map(i => (
                  <span key={i} style={{
                    display: 'inline-block', width: 10, height: 10,
                    borderRadius: 2, marginRight: 2,
                    background: i <= stableCount ? '#92FE9D' : 'rgba(255,255,255,0.2)',
                    transition: 'background 0.05s'
                  }} />
                ))}
                <span style={{ color: stableCount >= 4 ? '#92FE9D' : '#aaa', marginLeft: 4 }}>
                  {stableCount >= 4 ? '→ FIRED ✅' : `${stableCount}/4`}
                </span>
              </div>

              {/* Raw buffer peak — confirms audio data is actually flowing */}
              <div style={{ marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>Buffer peak: </span>
                <span style={{ color: bufferMax > 0.01 ? '#00C9FF' : '#ff6b6b', fontWeight: 'bold' }}>
                  {bufferMax > 0 ? bufferMax.toFixed(3) : '0.000'}
                  {bufferMax < 0.001 ? ' ← buffer trống! mic chưa nhận dữ liệu' : ''}
                </span>
              </div>

              {/* Which algorithm detected the pitch */}
              <div style={{ marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>Algo: </span>
                <span style={{ color: algorithmUsed !== 'none' ? '#92FE9D' : '#666' }}>
                  {algorithmUsed === 'none' ? '— (tất cả fail)' : `✅ ${algorithmUsed}`}
                </span>
              </div>

              {/* Thresholds legend */}
              <div style={{ marginTop: 6, fontSize: 10, opacity: 0.5, lineHeight: 1.4 }}>
                🔴 &lt;2 im lặng · ⚠️ 2-6 yếu · ✅ &gt;6 OK (×1000)
              </div>
            </div>
          )}
          
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
            <EndGameScreen score={score} stars={stars} accuracy={gameStats.totalNotes > 0 ? (gameStats.hitNotes / gameStats.totalNotes) * 100 : 0} totalNotes={gameStats.totalNotes} hitNotes={gameStats.hitNotes} combo={gameStats.maxCombo} lessonTitle={lesson.title} onReplay={handleStart} onNextLesson={() => {}} onHome={() => { stopGame(); setHasStarted(false); setShowEndGame(false); }} />
          )}
        </div>
    </div>
  );
};
export default GameScreen;
