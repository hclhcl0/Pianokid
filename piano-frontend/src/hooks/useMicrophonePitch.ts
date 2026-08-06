import { useState, useEffect, useRef, useCallback } from 'react';
import { YIN } from 'pitchfinder';

interface MicrophonePitchResult {
  isEnabled: boolean;
  error: string | null;
  toggleMicrophone: () => void;
}

export function useMicrophonePitch(
  onNoteOn: (midiNumber: number) => void,
  active: boolean = true,
  onVolumeChange?: (volume: number) => void
): MicrophonePitchResult {
  const [isEnabled, setIsEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastNoteTimeRef = useRef<number>(0);
  const lastDetectedNoteRef = useRef<number | null>(null);
  const dummyAudioRef = useRef<HTMLAudioElement | null>(null);

  const toggleMicrophone = useCallback(async () => {
    if (isEnabled) {
      // Turn off
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (dummyAudioRef.current) {
        dummyAudioRef.current.srcObject = null;
        dummyAudioRef.current = null;
      }
      setIsEnabled(false);
      setError(null);
      return;
    }

    try {
      // Create AudioContext synchronously during the user click event to satisfy iOS Safari
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      // Request microphone and disable iOS voice processing which filters out piano sounds
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });
      streamRef.current = stream;

      // iOS Safari hack: MediaStream must be attached to an audio element to emit data
      // WebKit Bug 212780: https://bugs.webkit.org/show_bug.cgi?id=212780
      const audioEl = new Audio();
      audioEl.muted = true;
      audioEl.srcObject = stream;
      audioEl.play().catch(e => console.warn('iOS audio play hack failed:', e));
      dummyAudioRef.current = audioEl;

      // iOS Safari might suspend the context while waiting for mic permission
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048; 
      analyserRef.current = analyser;
      
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const detectPitch = YIN({ sampleRate: audioCtx.sampleRate, threshold: 0.1 });
      const float32Array = new Float32Array(analyser.fftSize);

      const loop = () => {
        analyser.getFloatTimeDomainData(float32Array);
        
        let rms = 0;
        for (let i = 0; i < float32Array.length; i++) {
          rms += float32Array[i] * float32Array[i];
        }
        rms = Math.sqrt(rms / float32Array.length);

        if (onVolumeChange && Math.random() < 0.1) {
          onVolumeChange(Math.min(100, rms * 1000));
        }

        if (active) {
          const now = Date.now();
          if (rms > 0.005) {
            const frequency = detectPitch(float32Array);
            if (frequency && frequency > 50 && frequency < 3000) {
              const midiNumber = Math.round(12 * (Math.log2(frequency / 440)) + 69);
              if (midiNumber !== lastDetectedNoteRef.current || now - lastNoteTimeRef.current > 400) {
                onNoteOn(midiNumber);
                lastDetectedNoteRef.current = midiNumber;
                lastNoteTimeRef.current = now;
              }
            }
          } else {
             if (now - lastNoteTimeRef.current > 100) {
                lastDetectedNoteRef.current = null;
             }
          }
        }
        
        requestRef.current = requestAnimationFrame(loop);
      };

      requestRef.current = requestAnimationFrame(loop);
      setIsEnabled(true);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not access microphone");
      setIsEnabled(false);
    }
  }, [isEnabled, active, onNoteOn]);

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  return { isEnabled, error, toggleMicrophone };
}
