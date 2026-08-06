import { useState, useEffect, useRef, useCallback } from 'react';
import { YIN } from 'pitchfinder';

interface MicrophonePitchResult {
  isEnabled: boolean;
  error: string | null;
  toggleMicrophone: () => void;
  detectedNote: number | null;   // MIDI number of stable detected note
  detectedFrequency: number | null; // Raw Hz from YIN (for diagnostics)
  rmsVolume: number;             // 0-1 raw RMS (for diagnostics)
  stableCount: number;           // current stability frame count (0-4)
}

/**
 * Microphone pitch detection hook using the YIN algorithm.
 *
 * Design goals for a piano learning game:
 *  1. ONSET detection only  — fire onNoteOn ONCE per new note, not continuously.
 *  2. STABILITY buffer      — require N consecutive frames of same MIDI note before accepting.
 *  3. SILENCE gate          — minimum RMS threshold to ignore ambient noise.
 *  4. COOLDOWN              — after a note fires, wait for silence before accepting next note.
 *  5. NO combo-break        — mic input is inherently imprecise; wrong detections must
 *                             never reset the player's combo (handled in processNoteHit caller).
 */
export function useMicrophonePitch(
  onNoteOn: (midiNumber: number) => void,
  active: boolean = true,
  onVolumeChange?: (volume: number) => void
): MicrophonePitchResult {
  const [isEnabled, setIsEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedNote, setDetectedNote] = useState<number | null>(null);
  // Diagnostic state — updated every frame for real-time display
  const [detectedFrequency, setDetectedFrequency] = useState<number | null>(null);
  const [rmsVolume, setRmsVolume] = useState<number>(0);
  const [stableCount, setStableCount] = useState<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number | null>(null);
  const dummyAudioRef = useRef<HTMLAudioElement | null>(null);

  // Onset detection state
  const stableNoteRef = useRef<number | null>(null);    // current candidate note
  const stableCountRef = useRef<number>(0);              // consecutive frame count
  const lastFiredNoteRef = useRef<number | null>(null);  // last note sent to game
  const inSilenceRef = useRef<boolean>(true);            // whether mic is currently in silence

  const REQUIRED_STABLE_FRAMES = 4;   // ~4 frames @ 60fps ≈ 67ms stability window
  const RMS_ONSET_THRESHOLD = 0.015;  // minimum volume to consider a note started
  const RMS_SILENCE_THRESHOLD = 0.008; // volume below which we consider silence

  const stopMic = useCallback(() => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (dummyAudioRef.current) {
      dummyAudioRef.current.srcObject = null;
      dummyAudioRef.current = null;
    }
    stableNoteRef.current = null;
    stableCountRef.current = 0;
    lastFiredNoteRef.current = null;
    inSilenceRef.current = true;
  }, []);

  const toggleMicrophone = useCallback(async () => {
    if (isEnabled) {
      stopMic();
      setIsEnabled(false);
      setDetectedNote(null);
      setError(null);
      return;
    }

    try {
      // Create AudioContext synchronously during user click event (required for iOS Safari)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      audioContextRef.current = audioCtx;

      // Request mic with all audio processing disabled to preserve piano timbre
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // @ts-ignore — Safari-specific constraint
          googEchoCancellation: false,
          googNoiseSuppression: false,
          googAutoGainControl: false,
        }
      });
      streamRef.current = stream;

      // iOS Safari WebKit bug 212780: attach stream to an audio element or
      // AnalyserNode will receive no data.
      const audioEl = new Audio();
      audioEl.muted = true;
      audioEl.srcObject = stream;
      audioEl.play().catch(() => {/* intentional — we just need the stream attached */});
      dummyAudioRef.current = audioEl;

      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const analyser = audioCtx.createAnalyser();
      // fftSize 4096 covers at least 2 full periods of A0 (27.5Hz) at 44.1kHz sample rate
      analyser.fftSize = 4096;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // YIN: threshold 0.15 balances accuracy vs latency for piano notes
      const detectPitch = YIN({ sampleRate: audioCtx.sampleRate, threshold: 0.15 });
      const buffer = new Float32Array(analyser.fftSize);

      const loop = () => {
        analyser.getFloatTimeDomainData(buffer);

        // ── 1. Calculate RMS (Root Mean Square) volume ─────────────────────
        let sumSq = 0;
        for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
        const rms = Math.sqrt(sumSq / buffer.length);

        // Report volume to UI meter (throttled to ~6fps to avoid React render storms)
        if (onVolumeChange && Math.random() < 0.1) {
          onVolumeChange(Math.min(100, rms * 800));
        }
        // Always update rmsVolume for diagnostic panel (throttled ~10fps)
        if (Math.random() < 0.17) {
          setRmsVolume(rms);
        }

        // ── 2. Silence gate ─────────────────────────────────────────────────
        if (rms < RMS_SILENCE_THRESHOLD) {
          stableNoteRef.current = null;
          stableCountRef.current = 0;
          inSilenceRef.current = true;
          if (Math.random() < 0.17) {
            setDetectedNote(null);
            setDetectedFrequency(null);
            setStableCount(0);
          }
          requestRef.current = requestAnimationFrame(loop);
          return;
        }

        // ── 3. YIN pitch estimation (always runs for diagnostics) ───────────
        // We run this even when below onset threshold so the diagnostic panel
        // can show the frequency — helping the user understand if YIN detects
        // their piano at all, even when the volume is a bit low.
        const frequency = detectPitch(buffer);

        if (!frequency || frequency < 27 || frequency > 4200) {
          // Out of piano range or no clear pitch found
          if (Math.random() < 0.17) {
            setDetectedFrequency(null);
            setStableCount(0);
          }
          requestRef.current = requestAnimationFrame(loop);
          return;
        }

        const midiNumber = Math.round(12 * Math.log2(frequency / 440) + 69);

        // Update diagnostics every frame (throttled ~10fps)
        if (Math.random() < 0.17) {
          setDetectedFrequency(Math.round(frequency * 10) / 10);
          setDetectedNote(midiNumber >= 21 && midiNumber <= 108 ? midiNumber : null);
        }

        // ── 4. Onset gate — only trigger game events above onset threshold ──
        if (!active || rms < RMS_ONSET_THRESHOLD) {
          requestRef.current = requestAnimationFrame(loop);
          return;
        }

        if (midiNumber < 21 || midiNumber > 108) {
          requestRef.current = requestAnimationFrame(loop);
          return;
        }

        // ── 5. Stability buffer — require N consecutive frames of same note ──
        if (midiNumber === stableNoteRef.current) {
          stableCountRef.current++;
        } else {
          stableNoteRef.current = midiNumber;
          stableCountRef.current = 1;
        }

        // Update stableCount for the diagnostic progress bar
        if (Math.random() < 0.17) {
          setStableCount(Math.min(stableCountRef.current, REQUIRED_STABLE_FRAMES));
        }

        // ── 6. Onset fire — only fire once per note onset ───────────────────
        if (stableCountRef.current === REQUIRED_STABLE_FRAMES) {
          if (midiNumber !== lastFiredNoteRef.current || inSilenceRef.current) {
            onNoteOn(midiNumber);
            lastFiredNoteRef.current = midiNumber;
            inSilenceRef.current = false;
          }
        }

        requestRef.current = requestAnimationFrame(loop);
      };

      requestRef.current = requestAnimationFrame(loop);
      setIsEnabled(true);
      setError(null);
    } catch (err: any) {
      console.error('[Mic]', err);
      setError(err.message || 'Không thể truy cập microphone');
      setIsEnabled(false);
    }
  }, [isEnabled, active, onNoteOn, onVolumeChange, stopMic]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopMic();
  }, [stopMic]);

  return { isEnabled, error, toggleMicrophone, detectedNote, detectedFrequency, rmsVolume, stableCount };
}
