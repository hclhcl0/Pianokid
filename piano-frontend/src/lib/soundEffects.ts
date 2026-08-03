export class SoundEffects {
  private audioCtx: AudioContext | null = null;
  private sampler: any = null; // Use any to avoid importing Tone types
  private isLoaded = false;
  private Tone: any = null;
  private initStarted = false;

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (this.initStarted) return;
    this.initStarted = true;

    try {
      // Use dynamic import to completely bypass Webpack 5 static ESM re-export bugs
      const ToneModule = await import('tone');
      this.Tone = ToneModule;
      
      this.sampler = new this.Tone.Sampler({
        urls: {
          A0: "A0.mp3",
          C1: "C1.mp3",
          "D#1": "Ds1.mp3",
          "F#1": "Fs1.mp3",
          A1: "A1.mp3",
          C2: "C2.mp3",
          "D#2": "Ds2.mp3",
          "F#2": "Fs2.mp3",
          A2: "A2.mp3",
          C3: "C3.mp3",
          "D#3": "Ds3.mp3",
          "F#3": "Fs3.mp3",
          A3: "A3.mp3",
          C4: "C4.mp3",
          "D#4": "Ds4.mp3",
          "F#4": "Fs4.mp3",
          A4: "A4.mp3",
          C5: "C5.mp3",
          "D#5": "Ds5.mp3",
          "F#5": "Fs5.mp3",
          A5: "A5.mp3",
          C6: "C6.mp3",
          "D#6": "Ds6.mp3",
          "F#6": "Fs6.mp3",
          A6: "A6.mp3",
          C7: "C7.mp3",
          "D#7": "Ds7.mp3",
          "F#7": "Fs7.mp3",
          A7: "A7.mp3",
          C8: "C8.mp3"
        },
        release: 1,
        baseUrl: "https://tonejs.github.io/audio/salamander/",
        onload: () => {
          this.isLoaded = true;
        }
      }).toDestination();
    } catch (e) {
      console.error("Failed to load Tone.js dynamically", e);
    }
  }

  private playTone(frequency: number, duration: number, type: OscillatorType, gainValue: number, startTimeOffset = 0): void {
    if (!this.audioCtx) return;

    const oscillator = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    const startTime = this.audioCtx.currentTime + startTimeOffset;
    
    // Envelope
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(gainValue, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  playPianoNote(midiNumber: number): void {
    if (typeof window === 'undefined') return;
    
    // Trigger initialization but don't block
    if (!this.initStarted) {
      this.init();
    }

    if (this.Tone && this.Tone.getContext && this.Tone.getContext().state !== 'running') {
      this.Tone.start();
    }

    if (this.isLoaded && this.sampler && this.Tone) {
      // Use real piano samples
      const noteName = this.Tone.Frequency(midiNumber, "midi").toNote();
      this.sampler.triggerAttackRelease(noteName, "2n");
    } else {
      // Fallback: Synthesized tone while loading samples (or if Tone failed to load)
      const frequency = 440 * Math.pow(2, (midiNumber - 69) / 12);
      this.playTone(frequency, 0.6, 'triangle', 0.5, 0);
    }
  }

  playMiss(): void {
    if (typeof window === 'undefined') return;
    if (!this.initStarted) this.init();
    // Low thud
    this.playTone(100, 0.1, 'sawtooth', 0.1, 0);
  }

  playVictory(): void {
    if (typeof window === 'undefined') return;
    if (!this.initStarted) this.init();
    // Ascending arpeggio C4-E4-G4-C5
    const duration = 0.1;
    this.playTone(261.63, duration, 'triangle', 0.2, 0);
    this.playTone(329.63, duration, 'triangle', 0.2, duration);
    this.playTone(392.00, duration, 'triangle', 0.2, duration * 2);
    this.playTone(523.25, duration * 3, 'triangle', 0.2, duration * 3);
  }

  playComboMilestone(combo: number): void {
    if (typeof window === 'undefined') return;
    if (!this.initStarted) this.init();
    const baseFreq = 440;
    const multiplier = Math.min(3, 1 + (combo / 50));
    this.playTone(baseFreq * multiplier, 0.2, 'square', 0.1, 0);
    this.playTone(baseFreq * multiplier * 1.5, 0.3, 'square', 0.1, 0.1);
  }
}

export const soundEffects = new SoundEffects();
