/**
 * Piano Sampler — Web Audio API thuần, không dùng Tone.js
 * Load 11 nốt mẫu Salamander (C2–C7), pitch-shift cho các nốt còn lại.
 * Salamander Grand Piano = tiếng Yamaha C5 Grand thật.
 */

// ─── Sample points trong dải 61 phím ────────────────────────────────────────
const SAMPLES: { note: string; midi: number }[] = [
  { note: 'C2',  midi: 36 },
  { note: 'A2',  midi: 45 },
  { note: 'C3',  midi: 48 },
  { note: 'F3',  midi: 53 },
  { note: 'A3',  midi: 57 },
  { note: 'C4',  midi: 60 },
  { note: 'F4',  midi: 65 },
  { note: 'A4',  midi: 69 },
  { note: 'C5',  midi: 72 },
  { note: 'F5',  midi: 77 },
  { note: 'A5',  midi: 81 },
  { note: 'C6',  midi: 84 },
  { note: 'A6',  midi: 93 },
  { note: 'C7',  midi: 96 },
];

const BASE_URL = 'https://tonejs.github.io/audio/salamander/';

// ─── State ───────────────────────────────────────────────────────────────────
let _ctx: AudioContext | null = null;
const _buffers = new Map<number, AudioBuffer>();   // midi → decoded buffer
let _loaded = false;
let _loading = false;

// ─── Core loader ─────────────────────────────────────────────────────────────
async function loadSamples(): Promise<void> {
  if (_loading || _loaded) return;
  _loading = true;

  try {
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === 'suspended') await _ctx.resume();

    await Promise.all(
      SAMPLES.map(async ({ note, midi }) => {
        try {
          const res = await fetch(`${BASE_URL}${note}.mp3`);
          const arr = await res.arrayBuffer();
          const buf = await _ctx!.decodeAudioData(arr);
          _buffers.set(midi, buf);
        } catch (e) {
          console.warn(`[Piano] Could not load sample ${note}:`, e);
        }
      })
    );

    _loaded = true;
    console.log(`[Piano] ✓ ${_buffers.size} samples loaded (Salamander Grand)`);
  } catch (e) {
    console.error('[Piano] Load failed:', e);
  } finally {
    _loading = false;
  }
}

// ─── Find nearest sample + compute pitch ratio ────────────────────────────────
function getNearestSample(midi: number): { buffer: AudioBuffer; rate: number } | null {
  if (_buffers.size === 0) return null;

  let bestMidi = -1;
  let bestDist = Infinity;
  _buffers.forEach((_, m) => {
    const d = Math.abs(m - midi);
    if (d < bestDist) { bestDist = d; bestMidi = m; }
  });

  const buffer = _buffers.get(bestMidi);
  if (!buffer) return null;

  const rate = Math.pow(2, (midi - bestMidi) / 12);
  return { buffer, rate };
}

// ─── Oscillator fallback (khi chưa load xong) ────────────────────────────────
function playOsc(midi: number): void {
  try {
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === 'suspended') _ctx.resume();
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc  = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.type   = 'triangle';
    osc.frequency.value = freq;
    const t = _ctx.currentTime;
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc.connect(gain);
    gain.connect(_ctx.destination);
    osc.start(t); osc.stop(t + 1.2);
  } catch (_) {}
}

// ─── Currently playing nodes (for stopNote) ──────────────────────────────────
const _active = new Map<number, { src: AudioBufferSourceNode; gain: GainNode }>();

// ─── Public API ──────────────────────────────────────────────────────────────
class SoundEffects {
  /**
   * Gọi khi có user-gesture đầu tiên (click / keydown).
   * AudioContext chỉ được tạo/resume sau gesture — yêu cầu của trình duyệt.
   */
  init(): void {
    if (typeof window === 'undefined') return;
    // Tạo context nếu chưa có (trong gesture → không bị suspend)
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    loadSamples().catch(console.error);
  }

  playPianoNote(midi: number, velocityGain = 0.85): void {
    if (typeof window === 'undefined') return;

    // Bắt đầu load nếu chưa (lần đầu bấm phím)
    if (!_loading && !_loaded) loadSamples().catch(console.error);

    if (!_loaded || !_ctx) {
      playOsc(midi);
      return;
    }

    try {
      if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});

      const sample = getNearestSample(midi);
      if (!sample) { playOsc(midi); return; }

      // Dừng nốt cũ nếu đang giữ cùng phím
      const prev = _active.get(midi);
      if (prev) {
        prev.gain.gain.setTargetAtTime(0, _ctx.currentTime, 0.01);
        setTimeout(() => { try { prev.src.stop(); } catch (_) {} }, 50);
        _active.delete(midi);
      }

      const { buffer, rate } = sample;
      const src  = _ctx.createBufferSource();
      const gain = _ctx.createGain();

      src.buffer = buffer;
      src.playbackRate.value = rate;

      // Envelope: attack nhanh, decay tự nhiên của đàn thật
      const now = _ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(velocityGain, now + 0.005); // 5ms attack
      gain.gain.exponentialRampToValueAtTime(0.001, now + 4);       // ~4s decay

      // Sơ đồ: src → gain → compressor → destination
      src.connect(gain);
      gain.connect(_ctx.destination);
      src.start(now);
      src.stop(now + 4.1);

      _active.set(midi, { src, gain });
      src.onended = () => _active.delete(midi);
    } catch (e) {
      playOsc(midi);
    }
  }

  stopNote(midi: number): void {
    const node = _active.get(midi);
    if (!node || !_ctx) return;
    const t = _ctx.currentTime;
    node.gain.gain.setTargetAtTime(0, t, 0.05); // fade out 50ms
    setTimeout(() => { try { node.src.stop(); } catch (_) {} _active.delete(midi); }, 200);
  }

  playMiss(): void {
    playOsc(40); // thud thấp
  }

  playVictory(): void {
    [60, 64, 67, 72].forEach((n, i) => setTimeout(() => this.playPianoNote(n), i * 130));
  }

  playComboMilestone(combo: number): void {
    const n = Math.min(60 + Math.floor(combo / 5) * 2, 84);
    this.playPianoNote(n);
    setTimeout(() => this.playPianoNote(n + 7), 80);
  }

  dispose(): void {
    _active.forEach(({ src }) => {
      try { src.stop(); } catch (_) {}
    });
    _active.clear();
    if (_ctx) { _ctx.close().catch(() => {}); _ctx = null; }
    _buffers.clear();
    _loaded = false;
    _loading = false;
  }
}

export const soundEffects = new SoundEffects();
