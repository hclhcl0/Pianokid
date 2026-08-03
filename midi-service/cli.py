import argparse
import sys
import json
from app.midi_parser import MidiParser

def main():
    """CLI entrypoint for KidsPiano MIDI Parser."""
    parser = argparse.ArgumentParser(description="KidsPiano MIDI Parser CLI")
    parser.add_argument("-i", "--input", required=True, help="Path to MIDI file")
    parser.add_argument("-o", "--output", help="Output JSON file path (default: stdout)")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    
    args = parser.parse_args()
    
    try:
        midi_parser = MidiParser(args.input)
        notes = midi_parser.parse()
        
        # Convert pydantic models to dicts
        notes_dict = [note.model_dump() for note in notes]
        
        output_str = json.dumps(notes_dict, indent=2 if args.pretty else None)
        
        # Summary to stderr
        print(f"Parsed {len(notes)} notes from {args.input}", file=sys.stderr)
        
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output_str)
            print(f"Saved to {args.output}", file=sys.stderr)
        else:
            print(output_str)
            
    except Exception as e:
        print(f"Error parsing MIDI file: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
