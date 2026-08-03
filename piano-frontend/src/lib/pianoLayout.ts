export interface KeyLayout {
  type: 'white' | 'black';
  x: number;
  width: number;
  centerX: number;
}

export const START_MIDI = 48; // C3
export const NUM_OCTAVES = 3;
export const NUM_KEYS = NUM_OCTAVES * 12;
export const NUM_WHITE_KEYS = NUM_OCTAVES * 7;

export function getPianoKeyLayout(midiNumber: number, canvasWidth: number): KeyLayout | null {
  const whiteKeyWidth = canvasWidth / NUM_WHITE_KEYS;
  
  // Mapping of 12 semitones to their visual layout position within an octave
  const notesInOctave = [
    { type: 'white', whiteIndex: 0 }, // 0: C
    { type: 'black', whiteIndex: 0 }, // 1: C# (drawn after C, overlapping C and D)
    { type: 'white', whiteIndex: 1 }, // 2: D
    { type: 'black', whiteIndex: 1 }, // 3: D#
    { type: 'white', whiteIndex: 2 }, // 4: E
    { type: 'white', whiteIndex: 3 }, // 5: F
    { type: 'black', whiteIndex: 3 }, // 6: F#
    { type: 'white', whiteIndex: 4 }, // 7: G
    { type: 'black', whiteIndex: 4 }, // 8: G#
    { type: 'white', whiteIndex: 5 }, // 9: A
    { type: 'black', whiteIndex: 5 }, // 10: A#
    { type: 'white', whiteIndex: 6 }, // 11: B
  ];
  
  const offset = midiNumber - START_MIDI;
  if (offset < 0 || offset >= NUM_OCTAVES * 12) {
    return null; // Note is outside our visible 2-octave range
  }

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
    // Black keys are typically narrower (about 60% of a white key's width) 
    // and placed exactly on the boundary between two white keys.
    const blackKeyWidth = whiteKeyWidth * 0.6;
    const x = absoluteWhiteIndex * whiteKeyWidth + whiteKeyWidth - (blackKeyWidth / 2);
    return {
      type: 'black',
      x,
      width: blackKeyWidth,
      centerX: x + blackKeyWidth / 2,
    };
  }
}
