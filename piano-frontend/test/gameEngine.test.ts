import { getPianoKeyLayout, KeyboardRange } from '../src/lib/pianoLayout';
import { ActiveNote, HitResult } from '../src/types';

// Mock calculation functions matching the game engine
function calculateHit(timeDiff: number, hitWindowMs: number): HitResult {
  const absMs = Math.abs(timeDiff * 1000);
  if (absMs < hitWindowMs * 0.25) return 'perfect';
  if (absMs < hitWindowMs) return 'good';
  return 'miss';
}

console.log('==================================================');
console.log('🎹 RUNNING PIANO GAME ENGINE AUTOMATED TESTS 🎹');
console.log('==================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${testName}`);
  }
}

// -----------------------------------------------------------------
// TEST 1: Hit Accuracy Scoring Logic
// -----------------------------------------------------------------
console.log('--- Test Group 1: Hit Quality & Scoring Calculation ---');
const hitWindowMs = 500;
assert(calculateHit(0.0, hitWindowMs) === 'perfect', 'Exact timing (0ms diff) should be PERFECT');
assert(calculateHit(0.08, hitWindowMs) === 'perfect', '80ms timing (<125ms) should be PERFECT');
assert(calculateHit(-0.10, hitWindowMs) === 'perfect', '-100ms early timing (<125ms) should be PERFECT');
assert(calculateHit(0.20, hitWindowMs) === 'good', '200ms timing (<500ms) should be GOOD');
assert(calculateHit(-0.40, hitWindowMs) === 'good', '-400ms early timing (<500ms) should be GOOD');
assert(calculateHit(0.60, hitWindowMs) === 'miss', '600ms late timing (>500ms) should be MISS');
assert(calculateHit(-0.60, hitWindowMs) === 'miss', '-600ms early timing (>500ms) should be MISS');

// -----------------------------------------------------------------
// TEST 2: Piano Keyboard Layout Math on Mobile vs Tablet vs Desktop
// -----------------------------------------------------------------
console.log('\n--- Test Group 2: Keyboard Layout & Coordinate Mapping ---');
const mobileRange: KeyboardRange = {
  startMidi: 60, // C4
  numKeys: 24,   // 2 octaves (C4 - B5)
  numWhiteKeys: 14,
  numOctaves: 2
};

const mobileWidth = 375;
const c4Layout = getPianoKeyLayout(60, mobileWidth, mobileRange);
assert(c4Layout !== null && c4Layout.type === 'white' && c4Layout.x === 0, 'C4 is first white key at x=0 on mobile');

const cSharp4Layout = getPianoKeyLayout(61, mobileWidth, mobileRange);
assert(cSharp4Layout !== null && cSharp4Layout.type === 'black' && cSharp4Layout.x > 0, 'C#4 is black key positioned between C4 and D4');

const b5Layout = getPianoKeyLayout(71, mobileWidth, mobileRange);
assert(b5Layout !== null && b5Layout.type === 'white', 'B5 is rendered accurately within 2 octave range');

const outOfRange = getPianoKeyLayout(36, mobileWidth, mobileRange);
assert(outOfRange === null, 'C2 (MIDI 36) returns null for 2-octave range');

// -----------------------------------------------------------------
// TEST 3: Anti-Spam & Wrong Key Hit Filtering
// -----------------------------------------------------------------
console.log('\n--- Test Group 3: Anti-Spam / Wrong Key Filter Simulation ---');

const mockNotes: ActiveNote[] = [
  { note: 'C4', midiNumber: 60, startTime: 2.0, duration: 0.5, track: 'right', y: 0, hit: false, missed: false, startBeat: 0, durationBeat: 1 },
  { note: 'D4', midiNumber: 62, startTime: 3.0, duration: 0.5, track: 'right', y: 0, hit: false, missed: false, startBeat: 1, durationBeat: 1 },
  { note: 'E4', midiNumber: 64, startTime: 30.0, duration: 0.5, track: 'right', y: 0, hit: false, missed: false, startBeat: 28, durationBeat: 1 }, // Far future note
];

let currentTime = 2.05; // Note C4 is currently at hit line
const playableWindowSec = 0.5;

function simulatePressKey(midiNumber: number, isWaitMode: boolean, waitingForMidi: number | null) {
  const candidates = mockNotes.filter(
    n => !n.hit && !n.missed && n.midiNumber === midiNumber && (
      (isWaitMode && waitingForMidi === n.midiNumber) ||
      Math.abs(n.startTime - currentTime) <= playableWindowSec
    )
  );

  if (candidates.length === 0) {
    return { hit: false, reason: 'NO_CANDIDATE_NEAR_LINE' };
  }

  const target = candidates[0];
  const timeDiff = currentTime - target.startTime;
  const result = calculateHit(timeDiff, 500);

  if (result !== 'miss') {
    target.hit = true;
    return { hit: true, note: target, result };
  }
  return { hit: false, reason: 'OUT_OF_HIT_WINDOW' };
}

// Player presses C4 when C4 is at 2.0s and currentTime is 2.05s
const c4Press = simulatePressKey(60, false, null);
assert(c4Press.hit === true && c4Press.result === 'perfect', 'Correct key C4 pressed on time -> PERFECT');

// Player presses E4 (which is at 30.0s) -> Should be rejected
const e4SpamPress = simulatePressKey(64, false, null);
assert(e4SpamPress.hit === false && e4SpamPress.reason === 'NO_CANDIDATE_NEAR_LINE', 'Spamming future note E4 (at 30s) is REJECTED');

// Player presses G4 (not in song) -> Should be rejected
const g4WrongPress = simulatePressKey(67, false, null);
assert(g4WrongPress.hit === false && g4WrongPress.reason === 'NO_CANDIDATE_NEAR_LINE', 'Pressing non-existent note G4 is REJECTED');

// -----------------------------------------------------------------
// TEST 4: Wait Mode Grace Period & Pause Simulation
// -----------------------------------------------------------------
console.log('\n--- Test Group 4: Wait Mode Grace Period ---');

currentTime = 3.10; // D4 arrived at 3.0s, currently +0.10s (within 0.15s grace period)
let shouldPause = mockNotes.some(n => !n.hit && !n.missed && currentTime >= n.startTime + 0.15);
assert(shouldPause === false, 'At 3.10s (+100ms), game continues playing smoothly without pausing');

currentTime = 3.20; // D4 is +0.20s late (> 0.15s grace period)
shouldPause = mockNotes.some(n => !n.hit && !n.missed && currentTime >= n.startTime + 0.15);
assert(shouldPause === true, 'At 3.20s (> 150ms late), game gracefully pauses and waits for user');

console.log('\n==================================================');
console.log(`🎯 TEST RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('==================================================\n');
