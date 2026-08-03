import { useState, useEffect, useCallback } from 'react';
import { MidiInputEvent } from '../types';

export const useMidiDevice = (
  onNoteOn: (e: MidiInputEvent) => void,
  onNoteOff: (e: MidiInputEvent) => void
) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMidiMessage = useCallback((message: any) => {
    const [command, note, velocity] = message.data;
    
    // Note On (144-159)
    if (command >= 144 && command <= 159) {
      if (velocity > 0) {
        onNoteOn({
          midiNumber: note,
          velocity,
          timestamp: message.timeStamp
        });
      } else {
        // Some devices send Note On with velocity 0 instead of Note Off
        onNoteOff({
          midiNumber: note,
          velocity: 0,
          timestamp: message.timeStamp
        });
      }
    } 
    // Note Off (128-143)
    else if (command >= 128 && command <= 143) {
      onNoteOff({
        midiNumber: note,
        velocity: 0,
        timestamp: message.timeStamp
      });
    }
  }, [onNoteOn, onNoteOff]);

  useEffect(() => {
    let midiAccess: any = null;

    const setupMidi = async () => {
      try {
        if (!navigator.requestMIDIAccess) {
          setError('Web MIDI API is not supported in this browser.');
          return;
        }

        midiAccess = await navigator.requestMIDIAccess();
        setIsConnected(true);

        const inputs = midiAccess.inputs.values();
        for (let input of inputs) {
          if (!deviceName) setDeviceName(input.name);
          input.onmidimessage = handleMidiMessage;
        }

        midiAccess.onstatechange = (e: any) => {
          if (e.port.type === 'input') {
            if (e.port.state === 'connected') {
              setIsConnected(true);
              setDeviceName(e.port.name);
              e.port.onmidimessage = handleMidiMessage;
            } else if (e.port.state === 'disconnected') {
              setIsConnected(false);
              setDeviceName(null);
            }
          }
        };

      } catch (err) {
        setError('Could not access MIDI devices.');
        setIsConnected(false);
      }
    };

    setupMidi();

    return () => {
      if (midiAccess) {
        const inputs = midiAccess.inputs.values();
        for (let input of inputs) {
          input.onmidimessage = null;
        }
      }
    };
  }, [handleMidiMessage, deviceName]);

  return { isConnected, deviceName, error };
};
