export interface NoteEvent {
  note: string;
  midiNumber: number;
  startTime: number;
  duration: number;
  track: 'left' | 'right';
  role?: 'root' | 'chord_tone'; // tùy chọn, dùng để lọc chế độ hợp âm
}

export interface GameConfig {
  fallSpeed: number;
  lookAheadTime: number;
  hitWindowMs: number;
  waitMode: boolean;
  autoPlay?: boolean;
}

export type HitResult = 'perfect' | 'good' | 'miss';

export interface ActiveNote extends NoteEvent {
  y: number;
  hit: boolean;
  missed: boolean;
  isWaiting?: boolean; // true = game is paused waiting for THIS note in Wait Mode
  isHeld?: boolean; // Người chơi đang giữ phím
}

export interface GameState {
  isPlaying: boolean;
  isPaused: boolean;
  score: number;
  combo: number;
  stars: number;
  currentTime: number;
}

export interface MidiInputEvent {
  midiNumber: number;
  velocity: number;
  timestamp: number;
}

export interface Lesson {
  id: string;
  title: string;
  level: number;
  midiJsonUrl: string;
  midiFileUrl?: string;
  tempo: number;
  thumbnail?: string;
  description?: string;
  isPublished?: boolean;
}
