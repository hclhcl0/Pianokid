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
  const stableNoteRef = useRef<number | null>(null);    // current candidate note
  const stableCountRef = useRef<number>(0);              // consecutive frame count
  const lastFiredNoteRef = useRef<number | null>(null);  // last note sent to game
  const inSilenceRef = useRef<boolean>(true);            // whether mic is currently in silence

  const REQUIRED_STABLE_FRAMES = 3;    // ~3 frames @ 60fps ≈ 50ms (faster response)
  const RMS_ONSET_THRESHOLD = 0.006;   // volume to trigger game events (was 0.015)
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
      // fftSize 8192 = 186ms window at 44.1kHz — gives YIN enough data for low piano notes
      // Trade-off: slightly more latency but much better detection of piano timbre
      analyser.fftSize = 8192;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // ── 3-algorithm cascade for maximum organ/digital piano compatibility ──
      // 0. FFT peak    — frequency-domain, works for ANY harmonic instrument
      // 1. Macleod (MPM) — best for harmonic-rich electronic instruments
      // 2. AMDF         — robust fallback, works well with sustained organ notes
      const detectMacleod = pitchfinder.Macleod({ sampleRate: audioCtx.sampleRate, bufferSize: analyser.fftSize });
      const detectAMDF    = pitchfinder.AMDF({ sampleRate: audioCtx.sampleRate, minFrequency: 27, maxFrequency: 4200 });
      const detectACF     = pitchfinder.ACF2PLUS({ sampleRate: audioCtx.sampleRate });
      const freqBuffer    = new Float32Array(analyser.frequencyBinCount); // for FFT
      const buffer        = new Float32Array(analyser.fftSize);

      // FFT-based pitch: find strongest frequency bin in piano range
      // Completely different approach from time-domain algorithms.
      // Works reliably for organ/digital piano which has strong spectral peaks.
      const detectFFT = (): number | null => {
        analyser.getFloatFrequencyData(freqBuffer);
        const binHz = (audioCtx.sampleRate / 2) / freqBuffer.length;
        const minBin = Math.max(1, Math.floor(27 / binHz));
        const maxBin = Math.min(freqBuffer.length - 2, Math.ceil(4200 / binHz));
        let maxDb = -100, peakBin = -1;
        for (let i = minBin; i <= maxBin; i++) {
          if (freqBuffer[i] > maxDb) { maxDb = freqBuffer[i]; peakBin = i; }
        }
        if (maxDb < -60 || peakBin < 1) return null; // too quiet or no peak
        // Parabolic interpolation for sub-bin accuracy
        const y1 = freqBuffer[peakBin - 1], y2 = freqBuffer[peakBin], y3 = freqBuffer[peakBin + 1];
        const denom = 2 * (2 * y2 - y1 - y3);
        const refined = denom !== 0 ? peakBin + (y3 - y1) / denom : peakBin;
        return refined * binHz;
      };

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
        if (Math.random() < 0.17) {
          setRmsVolume(isClipping ? -1 : rms);
          setBufferMax(Math.round(peak * 1000) / 1000); // always show raw peak
        }

        // If clipping: normalize buffer so YIN can still analyze the pitch shape.
        // The peak amplitude is lost but the frequency information is preserved.
        if (isClipping && peak > 0) {
          const scale = 0.8 / peak;
          for (let i = 0; i < buffer.length; i++) buffer[i] *= scale;
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

        // ── 3. Pitch estimation — FFT first, then time-domain cascade ────────
        // FFT approach: frequency-domain peak detection.
        // Works for organ/digital piano regardless of waveform complexity.
        let frequency: number | null = null;
        let algo = 'none';

        const fftResult = detectFFT();
        if (fftResult && fftResult >= 27 && fftResult <= 4200) {
          frequency = fftResult; algo = 'FFT';
        } else {
          const mac = detectMacleod(buffer);
          if (mac && mac >= 27 && mac <= 4200) { frequency = mac; algo = 'Macleod'; }
          else {
            const amdf = detectAMDF(buffer);
            if (amdf && amdf >= 27 && amdf <= 4200) { frequency = amdf; algo = 'AMDF'; }
            else {
              const acf = detectACF(buffer);
              if (acf && acf >= 27 && acf <= 4200) { frequency = acf; algo = 'ACF'; }
            }
          }
        }

        if (!frequency) {
          if (Math.random() < 0.17) {
            setDetectedFrequency(null);
            setStableCount(0);
            setAlgorithmUsed('none');
          }
          requestRef.current = requestAnimationFrame(loop);
          return;
        }

        const midiNumber = Math.round(12 * Math.log2(frequency / 440) + 69);

        // Update diagnostics every frame (throttled ~10fps)
        if (Math.random() < 0.17) {
          setDetectedFrequency(Math.round(frequency * 10) / 10);
          setDetectedNote(midiNumber >= 21 && midiNumber <= 108 ? midiNumber : null);
          setAlgorithmUsed(algo);
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

  return { isEnabled, error, toggleMicrophone, detectedNote, detectedFrequency, rmsVolume, stableCount, bufferMax, algorithmUsed };
}
