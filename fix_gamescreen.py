import re

with open("d:/tk WEB/Piano/piano-frontend/src/components/GameScreen.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Define displayNotes useMemo before handleStart
use_memo_code = """
  const displayNotes = useMemo(() => {
    let processedNotes = [...loadedNotes];

    const rightNotesMidi = loadedNotes.filter(n => n.track === 'right').map(n => n.midiNumber);
    if (rightNotesMidi.length > 0 && chordMode === 'full') {
      const melodyMin = Math.min(...rightNotesMidi);
      const idealBassMax = melodyMin - 1;
      const idealBassMin = melodyMin - 13;

      processedNotes = processedNotes.map(n => {
        if (n.track !== 'left') return n;
        let midi = n.midiNumber;
        while (midi < idealBassMin && midi + 12 <= idealBassMax) midi += 12;
        while (midi > idealBassMax && midi - 12 >= idealBassMin) midi -= 12;
        if (midi === n.midiNumber) return n;
        return {
          ...n,
          midiNumber: midi,
          note: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12] + Math.floor(midi / 12 - 1),
        };
      });
    }

    if (chordMode === 'arpeggio') {
      const leftNotes = loadedNotes.filter(n => n.track === 'left');
      const rightNotes = loadedNotes.filter(n => n.track === 'right');
      const startTimes = Array.from(new Set(leftNotes.map(n => n.startTime))).sort((a, b) => a - b);
      const newLeftNotes: NoteEvent[] = [];
      startTimes.forEach(t => {
        const chord = leftNotes.filter(n => n.startTime === t).sort((a, b) => a.midiNumber - b.midiNumber);
        const root  = chord[0];
        const third = chord[1] ?? chord[0];
        const fifth = chord[2] ?? chord[1] ?? chord[0];
        const totalDuration = root.duration;
        const ts = timeSignature;

        if (ts === '2/4') {
          const step = totalDuration / 2;
          newLeftNotes.push({ ...root,  startTime: t,          duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step,   duration: step });
        } else if (ts === '3/4') {
          const step = totalDuration / 3;
          newLeftNotes.push({ ...root,  startTime: t,            duration: step });
          newLeftNotes.push({ ...third, startTime: t + step,     duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step * 2, duration: step });
        } else if (ts === '6/8') {
          const step = totalDuration / 6;
          newLeftNotes.push({ ...root,  startTime: t,            duration: step });
          newLeftNotes.push({ ...third, startTime: t + step,     duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step * 2, duration: step });
          newLeftNotes.push({ ...root,  startTime: t + step * 3, duration: step });
          newLeftNotes.push({ ...third, startTime: t + step * 4, duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step * 5, duration: step });
        } else {
          const step = totalDuration / 4;
          newLeftNotes.push({ ...root,  startTime: t,            duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step,     duration: step });
          newLeftNotes.push({ ...third, startTime: t + step * 2, duration: step });
          newLeftNotes.push({ ...fifth, startTime: t + step * 3, duration: step });
        }
      });
      processedNotes = [...rightNotes, ...newLeftNotes];
    }

    return processedNotes.filter(note => {
      if (note.track === 'left' && chordMode === 'simple' && note.role === 'chord_tone') return false;
      return true;
    });
  }, [loadedNotes, chordMode, timeSignature]);

  const handleStart = useCallback(() => {
    if (loadedNotes.length === 0) return;
    soundEffects.init();
"""

pattern1 = r"  const handleStart = useCallback\(\(\) => \{\n    if \(loadedNotes\.length === 0\) return;\n    soundEffects\.init\(\);\n    \n    let processedNotes = \[\.\.\.loadedNotes\];.*?processedNotes = \[\.\.\.rightNotes, \.\.\.newLeftNotes\];\n    \}"
content = re.sub(pattern1, use_memo_code, content, flags=re.DOTALL)


# 2. Update finalNotes logic
pattern2 = r"    const finalNotes = processedNotes\n      \.filter\(note => \{\n        if \(note\.track === 'left' && chordMode === 'simple' && note\.role === 'chord_tone'\) return false;\n        return true;\n      \}\)\n      \.map\(note => \(\{"
replacement2 = r"""    const finalNotes = displayNotes.map(note => ({"""
content = re.sub(pattern2, replacement2, content, flags=re.DOTALL)

# 3. Update VexFlowView and SheetView notes prop
pattern3 = r"SheetView notes=\{loadedNotes\}"
replacement3 = r"SheetView notes={displayNotes}"
content = re.sub(pattern3, replacement3, content)

pattern4 = r"VexFlowView notes=\{loadedNotes\}"
replacement4 = r"VexFlowView notes={displayNotes}"
content = re.sub(pattern4, replacement4, content)

# Update dependencies of handleStart
pattern5 = r"\}, \[loadedNotes, chordMode, speed, config, startGame, timeSignature\]\);"
replacement5 = r"}, [loadedNotes, displayNotes, speed, config, startGame]);"
content = re.sub(pattern5, replacement5, content)

with open("d:/tk WEB/Piano/piano-frontend/src/components/GameScreen.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Refactored GameScreen.tsx")
