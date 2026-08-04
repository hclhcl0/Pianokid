"""
KidsPiano MIDI Parser v4 — Standard Piano MIDI only
Chỉ xử lý file MIDI Piano chuẩn. Không tự động chế hợp âm.
Chiến lược tách tay (Left/Right):
  1. Nếu file có >= 2 track: Track có âm vực cao nhất là Right, các track còn lại là Left.
  2. Nếu file chỉ có 1 track: Tách theo nốt C4 (MIDI 60). Nốt >= 60 là Right, < 60 là Left.
  3. Loại bỏ track trống và track trống (drums).
  4. Chuẩn hóa thời gian (Normalize) để nốt đầu tiên bắt đầu ở t=0.
Copyright: Hồ Công Lượng <hclhcl0@gmail.com>
"""
import pretty_midi
from pydantic import BaseModel
from typing import List, Literal, Optional

class NoteEvent(BaseModel):
    note: str
    midiNumber: int
    startTime: float
    duration: float
    startBeat: float
    durationBeat: float
    track: Literal['left', 'right']
    role: Optional[Literal['root', 'chord_tone']] = None

NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

class MidiParser:
    def __init__(self, file_path: str):
        self.file_path  = file_path
        self.time_signature = '4/4'
        self._bpm: float = 120.0

    def parse(self) -> List[NoteEvent]:
        try:
            midi = pretty_midi.PrettyMIDI(self.file_path)
        except Exception as e:
            raise ValueError(f'Cannot parse MIDI: {e}')

        # Lấy BPM và Time Signature từ sự kiện MIDI thực tế
        try:
            _, tempi = midi.get_tempo_changes()
            if len(tempi) > 0:
                self._bpm = float(tempi[0])
            else:
                self._bpm = 120.0
        except Exception:
            self._bpm = 120.0

        if midi.time_signature_changes:
            ts = midi.time_signature_changes[0]
            self.time_signature = f'{ts.numerator}/{ts.denominator}'

        # ─── Lọc các track hợp lệ (không phải trống) ───────────────
        valid_insts = [i for i in midi.instruments if len(i.notes) > 0]
        if not valid_insts:
            return []

        all_events: List[NoteEvent] = []

        # ─── Phân tích tay Trái / Phải ───────────────
        if len(valid_insts) == 2:
            inst1, inst2 = valid_insts[0], valid_insts[1]
            avg1 = sum(n.pitch for n in inst1.notes) / len(inst1.notes)
            avg2 = sum(n.pitch for n in inst2.notes) / len(inst2.notes)
            if avg1 >= avg2:
                all_events.extend(self._to_events(inst1.notes, 'right', midi))
                all_events.extend(self._to_events(inst2.notes, 'left', midi))
            else:
                all_events.extend(self._to_events(inst2.notes, 'right', midi))
                all_events.extend(self._to_events(inst1.notes, 'left', midi))
        elif len(valid_insts) == 1:
            inst = valid_insts[0]
            right_notes = [n for n in inst.notes if n.pitch >= 60]
            left_notes  = [n for n in inst.notes if n.pitch < 60]
            all_events.extend(self._to_events(right_notes, 'right', midi))
            all_events.extend(self._to_events(left_notes, 'left', midi))
        else:
            # Nếu có nhiều hơn 2 track, chỉ lấy 2 track chứa nhiều nốt nhất
            valid_insts.sort(key=lambda x: len(x.notes), reverse=True)
            inst1, inst2 = valid_insts[0], valid_insts[1]
            avg1 = sum(n.pitch for n in inst1.notes) / len(inst1.notes)
            avg2 = sum(n.pitch for n in inst2.notes) / len(inst2.notes)
            if avg1 >= avg2:
                all_events.extend(self._to_events(inst1.notes, 'right', midi))
                all_events.extend(self._to_events(inst2.notes, 'left', midi))
            else:
                all_events.extend(self._to_events(inst2.notes, 'right', midi))
                all_events.extend(self._to_events(inst1.notes, 'left', midi))

        # ─── Sắp xếp và Chuẩn hóa (Normalize) thời gian ───────────────
        all_events.sort(key=lambda e: e.startTime)

        if all_events:
            for ev in all_events:
                ev.startTime = round(ev.startTime, 4)

        # Đánh dấu role cho track left (root / chord_tone) để hỗ trợ chế độ Đơn giản (Bass)
        left_events = [e for e in all_events if e.track == 'left']
        if left_events:
            left_events.sort(key=lambda x: (x.startTime, x.midiNumber))
            groups = []
            current_group = [left_events[0]]
            for ev in left_events[1:]:
                # Nhóm các nốt gần nhau (0.05s) thành một hợp âm
                if ev.startTime - current_group[0].startTime < 0.05:
                    current_group.append(ev)
                else:
                    groups.append(current_group)
                    current_group = [ev]
            groups.append(current_group)
            
            for grp in groups:
                # Nốt thấp nhất là root
                grp[0].role = 'root'
                for ev in grp[1:]:
                    ev.role = 'chord_tone'

        return all_events

    def _to_events(self, notes: list, track: Literal['left','right'], midi: pretty_midi.PrettyMIDI) -> List[NoteEvent]:
        events = []
        for n in notes:
            dur = round(n.end - n.start, 4)
            if dur < 0.03: continue  # Bỏ qua các nốt quá ngắn (nhiễu)
            
            start_tick = midi.time_to_tick(n.start)
            end_tick = midi.time_to_tick(n.end)
            
            startBeat = start_tick / midi.resolution
            durationBeat = (end_tick - start_tick) / midi.resolution

            events.append(NoteEvent(
                note=self._midi_to_name(n.pitch),
                midiNumber=n.pitch,
                startTime=round(n.start, 4),
                duration=dur,
                startBeat=round(startBeat, 4),
                durationBeat=round(durationBeat, 4),
                track=track
            ))
        return events

    def _midi_to_name(self, m: int) -> str:
        return NOTE_NAMES[m % 12] + str(m // 12 - 1)
