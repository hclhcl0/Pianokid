// src/lib/notesToVexflow.ts
// Converts NoteEvent[] (time-based) → SheetMeasure[] (VexFlow notation data)

import type { NoteEvent } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SheetNote {
  keys:         string[];   // VexFlow key strings e.g. ['c/4','e/4']
  accidentals:  string[];   // '#' | 'b' | '' per key (parallel to keys)
  duration:     string;     // VexFlow: 'w','h','q','8','16' + 'r' suffix for rest
  dotted:       boolean;
  isRest:       boolean;
  midiNumbers:  number[];   // original MIDI numbers – for hit highlight
  gridStart:    number;     // 16th-note position inside measure (0-based)
  gridLength:   number;     // 16th-note length
}

export interface SheetMeasure {
  index:     number;
  startTime: number;   // seconds
  endTime:   number;
  treble:    SheetNote[];   // right hand → treble clef
  bass:      SheetNote[];   // left hand  → bass clef
}

// ── MIDI → VexFlow key ────────────────────────────────────────────────────

const SHARP_NAMES = ['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'] as const;

export function midiToVexKey(midi: number): { key: string; acc: string } {
  const octave = Math.floor(midi / 12) - 1;
  const idx    = midi % 12;
  const name   = SHARP_NAMES[idx];
  const acc    = name.length > 1 ? '#' : '';
  return { key: `${name}/${octave}`, acc };
}

// ── Duration mapping ───────────────────────────────────────────────────────

const SNAP = [1, 2, 3, 4, 6, 8, 12, 16] as const;
type Snap = typeof SNAP[number];

function nearest(n: number): Snap {
  // Always round down so we never exceed the Voice's total tick limit
  const possible = SNAP.filter(s => s <= n);
  return (possible.length > 0 ? possible[possible.length - 1] : 1) as Snap;
}

const DUR_MAP: Record<Snap, { dur: string; dotted: boolean }> = {
  16: { dur: 'w',  dotted: false },
  12: { dur: 'h',  dotted: true  },
   8: { dur: 'h',  dotted: false },
   6: { dur: 'q',  dotted: true  },
   4: { dur: 'q',  dotted: false },
   3: { dur: '8',  dotted: true  },
   2: { dur: '8',  dotted: false },
   1: { dur: '16', dotted: false },
};

function toVexDur(cells: number): { dur: string; dotted: boolean; consumedCells: number } {
  const actualCells = nearest(cells);
  return { ...DUR_MAP[actualCells], consumedCells: actualCells };
}

// ── Voice builder ──────────────────────────────────────────────────────────
// Builds an array of SheetNote covering exactly [mStartBeat, mEndBeat).
// Uses a 16th-note grid so rhythms snap cleanly.

function buildVoice(
  noteEvents: NoteEvent[],
  mStartBeat: number,
  mEndBeat: number,
  clef: 'treble' | 'bass',
): SheetNote[] {
  // Total 16th notes in this measure
  const totalCells = Math.round((mEndBeat - mStartBeat) * 4);
  const safe = Math.max(4, Math.min(64, totalCells));

  // Grid: grid[cell] = notes starting at that 16th position (0 = first 16th of measure)
  const grid: NoteEvent[][] = Array.from({ length: safe }, () => []);

  for (const n of noteEvents) {
    // Use startBeat if available (from MIDI service), otherwise estimate from time
    const beatPos = n.startBeat !== undefined ? n.startBeat : n.startTime * 2;
    const cellIdx = Math.round((beatPos - mStartBeat) * 4);
    if (cellIdx >= 0 && cellIdx < safe) {
      grid[cellIdx].push(n);
    }
  }

  const result: SheetNote[] = [];
  let i = 0;

  while (i < safe) {
    if (grid[i].length > 0) {
      const chord = grid[i];

      // Duration of this chord in 16th-note cells
      const durBeat = chord[0].durationBeat !== undefined
        ? chord[0].durationBeat
        : chord[0].duration * 2; // fallback: assume tempo~120
      const mainDurCells = Math.max(1, Math.round(durBeat * 4));

      // Find where next note starts (or end of measure)
      let j = i + 1;
      while (j < safe && grid[j].length === 0) j++;

      // Length of this note = min(duration, gap until next note)
      const len = Math.min(mainDurCells, j - i);
      const clampedLen = Math.min(len, safe - i);

      const { dur, dotted, consumedCells } = toVexDur(clampedLen);

      // Sort chord low→high by MIDI number for correct VexFlow stacking, and deduplicate
      const uniqueMidis = new Set<number>();
      const sorted = [...chord]
        .filter(n => {
          if (uniqueMidis.has(n.midiNumber)) return false;
          uniqueMidis.add(n.midiNumber);
          return true;
        })
        .sort((a, b) => a.midiNumber - b.midiNumber);
        
      const vexKeys = sorted.map(n => midiToVexKey(n.midiNumber));

      result.push({
        keys:        vexKeys.map(k => k.key),
        accidentals: vexKeys.map(k => k.acc),
        duration:    dur,
        dotted,
        isRest:      false,
        midiNumbers: sorted.map(n => n.midiNumber),
        gridStart:   i,
        gridLength:  consumedCells,
      });
      i += consumedCells;
    } else {
      // Rest – find consecutive empties
      let j = i + 1;
      while (j < safe && grid[j].length === 0) j++;
      const len = Math.min(j - i, safe - i);
      const { dur, dotted, consumedCells } = toVexDur(len);
      const restKey = clef === 'treble' ? 'b/4' : 'd/3';
      result.push({
        keys:        [restKey],
        accidentals: [''],
        duration:    dur + 'r',
        dotted,
        isRest:      true,
        midiNumbers: [],
        gridStart:   i,
        gridLength:  consumedCells,
      });
      i += consumedCells;
    }
  }

  return result;
}

// ── Main export ────────────────────────────────────────────────────────────

export function buildSheetMeasures(
  notes: NoteEvent[],
  tempo: number,
  timeSignature = '4/4',
): SheetMeasure[] {
  if (!notes.length) return [];

  const [beatsPerMeasure] = timeSignature.split('/').map(Number);
  const mDurSec = beatsPerMeasure * (60 / tempo);

  // Normalise: ensure startBeat and durationBeat exist
  const processedNotes = notes.map(n => ({
    ...n,
    startBeat:    n.startBeat    !== undefined ? n.startBeat    : n.startTime * (tempo / 60),
    durationBeat: n.durationBeat !== undefined ? n.durationBeat : n.duration  * (tempo / 60),
  }));

  const minBeat = Math.min(...processedNotes.map(n => n.startBeat!));
  const maxBeat = Math.max(...processedNotes.map(n => n.startBeat! + n.durationBeat!));

  // Start from the measure containing the first note (skip empty lead-in)
  const firstMeasure = Math.floor(minBeat / beatsPerMeasure);
  const count = Math.ceil(maxBeat / beatsPerMeasure) + 1;

  const right = processedNotes.filter(n => n.track === 'right');
  const left  = processedNotes.filter(n => n.track === 'left');

  const totalMeasures = count - firstMeasure;

  return Array.from({ length: totalMeasures }, (_, i) => {
    const m = firstMeasure + i;
    const mSBeat = m * beatsPerMeasure;
    const mEBeat = mSBeat + beatsPerMeasure;

    return {
      index:     m,   // ABSOLUTE index — must match scroll formula in VexFlowView
      startTime: m * mDurSec,
      endTime:   (m + 1) * mDurSec,
      treble: buildVoice(
        right.filter(n => {
          const b4 = Math.round(n.startBeat! * 4);
          return b4 >= Math.round(mSBeat * 4) && b4 < Math.round(mEBeat * 4);
        }),
        mSBeat, mEBeat, 'treble',
      ),
      bass: buildVoice(
        left.filter(n => {
          const b4 = Math.round(n.startBeat! * 4);
          return b4 >= Math.round(mSBeat * 4) && b4 < Math.round(mEBeat * 4);
        }),
        mSBeat, mEBeat, 'bass',
      ),
    };
  });
}
