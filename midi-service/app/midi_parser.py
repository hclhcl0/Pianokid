import pretty_midi
from pydantic import BaseModel
from typing import List, Literal

class NoteEvent(BaseModel):
    """Represents a single note event from a MIDI file."""
    note: str
    midiNumber: int
    startTime: float
    duration: float
    track: Literal['left', 'right']

class MidiParser:
    """Parser for MIDI files to extract note events for KidsPiano."""
    
    def __init__(self, file_path: str):
        self.file_path = file_path
        
    def _midi_number_to_name(self, midi_num: int) -> str:
        """Converts a MIDI note number to its string representation (e.g., C4)."""
        return pretty_midi.note_number_to_name(midi_num)
        
    def parse(self) -> List[NoteEvent]:
        """Parses the MIDI file and returns a sorted list of NoteEvents."""
        try:
            midi_data = pretty_midi.PrettyMIDI(self.file_path)
        except Exception as e:
            raise ValueError(f"Failed to parse MIDI file: {e}")
            
        events: List[NoteEvent] = []
        
        for instrument in midi_data.instruments:
            if not instrument.notes:
                continue
                
            # Auto-detect hand based on average pitch
            avg_pitch = sum(note.pitch for note in instrument.notes) / len(instrument.notes)
            track_name: Literal['left', 'right'] = 'right' if avg_pitch >= 60 else 'left'
            
            for note in instrument.notes:
                events.append(NoteEvent(
                    note=self._midi_number_to_name(note.pitch),
                    midiNumber=note.pitch,
                    startTime=note.start,
                    duration=note.end - note.start,
                    track=track_name
                ))
                
        # Sort by start time
        events.sort(key=lambda e: e.startTime)
        return events
