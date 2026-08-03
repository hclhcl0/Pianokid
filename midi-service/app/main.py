from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
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
    notes: List[NoteEvent]

class UrlRequest(BaseModel):
    url: str

@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "KidsPiano MIDI Parser"}

def _process_midi_file(file_path: str, filename: str) -> ParseResponse:
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
            notes=notes
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/parse", response_model=ParseResponse)
async def parse_midi(file: UploadFile = File(...)):
    """Parses an uploaded MIDI file."""
    if not file.filename.endswith(('.mid', '.midi')):
        raise HTTPException(status_code=400, detail="Must be a .mid or .midi file")
        
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mid") as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
            
        response = _process_midi_file(temp_path, file.filename)
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
