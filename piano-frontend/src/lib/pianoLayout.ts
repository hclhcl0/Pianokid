export const KEY_TO_MIDI: Record<string, number> = {
  a: 48, w: 49, s: 50, e: 51, d: 52, f: 53, t: 54, g: 55, y: 56, h: 57, u: 58, j: 59,
  k: 60, o: 61, l: 62, p: 63, ';': 64, "'": 65, z: 67, x: 69, c: 71, v: 72,
};

export const MIDI_TO_KEY: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_TO_MIDI).map(([key, value]) => [value, key.toUpperCase()])
);

export interface KeyLayout {
  type: 'white' | 'black';
  x: number;
  width: number;
  centerX: number;
}

// ─── Dynamic keyboard range (có thể thay đổi runtime) ────────────────────────
export interface KeyboardRange {
  startMidi: number;  // MIDI number của phím đầu tiên (luôn là C)
  numKeys: number;    // Tổng số phím
  numOctaves: number;
  numWhiteKeys: number;
}

/**
 * Tính số quãng tối ưu dựa trên chiều rộng màn hình.
 * Đảm bảo phím trắng rộng ≥ minWhiteKeyPx để ngón tay bấm thoải mái.
 */
export function calcOptimalOctaves(screenWidth: number, minWhiteKeyPx = 42): number {
  for (let oct = 2; oct <= 5; oct++) {
    const whites = oct * 7 + 1;
    if (screenWidth / whites >= minWhiteKeyPx) continue; // còn thoải mái → thêm quãng
    return Math.max(2, oct - 1); // quãng trước đó là tối đa thoải mái
  }
  return 5; // màn hình rộng → 5 quãng
}

/**
 * Tạo KeyboardRange căn giữa bài nhạc.
 * @param songMidiMin  nốt MIDI thấp nhất trong bài
 * @param songMidiMax  nốt MIDI cao nhất trong bài
 * @param numOctaves   số quãng muốn hiển thị
 */
export function buildKeyboardRange(
  songMidiMin: number,
  songMidiMax: number,
  numOctaves: number
): KeyboardRange {
  const numKeys = numOctaves * 12 + 1; // +1 cho nốt C cuối
  const numWhiteKeys = numOctaves * 7 + 1;

  // Căn giữa: mid của bài nằm giữa keyboard
  const songMid = Math.round((songMidiMin + songMidiMax) / 2);
  const keyboardMid = Math.round(numKeys / 2);

  // Điều chỉnh startMidi sao cho là C (mod 12 == 0)
  let startMidi = songMid - keyboardMid;
  // Snap về C gần nhất
  const remainder = startMidi % 12;
  if (remainder !== 0) startMidi -= remainder; // làm tròn xuống C

  // Clamp: đảm bảo tất cả nốt của bài đều nằm trong keyboard
  while (startMidi > songMidiMin) startMidi -= 12;
  while (startMidi + numKeys - 1 < songMidiMax) startMidi += 12;
  // Nếu vẫn không chứa hết (bài rộng hơn keyboard), ưu tiên melody
  startMidi = Math.max(0, Math.min(startMidi, 108 - numKeys));
  // Snap về C
  const r2 = startMidi % 12;
  if (r2 !== 0) startMidi -= r2;
  startMidi = Math.max(0, startMidi);

  return { startMidi, numKeys, numOctaves, numWhiteKeys };
}

// ─── Default range (fallback khi chưa load bài) ──────────────────────────────
export const DEFAULT_RANGE: KeyboardRange = {
  startMidi: 36, // C2
  numKeys: 61,
  numOctaves: 5,
  numWhiteKeys: 36,
};

// Giữ lại export cũ để không vỡ code khác
export const START_MIDI = 36;
export const NUM_KEYS = 61;
export const NUM_OCTAVES = 5;
export const NUM_WHITE_KEYS = 36;

// ─── Layout calculation ───────────────────────────────────────────────────────
const notesInOctave = [
  { type: 'white', whiteIndex: 0 }, // C
  { type: 'black', whiteIndex: 0 }, // C#
  { type: 'white', whiteIndex: 1 }, // D
  { type: 'black', whiteIndex: 1 }, // D#
  { type: 'white', whiteIndex: 2 }, // E
  { type: 'white', whiteIndex: 3 }, // F
  { type: 'black', whiteIndex: 3 }, // F#
  { type: 'white', whiteIndex: 4 }, // G
  { type: 'black', whiteIndex: 4 }, // G#
  { type: 'white', whiteIndex: 5 }, // A
  { type: 'black', whiteIndex: 5 }, // A#
  { type: 'white', whiteIndex: 6 }, // B
] as const;

export function getPianoKeyLayout(
  midiNumber: number,
  canvasWidth: number,
  range: KeyboardRange = DEFAULT_RANGE
): KeyLayout | null {
  const { startMidi, numOctaves, numWhiteKeys } = range;
  const whiteKeyWidth = canvasWidth / numWhiteKeys;

  const offset = midiNumber - startMidi;
  if (offset < 0 || offset >= numOctaves * 12 + 1) return null;

  const octave = Math.floor(offset / 12);
  const semitone = offset % 12;
  const noteInfo = notesInOctave[semitone];
  const absoluteWhiteIndex = octave * 7 + noteInfo.whiteIndex;

  if (noteInfo.type === 'white') {
    return {
      type: 'white',
      x: absoluteWhiteIndex * whiteKeyWidth,
      width: whiteKeyWidth,
      centerX: absoluteWhiteIndex * whiteKeyWidth + whiteKeyWidth / 2,
    };
  } else {
    const blackKeyWidth = whiteKeyWidth * 0.6;
    const x = absoluteWhiteIndex * whiteKeyWidth + whiteKeyWidth - blackKeyWidth / 2;
    return {
      type: 'black',
      x,
      width: blackKeyWidth,
      centerX: x + blackKeyWidth / 2,
    };
  }
}
