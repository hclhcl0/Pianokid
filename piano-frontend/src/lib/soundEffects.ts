import { Soundfont } from 'smplr';

class SoundEffects {
  context: AudioContext | null = null;
  piano: any = null;
  isLoaded = false;
  isLoading = false;

  init(): void {
    if (typeof window === 'undefined') return;
    
    if (!this.context) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.context = new Ctx();
    }
    
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }

    if (!this.piano && !this.isLoading) {
      this.isLoading = true;
      console.log('[Piano] Loading Musescore-quality Soundfont (MusyngKite)...');
      
      this.piano = new Soundfont(this.context, { 
        instrument: 'acoustic_grand_piano',
        kit: 'MusyngKite' 
      });
      
      // smplr returns a promise on .loaded()
      if (this.piano.loaded) {
        this.piano.loaded().then(() => {
          this.isLoaded = true;
          this.isLoading = false;
          console.log('[Piano] Soundfont loaded successfully!');
        }).catch((e: any) => {
          console.error('[Piano] Failed to load Soundfont:', e);
          this.isLoading = false;
        });
      } else {
        // Fallback if .loaded() doesn't exist
        this.isLoaded = true;
        this.isLoading = false;
      }
    }
  }

  playPianoNote(midi: number, velocityGain = 0.85): void {
    if (typeof window === 'undefined') return;
    
    this.init();
    
    if (!this.isLoaded || !this.piano) {
      // Fallback simple oscillator while loading
      this.playOscFallback(midi);
      return;
    }

    this.piano.start({
      note: midi,
      velocity: Math.floor(velocityGain * 127)
    });
  }

  stopNote(midi: number): void {
    if (!this.isLoaded || !this.piano) return;
    this.piano.stop({ note: midi });
  }

  playOscFallback(midi: number): void {
    try {
      if (!this.context) return;
      if (this.context.state === 'suspended') this.context.resume();
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = this.context.currentTime;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      osc.connect(gain);
      gain.connect(this.context.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    } catch (_) {}
  }

  playMiss(): void {
    this.playOscFallback(40);
  }

  playVictory(): void {
    [60, 64, 67, 72].forEach((n, i) => setTimeout(() => this.playPianoNote(n, 0.8), i * 130));
  }

  playComboMilestone(combo: number): void {
    const n = Math.min(60 + Math.floor(combo / 5) * 2, 84);
    this.playPianoNote(n, 0.9);
    setTimeout(() => this.playPianoNote(n + 7, 0.9), 80);
  }

  dispose(): void {
    if (this.piano) {
      try { this.piano.stop(); } catch(e) {}
    }
    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
    }
    this.piano = null;
    this.isLoaded = false;
    this.isLoading = false;
  }
}

export const soundEffects = new SoundEffects();
