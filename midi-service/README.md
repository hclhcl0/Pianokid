# KidsPiano MIDI Service

A Python-based Microservice for parsing MIDI files and outputting structured JSON for the KidsPiano interactive learning app.

## Project Context
- **Project:** KidsPiano - Interactive MIDI Learning App
- **Copyright:** Hồ Công Lượng <hclhcl0@gmail.com>

## Setup

### Using Docker (Recommended)
```bash
docker-compose up --build
```

### Local Development
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## API Documentation

### `GET /health`
Returns service health status.
```bash
curl http://localhost:8000/health
```

### `POST /parse`
Parses a MIDI file upload.
```bash
curl -X POST http://localhost:8000/parse \
  -F "file=@song.mid"
```

### `POST /parse-url`
Parses a MIDI file from a URL.
```bash
curl -X POST http://localhost:8000/parse-url \
  -H "Content-Type: application/json" \
  -d '{"url":"http://example.com/song.mid"}'
```

## Output Format
```json
{
  "filename": "song.mid",
  "totalNotes": 42,
  "duration": 120.5,
  "tempo": 120.0,
  "notes": [
    {
      "note": "C4",
      "midiNumber": 60,
      "startTime": 0.0,
      "duration": 0.5,
      "track": "right"
    }
  ]
}
```

## CLI Usage
```bash
python cli.py --input song.mid --output output.json --pretty
```
