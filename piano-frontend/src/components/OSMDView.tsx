'use client';
import React, { useRef, useEffect, useState } from 'react';
import { OpenSheetMusicDisplay, IOSMDOptions } from 'opensheetmusicdisplay';

import { ActiveNote } from '../types';

import { NoteEvent } from '../types';

interface OSMDViewProps {
  xmlUrl: string | null;
  canvasWidth: number;
  canvasHeight: number;
  registerDrawCallback?: (cb: (currentTime: number, activeNotes: ActiveNote[]) => void) => () => void;
  duration?: number;
  tempo?: number;
  notes?: NoteEvent[];
  speed?: number;
}

export const OSMDView: React.FC<OSMDViewProps> = React.memo(({
  xmlUrl, canvasWidth, canvasHeight, registerDrawCallback, duration = 100, tempo = 120, notes = [], speed = 1
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<{ cachedTimestamps: number[] | null; cursorIndex: number; lastTime: number }>({
    cachedTimestamps: null,
    cursorIndex: 0,
    lastTime: -1,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    
    const options: IOSMDOptions = {
      autoResize: true,
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: true,
      drawCredits: false,
      drawPartNames: false,
      drawPartAbbreviations: false,
      renderSingleHorizontalStaffline: true, // Render as a single endless horizontal track
    };
    
    osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, options);
    
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  useEffect(() => {
    if (!osmdRef.current || !xmlUrl) return;

    const loadScore = async () => {
      try {
        setError(null);
        stateRef.current.cachedTimestamps = null; // reset on load
        const response = await fetch(xmlUrl);
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }
        const xmlString = await response.text();
        
        await osmdRef.current!.load(xmlString);
        osmdRef.current!.render();
        osmdRef.current!.cursor.show();
      } catch (err: any) {
        console.error('OSMD Load Error:', err);
        setError(`Lỗi khi tải bản nhạc: ${err.message || String(err)}. Vui lòng upload lại bằng file .xml gốc.`);
      }
    };

    loadScore();
  }, [xmlUrl]);

  useEffect(() => {
    if (!registerDrawCallback || !scrollWrapperRef.current) return;
    
    const cleanup = registerDrawCallback((currentTime) => {
      const osmd = osmdRef.current;
      const el = scrollWrapperRef.current;
      if (!osmd || !el || !osmd.cursor || !osmd.cursor.iterator) return;
      
      const st = stateRef.current;

      // Cache all timestamps once after load
      if (!st.cachedTimestamps) {
        const timestamps: number[] = [];
        osmd.cursor.reset();
        while (!osmd.cursor.iterator.EndReached) {
          timestamps.push(osmd.cursor.iterator.currentTimeStamp.RealValue);
          osmd.cursor.next();
        }
        st.cachedTimestamps = timestamps;
        osmd.cursor.reset();
        st.cursorIndex = 0;
      }

      const timestamps = st.cachedTimestamps;
      if (timestamps.length === 0) return;

      const firstNoteTime = notes.length > 0 ? (notes[0].startTime / speed) : 0;
      const targetRealValue = ((currentTime - firstNoteTime) * tempo) / 240;
      
      // Reset if time goes backwards (e.g., song restarted)
      if (currentTime < st.lastTime) {
        osmd.cursor.reset();
        st.cursorIndex = 0;
      }
      st.lastTime = currentTime;
      
      // Advance cursor to match current time (only move if the NEXT event is <= targetRealValue)
      while (
        st.cursorIndex + 1 < timestamps.length && 
        timestamps[st.cursorIndex + 1] <= targetRealValue
      ) {
        osmd.cursor.next();
        st.cursorIndex++;
      }
      
      // Auto-scroll to center the cursor
      const cursorEl = (osmd.cursor as any).cursorElement;
      if (cursorEl) {
        const cursorLeft = parseFloat(cursorEl.style.left) || 0;
        el.scrollLeft = cursorLeft - el.clientWidth / 2;
      } else {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll > 0) {
          const progress = Math.max(0, Math.min(1, currentTime / duration));
          el.scrollLeft = progress * maxScroll;
        }
      }
    });
    return cleanup;
  }, [registerDrawCallback, duration, tempo, notes, speed]);

  return (
    <div 
      ref={scrollWrapperRef}
      style={{
        width: canvasWidth,
        height: canvasHeight,
        overflowY: 'auto',
        overflowX: 'auto',
        background: '#F8F6F0',
        padding: '10px',
        position: 'relative'
    }}>
      {error && (
        <div style={{ color: 'red', padding: '20px', textAlign: 'center', fontWeight: 'bold' }}>
          {error}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', minWidth: '1000px' }} />
    </div>
  );
});

OSMDView.displayName = 'OSMDView';
