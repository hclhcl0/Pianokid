import { useRef, useState, useCallback, useEffect } from 'react';
import { GameConfig, GameState, NoteEvent, ActiveNote, HitResult } from '../types';

/**
 * Core game loop hook.
 *
 * Time model:
 *   Y = (currentTime - (note.startTime - lookAheadTime)) * fallSpeed
 *
 * Wait Mode:
 *   When currentTime >= note.startTime for the EARLIEST unhit note,
 *   suspend the AudioContext clock. The note's Y position freezes at
 *   the hit-zone line. The game resumes only when the correct MIDI
 *   note (or keyboard key) is received.
 */
export const useGameLoop = (
  onHit: (note: ActiveNote, result: HitResult) => void,
  onMiss: (note: ActiveNote) => void,
  onBreakCombo?: () => void
) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number>(0);
  // notesRef holds the authoritative game state (hit/missed flags).
  // It is mutated in-place so processNoteHit always sees fresh state.
  const notesRef = useRef<ActiveNote[]>([]);
  const configRef = useRef<GameConfig | null>(null);
  // midiNumber of the note we are currently waiting for (Wait Mode only)
  const waitingForRef = useRef<number | null>(null);
  const startTimeOffsetRef = useRef<number>(0);

  const [gameState, setGameState] = useState<GameState>({
    isPlaying: false,
    isPaused: false,
    score: 0,
    combo: 0,
    stars: 0,
    currentTime: 0,
  });

  // Separate reactive state so GameCanvas / HUD can react to waiting note
  const [waitingForNote, setWaitingForNote] = useState<number | null>(null);
  const [activeNotes, setActiveNotes] = useState<ActiveNote[]>([]);
  const activeNotesHashRef = useRef<string>('');
  
  const onDrawCallbacksRef = useRef<((currentTime: number, visible: ActiveNote[]) => void)[]>([]);

  const registerDrawCallback = useCallback((cb: (currentTime: number, visible: ActiveNote[]) => void) => {
    onDrawCallbacksRef.current.push(cb);
    return () => {
      onDrawCallbacksRef.current = onDrawCallbacksRef.current.filter(x => x !== cb);
    };
  }, []);

  // ─── Start ──────────────────────────────────────────────────────────────────
  const startGame = useCallback((notes: NoteEvent[], config: GameConfig) => {
    // Re-use existing AudioContext if possible (browser gesture already granted)
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new Ctx();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const firstNoteTime = notes.length > 0 ? Math.min(...notes.map(n => n.startTime)) : 0;
    // Skip empty silence at the beginning, but shift back by 3.0 seconds to give the player 
    // a 3.0-second countdown delay before the notes start appearing and falling.
    startTimeOffsetRef.current = audioContextRef.current.currentTime - (firstNoteTime - 3.0);
    
    configRef.current = config;
    notesRef.current = notes
      .slice()
      .sort((a, b) => a.startTime - b.startTime)
      .map(n => ({ ...n, y: 0, hit: false, missed: false, isWaiting: false }));
    waitingForRef.current = null;
    setWaitingForNote(null);

    setGameState(prev => ({
      ...prev,
      isPlaying: true,
      isPaused: false,
      score: 0,
      combo: 0,
      stars: 0,
      currentTime: 0,
    }));

    cancelAnimationFrame(animationFrameRef.current);

    const loop = () => {
      const ac = audioContextRef.current;
      const cfg = configRef.current;
      if (!ac || !cfg) return;

      const { lookAheadTime, fallSpeed, waitMode, hitWindowMs, autoPlay } = cfg;
      const rawTime = ac.currentTime - startTimeOffsetRef.current;
      const currentTime = rawTime - lookAheadTime;

      // ── Auto-Play Mode: auto hit notes ──────────────────────────────────────
      if (autoPlay) {
        notesRef.current.forEach(note => {
          if (!note.hit && currentTime >= note.startTime) {
            note.hit = true;
            note.isHeld = true;
            onHit(note, 'perfect');
          }
        });
      }

      // ── Wait Mode: only pause if a note reaches the hit line and is NOT hit within grace period (150ms)
      if (waitMode && !autoPlay) {
        const nextPending = notesRef.current
          .filter(n => !n.hit && !n.missed && currentTime >= n.startTime + 0.15)
          .sort((a, b) => a.startTime - b.startTime)[0];

        if (nextPending && ac.state === 'running') {
          // Freeze the audio clock waiting for player
          ac.suspend();
          waitingForRef.current = nextPending.midiNumber;
          setWaitingForNote(nextPending.midiNumber);
        }
      }

      // ── Standard Mode: mark misses ──────────────────────────────────────────
      // In Wait Mode the clock is frozen so notes can never drift past the window.
      if (!waitMode && !autoPlay) {
        notesRef.current.forEach(note => {
          if (!note.hit && !note.missed && !note.isHeld) {
            if (currentTime > note.startTime + hitWindowMs / 1000 + 0.2) {
              note.missed = true;
              onMiss(note);
            }
          }
        });
      }

      // Check held notes for completion
      notesRef.current.forEach(note => {
        if (note.isHeld) {
          // A note finishes when currentTime reaches its end (start + duration)
          // We add a tiny buffer (0.05s) to ensure it renders fully
          if (currentTime >= note.startTime + note.duration - 0.05) {
            note.isHeld = false; // Successfully held for full duration
          }
        }
      });

      // Build visible notes
      const visible = notesRef.current
        .map(note => ({
          ...note,
          y: (currentTime - (note.startTime - lookAheadTime)) * fallSpeed,
          isWaiting: waitMode && waitingForRef.current === note.midiNumber && !note.hit,
          isHeld: note.isHeld,
        }))
        .filter(note => {
          return note.startTime - lookAheadTime <= currentTime && currentTime <= note.startTime + note.duration + 1.0;
        });

      // Compute a hash of what notes are visible and their status
      const visibleHash = visible.map(n => `${n.midiNumber}_${n.startTime}_${n.hit}_${n.missed}`).join(',');
      if (activeNotesHashRef.current !== visibleHash) {
        activeNotesHashRef.current = visibleHash;
        setActiveNotes(visible);
      }

      onDrawCallbacksRef.current.forEach(cb => cb(currentTime, visible));
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
  }, [onMiss, onHit]);

  // ─── Pause / Resume (manual) ────────────────────────────────────────────────
  const pauseGame = useCallback(() => {
    if (audioContextRef.current?.state === 'running') {
      audioContextRef.current.suspend();
      setGameState(prev => ({ ...prev, isPaused: true }));
    }
  }, []);

  const resumeGame = useCallback(() => {
    // Only allow manual resume if NOT in Wait Mode waiting for a note
    if (
      audioContextRef.current?.state === 'suspended' &&
      waitingForRef.current === null
    ) {
      audioContextRef.current.resume();
      setGameState(prev => ({ ...prev, isPaused: false }));
    }
  }, []);

  // ─── Stop ───────────────────────────────────────────────────────────────────
  const stopGame = useCallback(() => {
    cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    waitingForRef.current = null;
    setWaitingForNote(null);
    setGameState(prev => ({ ...prev, isPlaying: false, isPaused: false }));
    setActiveNotes([]);
  }, []);

  // ─── Process a note hit from MIDI or keyboard ────────────────────────────────
  const processNoteHit = useCallback(
    (
      midiNumber: number,
      hitWindowMs: number,
      calculateHit: (diff: number, windowMs: number) => HitResult
    ) => {
      const ac = audioContextRef.current;
      const cfg = configRef.current;
      if (!ac || !cfg) return;

      const { waitMode, autoPlay, lookAheadTime } = cfg;
      const rawTime = ac.currentTime - startTimeOffsetRef.current;
      const currentTime = rawTime - lookAheadTime;
      
      if (autoPlay) return; // Bỏ qua input khi đang Auto-Play

      if (waitMode) {
        // In Wait Mode: ONLY accept the exact note we're waiting for.
        // Wrong keys are silently ignored — no penalty for exploring.
        if (
          waitingForRef.current !== null &&
          midiNumber !== waitingForRef.current
        ) {
          return;
        }
      }

      // Find candidates that are actually near the hit line (within playable window)
      const playableWindowSec = (hitWindowMs || 500) / 1000;
      const candidates = notesRef.current.filter(
        n => !n.hit && !n.missed && n.midiNumber === midiNumber && (
          (waitMode && waitingForRef.current === n.midiNumber) ||
          Math.abs(n.startTime - currentTime) <= playableWindowSec
        )
      );

      if (candidates.length === 0) {
        // User pressed a key that is NOT near the hit zone
        if (!waitMode) {
          onBreakCombo?.();
        }
        return;
      }

      candidates.sort(
        (a, b) =>
          Math.abs(a.startTime - currentTime) -
          Math.abs(b.startTime - currentTime)
      );
      const target = candidates[0];

      let result: HitResult;
      if (waitMode && waitingForRef.current === target.midiNumber) {
        result = 'perfect';
      } else {
        const timeDiff = currentTime - target.startTime;
        result = calculateHit(timeDiff, hitWindowMs);
      }

      if (result !== 'miss') {
        target.hit = true;
        target.isHeld = true; // Bắt đầu Hold
        onHit(target, result);

        if (waitMode) {
          // Clear the wait lock and resume the audio clock
          waitingForRef.current = null;
          setWaitingForNote(null);
          if (ac.state === 'suspended') {
            ac.resume();
          }
        }
      }
    },
    [onHit, onBreakCombo]
  );

  // ─── Process a note release from MIDI or keyboard (stop Hold) ───────────────
  const processNoteOff = useCallback((midiNumber: number) => {
    const ac = audioContextRef.current;
    const cfg = configRef.current;
    if (!ac || !cfg) return;
    if (cfg.autoPlay) return;
    
    const currentTime = ac.currentTime;
    
    // Find any note for this key that is currently being held
    const heldNotes = notesRef.current.filter(n => n.isHeld && n.midiNumber === midiNumber);
    
    heldNotes.forEach(note => {
      note.isHeld = false;
    });
  }, []);

  // ─── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      audioContextRef.current?.close();
    };
  }, []);

  return {
    gameState,
    activeNotes,
    waitingForNote,
    startGame,
    pauseGame,
    resumeGame,
    stopGame,
    processNoteHit,
    processNoteOff,
    registerDrawCallback,
  };
};
