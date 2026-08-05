from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import tempfile
import os
import requests
import pretty_midi
from .midi_parser import MidiParser, NoteEvent

app = FastAPI(title="KidsPiano MIDI Parser")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ParseResponse(BaseModel):
    filename: str
    totalNotes: int
    duration: float
    tempo: float
    timeSignature: str
    notes: List[NoteEvent]
    xml_content: Optional[str] = None

class UrlRequest(BaseModel):
    url: str

@app.get("/")
def read_root():
    """Root endpoint."""
    return {"message": "KidsPiano MIDI Parser Service is running. Access the frontend at http://localhost:3000"}

@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "KidsPiano MIDI Parser"}

def _process_midi_file(file_path: str, filename: str, xml_content: Optional[str] = None) -> ParseResponse:
    """Helper method to process a MIDI file on disk and return a ParseResponse."""
    try:
        midi_data = pretty_midi.PrettyMIDI(file_path)
        tempo = 120.0  # Default fallback
        if midi_data.get_tempo_changes()[1].size > 0:
            tempo = float(midi_data.get_tempo_changes()[1][0])
            
        duration = midi_data.get_end_time()
        
        parser = MidiParser(file_path)
        notes = parser.parse()
        
        return ParseResponse(
            filename=filename,
            totalNotes=len(notes),
            duration=duration,
            tempo=tempo,
            timeSignature=parser.time_signature,
            notes=notes,
            xml_content=xml_content
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/parse", response_model=ParseResponse)
async def parse_midi(file: UploadFile = File(...), simplify: bool = Form(False)):
    """Parses an uploaded MIDI or MusicXML file."""
    if not file.filename.endswith(('.mid', '.midi', '.xml', '.mxl')):
        raise HTTPException(status_code=400, detail="Must be a .mid, .midi, .xml, or .mxl file")
        
    try:
        suffix = os.path.splitext(file.filename)[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
            
        xml_content = None
        if suffix in ['.xml', '.mxl']:
            import music21
            try:
                score = music21.converter.parse(temp_path)
                mid_path = temp_path + ".mid"
                score.write('midi', fp=mid_path)
                
                if simplify:
                    parts = list(score.getElementsByClass('Part'))
                    avg_pitches = []
                    for p in parts:
                        pitches = []
                        for n in p.recurse().notes:
                            if getattr(n, 'isNote', False): pitches.append(n.pitch.midi)
                            elif getattr(n, 'isChord', False): pitches.extend([pitch.midi for pitch in n.pitches])
                        avg_pitches.append(sum(pitches) / max(1, len(pitches)))
                        
                    for i, p in enumerate(parts):
                        is_bass = False
                        if len(parts) >= 2:
                            if avg_pitches[i] < max(avg_pitches): is_bass = True
                        else:
                            if avg_pitches[i] < 60: is_bass = True

                        for n in p.recurse().getElementsByClass('Chord'):
                            if is_bass:
                                sorted_pitches = sorted(n.pitches, key=lambda pt: pt.midi)
                                n.pitches = [sorted_pitches[0]]
                            else:
                                sorted_pitches = sorted(n.pitches, key=lambda pt: pt.midi, reverse=True)
                                n.pitches = [sorted_pitches[0]]

                # Re-export as uncompressed XML so the frontend gets a clean text string
                xml_out_path = temp_path + "_uncompressed.musicxml"
                score.write('musicxml', fp=xml_out_path)
                with open(xml_out_path, 'r', encoding='utf-8') as f:
                    xml_content = f.read()
                os.remove(xml_out_path)
                
                os.remove(temp_path)
                temp_path = mid_path
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to process MusicXML file: {e}")
        else:
            # If it's a MIDI file, attempt to generate XML
            import music21
            try:
                score = music21.converter.parse(temp_path)
                
                parts = list(score.getElementsByClass('Part'))
                valid_parts = []
                for p in parts:
                    notes = list(p.recurse().notes)
                    unpitched = sum(1 for n in notes if isinstance(n, music21.note.Unpitched))
                    if unpitched > 0 or len(notes) == 0:
                        score.remove(p)
                    else:
                        valid_parts.append(p)
                        
                if len(valid_parts) > 2:
                    valid_parts.sort(key=lambda p: len(p.recurse().notesAndRests), reverse=True)
                    for p in valid_parts[2:]:
                        score.remove(p)
                
                valid_parts = valid_parts[:2]
                
                # Split single track into two (Grand Staff) based on Middle C
                if len(valid_parts) == 1:
                    import copy
                    main_part = valid_parts[0]
                    left_part = copy.deepcopy(main_part)
                    right_part = main_part
                    
                    for n in list(right_part.recurse().notes):
                        if getattr(n, 'isNote', False):
                            if n.pitch.midi < 60:
                                n.activeSite.remove(n)
                        elif getattr(n, 'isChord', False):
                            new_pitches = [p for p in n.pitches if p.midi >= 60]
                            if not new_pitches:
                                n.activeSite.remove(n)
                            else:
                                n.pitches = new_pitches
                                
                    for n in list(left_part.recurse().notes):
                        if getattr(n, 'isNote', False):
                            if n.pitch.midi >= 60:
                                n.activeSite.remove(n)
                        elif getattr(n, 'isChord', False):
                            new_pitches = [p for p in n.pitches if p.midi < 60]
                            if not new_pitches:
                                n.activeSite.remove(n)
                            else:
                                n.pitches = new_pitches
                            
                    score.insert(0, left_part)
                    valid_parts = [right_part, left_part]

                avg_pitches = []
                for p in valid_parts:
                    pitches = []
                    for n in p.recurse().notes:
                        if getattr(n, 'isNote', False): pitches.append(n.pitch.midi)
                        elif getattr(n, 'isChord', False): pitches.extend([pitch.midi for pitch in n.pitches])
                    avg_pitches.append(sum(pitches) / max(1, len(pitches)))
                
                for i, p in enumerate(valid_parts):
                    is_bass = False
                    if len(valid_parts) == 2:
                        is_bass = (i == 0 and avg_pitches[0] < avg_pitches[1]) or (i == 1 and avg_pitches[1] <= avg_pitches[0])
                    
                    # Create the desired clef
                    import music21.clef
                    c = music21.clef.BassClef() if is_bass else music21.clef.TrebleClef()
                    
                    # Remove all existing clefs to prevent conflicts
                    for el in list(p.recurse().getElementsByClass('Clef')):
                        el.activeSite.remove(el)
                        
                    # Insert the new clef at the beginning of the first measure
                    measures = list(p.getElementsByClass('Measure'))
                    if measures:
                        measures[0].insert(0, c)
                    else:
                        p.insert(0, c)
                        
                # Quantize to 16th and 8th notes to remove timing jitter
                score.quantize((8, 16), inPlace=True)
                
                if simplify:
                    parts = list(score.getElementsByClass('Part'))
                    avg_pitches = []
                    for p in parts:
                        pitches = []
                        for n in p.recurse().notes:
                            if getattr(n, 'isNote', False): pitches.append(n.pitch.midi)
                            elif getattr(n, 'isChord', False): pitches.extend([pitch.midi for pitch in n.pitches])
                        avg_pitches.append(sum(pitches) / max(1, len(pitches)))
                        
                    for i, p in enumerate(parts):
                        is_bass = False
                        if len(parts) >= 2:
                            if avg_pitches[i] < max(avg_pitches): is_bass = True
                        else:
                            if avg_pitches[i] < 60: is_bass = True

                        for n in p.recurse().getElementsByClass('Chord'):
                            if is_bass:
                                sorted_pitches = sorted(n.pitches, key=lambda pt: pt.midi)
                                n.pitches = [sorted_pitches[0]]
                            else:
                                sorted_pitches = sorted(n.pitches, key=lambda pt: pt.midi, reverse=True)
                                n.pitches = [sorted_pitches[0]]
                
                xml_out_path = temp_path + ".musicxml"
                score.write('musicxml', fp=xml_out_path)
                with open(xml_out_path, 'r', encoding='utf-8') as f:
                    xml_content = f.read()
                os.remove(xml_out_path)
                
                # IMPORTANT: Write the quantized score back to the temp_path as a MIDI file!
                # This ensures the JSON parsed later uses the exact same perfectly snapped timings as the XML.
                score.write('midi', fp=temp_path)
            except Exception as e:
                # It's okay if it fails, xml_content will be None, and JSON will use the original MIDI
                print(f"Failed to generate XML from MIDI: {e}")
            
        response = _process_midi_file(temp_path, file.filename, xml_content)
        return response
    finally:
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/parse-url", response_model=ParseResponse)
async def parse_midi_url(request: UrlRequest):
    """Downloads and parses a MIDI file from a URL."""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mid") as temp_file:
            response = requests.get(request.url, stream=True)
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=8192):
                temp_file.write(chunk)
            temp_path = temp_file.name
            
        filename = request.url.split("/")[-1] or "downloaded.mid"
        response = _process_midi_file(temp_path, filename)
        return response
    except requests.RequestException as e:
         raise HTTPException(status_code=400, detail=f"Failed to download from URL: {e}")
    finally:
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
