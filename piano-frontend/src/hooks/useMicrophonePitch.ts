import { useState, useEffect, useRef, useCallback } from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pitchfinder = require('pitchfinder');

interface MicrophonePitchResult {
  isEnabled: boolean;
  error: string | null;
  toggleMicrophone: () => void;
  detectedNote: number | null;
  detectedFrequency: number | null;
  rmsVolume: number;        // -1 = clipping, 0-1 = normal
  stableCount: number;
  bufferMax: number;        // raw peak value in buffer (confirms audio data is flowing)
  algorithmUsed: string;   // which algorithm detected the frequency (for debugging)
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
  const [detectedFrequency, setDetectedFrequency] = useState<number | null>(null);
  const [rmsVolume, setRmsVolume] = useState<number>(0);
  const [stableCount, setStableCount] = useState<number>(0);
  const [bufferMax, setBufferMax] = useState<number>(0);       // raw peak — confirms audio is flowing
  const [algorithmUsed, setAlgorithmUsed] = useState<string>('none'); // which algo fired

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number | null>(null);
  const dummyAudioRef = useRef<HTMLAudioElement | null>(null);

  // Onset detection state
  const noteHistoryRef = useRef<number[]>([]);           // sliding window (max 5 frames)
  const stableNoteRef = useRef<number | null>(null);    // current candidate note
  const stableCountRef = useRef<number>(0);              // consecutive frame count
  const lastFiredNoteRef = useRef<number | null>(null);  // last note sent to game
  const inSilenceRef = useRef<boolean>(true);            // whether mic is currently in silence

  const REQUIRED_STABLE_FRAMES = 3;    // ~3 frames @ 60fps ≈ 50ms (faster response)
  const RMS_ONSET_THRESHOLD = 0.003;   // lowered from 0.006 to allow softer organ notes
  const RMS_SILENCE_THRESHOLD = 0.002; // below this = true silence (was 0.008)

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
      // fftSize 4096 = 93ms window at 44.1kHz. 
      // 2048 was too short for Macleod/AMDF to find periods for low piano notes reliably, 
      // causing pitch tracking to fail. 8192 was too long (smeared high notes).
      analyser.fftSize = 4096;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // ── 4-algorithm cascade for maximum compatibility ──
      // 1. Macleod (MPM) — state of the art time-domain
      // 2. YIN          — highly accurate, relaxed threshold
      // 3. AMDF         — robust fallback for sustained organ notes
      // 4. ACF2PLUS     — last resort autocorrelation
      const detectMacleod = pitchfinder.Macleod({ sampleRate: audioCtx.sampleRate, bufferSize: analyser.fftSize });
      const detectYIN     = pitchfinder.YIN({ sampleRate: audioCtx.sampleRate, threshold: 0.3 }); // relaxed threshold
      const detectAMDF    = pitchfinder.AMDF({ sampleRate: audioCtx.sampleRate, minFrequency: 27, maxFrequency: 4200 });
      const detectACF     = pitchfinder.ACF2PLUS({ sampleRate: audioCtx.sampleRate });
      const buffer        = new Float32Array(analyser.fftSize);

      const loop = () => {
        analyser.getFloatTimeDomainData(buffer);

        // ── 1. Calculate RMS + detect clipping ─────────────────────────────
        let sumSq = 0;
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = Math.abs(buffer[i]);
          sumSq += buffer[i] * buffer[i];
          if (v > peak) peak = v;
        }
        const rms = Math.sqrt(sumSq / buffer.length);
        const isClipping = peak > 0.95;

        if (onVolumeChange && Math.random() < 0.1) {
          onVolumeChange(Math.min(100, rms * 800));
        }
        // Update rmsVolume + clipping for diagnostic panel (throttled ~10fps)
        if (Math.random() < 0.17) {
          setRmsVolume(isClipping ? -1 : rms);
          setBufferMax(Math.round(peak * 1000) / 1000); // always show raw peak
        }

        // ── 2. Silence gate ─────────────────────────────────────────────────
        if (rms < RMS_SILENCE_THRESHOLD) {
          noteHistoryRef.current = [];
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

        // ── 3. Pitch estimation — Cascade ────────────────────────────────────
        let frequency: number | null = null;
        let algo = 'none';

        // Always normalize a copy of the buffer before pitch detection IF it's loud enough.
        // Organ/Digital Pianos can have variable input volumes. Normalizing helps.
        // But if we normalize silence/hiss (peak < 0.02), we destroy the pitch algorithms.
        const pitchBuffer = new Float32Array(buffer.length);
        if (peak > 0.02) {
          const scale = 0.8 / peak;
          for (let i = 0; i < buffer.length; i++) {
            pitchBuffer[i] = buffer[i] * scale;
          }
        } else {
          for (let i = 0; i < buffer.length; i++) pitchBuffer[i] = buffer[i];
        }

        const mac = detectMacleod(pitchBuffer);
        if (mac && mac >= 27 && mac <= 4200) { frequency = mac; algo = 'Macleod'; }
        else {
          const yin = detectYIN(pitchBuffer);
          if (yin && yin >= 27 && yin <= 4200) { frequency = yin; algo = 'YIN'; }
          else {
            const amdf = detectAMDF(pitchBuffer);
            if (amdf && amdf >= 27 && amdf <= 4200) { frequency = amdf; algo = 'AMDF'; }
            else {
              const acf = detectACF(pitchBuffer);
              if (acf && acf >= 27 && acf <= 4200) { frequency = acf; algo = 'ACF'; }
            }
          }
        }

        let midiNumber = frequency ? Math.round(12 * Math.log2(frequency / 440) + 69) : -1;

        if (midiNumber !== -1 && (midiNumber < 21 || midiNumber > 108)) {
          midiNumber = -1; // Out of piano range
        }

        // Onset gate: if game is paused or volume too low for a strike, treat as null
        if (!active || rms < RMS_ONSET_THRESHOLD) {
          midiNumber = -1;
        }

        // ── 5. Stability buffer — Sliding Window Majority Vote ──────────────
        const history = noteHistoryRef.current;
        history.push(midiNumber);
        if (history.length > 5) history.shift();

        const counts = new Map<number, number>();
        let maxCount = 0;
        let dominantNote = -1;
        for (const n of history) {
          if (n === -1) continue;
          const c = (counts.get(n) || 0) + 1;
          counts.set(n, c);
          if (c > maxCount) {
            maxCount = c;
            dominantNote = n;
          }
        }

        stableNoteRef.current = dominantNote === -1 ? null : dominantNote;
        stableCountRef.current = maxCount;

        // Update diagnostics every frame (throttled ~10fps)
        if (Math.random() < 0.17) {
          if (frequency && midiNumber !== -1) {
            setDetectedFrequency(Math.round(frequency * 10) / 10);
            setDetectedNote(midiNumber);
            setAlgorithmUsed(algo);
          } else {
            setDetectedFrequency(null);
            setAlgorithmUsed('none');
          }
          setStableCount(Math.min(stableCountRef.current, REQUIRED_STABLE_FRAMES));
        }

        // ── 6. Onset fire — only fire once per note onset ───────────────────
        if (stableCountRef.current >= REQUIRED_STABLE_FRAMES && dominantNote !== -1) {
          if (dominantNote !== lastFiredNoteRef.current || inSilenceRef.current) {
            onNoteOn(dominantNote);
            lastFiredNoteRef.current = dominantNote;
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

  return { isEnabled, error, toggleMicrophone, detectedNote, detectedFrequency, rmsVolume, stableCount, bufferMax, algorithmUsed };
}
