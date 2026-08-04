export interface NoteEvent {
  note: string;
  midiNumber: number;
  startTime: number;
  duration: number;
  startBeat: number;
  durationBeat: number;
  track: 'left' | 'right';
  role?: 'root' | 'chord_tone'; // tùy chọn, dùng để lọc chế độ hợp âm
}

export interface GameConfig {
  fallSpeed: number;
  lookAheadTime: number;
  hitWindowMs: number;
  waitMode: boolean;
  sheetMusicEngine: 'osmd' | 'vexflow';
  autoPlay?: boolean;
  showFingering?: boolean; // Hiện số ngón tay trên phím đàn
  speed: number;
}

// Bản đồ ngón tay chuẩn theo gam Đô trưởng (C major) — nền tảng dạy piano cho người mới
// Tay phải lên: C=1, D=2, E=3, [ngón cái chui qua] F=1, G=2, A=3, B=4
// Tay trái  lên: C=5, D=4, E=3, F=2, G=1, [ngón giữa chui qua] A=3, B=2
// Phím đen: dùng ngón 2, 3, 4 (không bao giờ dùng ngón cái bấm phím đen)
export const FINGERING_MAP: Record<number, [number, number]> = {
  0:  [5, 1], // C  — LH: út (5),    RH: cái (1)
  1:  [3, 2], // C# — LH: giữa (3),  RH: trỏ (2)  [phím đen]
  2:  [4, 2], // D  — LH: áp út (4), RH: trỏ (2)
  3:  [2, 3], // D# — LH: trỏ (2),   RH: giữa (3) [phím đen]
  4:  [3, 3], // E  — LH: giữa (3),  RH: giữa (3)
  5:  [2, 1], // F  — LH: trỏ (2),   RH: cái (1)  ← RH ngón cái chui qua sau E
  6:  [4, 2], // F# — LH: áp út (4), RH: trỏ (2)  [phím đen]
  7:  [1, 2], // G  — LH: cái (1),   RH: trỏ (2)  ← LH ngón cái chui qua sau F
  8:  [3, 3], // G# — LH: giữa (3),  RH: giữa (3) [phím đen]
  9:  [3, 3], // A  — LH: giữa (3),  RH: giữa (3) ← LH ngón giữa chui qua sau cái
  10: [2, 4], // A# — LH: trỏ (2),   RH: áp út (4)[phím đen]
  11: [2, 4], // B  — LH: trỏ (2),   RH: áp út (4)
};

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
  sheetMusicUrl?: string;
  tempo: number;
  thumbnail?: string;
  description?: string;
  isPublished?: boolean;
}
