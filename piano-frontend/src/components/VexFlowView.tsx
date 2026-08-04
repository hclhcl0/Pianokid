'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';

import { NoteEvent, ActiveNote, GameConfig } from '../types';

import { KeyboardRange, getAbsoluteWhiteIndex, getPianoKeyLayout } from '../lib/pianoLayout';

import { buildSheetMeasures, SheetMeasure, SheetNote } from '../lib/notesToVexflow';

import { GameCanvas } from './GameCanvas';



const NOTE_NAMES = ['ÄÃ´', 'ÄÃ´#', 'RÃª', 'RÃª#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];



// â”€â”€ Layout constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SHEET_SCALE    = 1.5;   // scale factor for larger sheet

const BASE_MEASURE_W = 240;

const BASE_SVG_H     = 240;   // reduced from 340 to crop empty space at bottom

const MEASURE_W  = BASE_MEASURE_W * SHEET_SCALE;   // px per measure

const TREBLE_Y   = 20;    // treble staff Y inside SVG (base unscaled)

const BASS_Y     = 110;   // bass staff Y inside SVG (base unscaled) - gap of 90

const SVG_H      = BASE_SVG_H * SHEET_SCALE;   // total SVG height for one grand-staff measure

const PLAYHEAD   = 0.28;  // playhead at 28% from left edge

const PRE_BUF    = 3;     // measures before playhead to keep in DOM

const POST_BUF   = 9;     // measures after  playhead to keep in DOM



const C_STAFF  = 'rgba(0, 0, 0, 1)';     // black lines on white bg

const C_NOTE   = 'rgba(0, 0, 0, 1)';     // black noteheads

const C_REST   = 'rgba(0, 0, 0, 0.7)';   // black rests



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// MeasureBlock â€“ renders one grand-staff measure with VexFlow (lazy)

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•



interface MeasureBlockProps {

  measure:       SheetMeasure;

  isFirst:       boolean;

  timeSignature: string;

  activeMidi:    Set<number>;

  hitMidi:       Set<number>;

  x:             number;

}



const MeasureBlock: React.FC<MeasureBlockProps> = React.memo(({

  measure, isFirst, timeSignature, activeMidi, hitMidi, x,

}) => {

  const divRef = useRef<HTMLDivElement>(null);



  // Only notes in THIS measure matter for highlight changes

  const myMidi = useMemo(() =>

    new Set([

      ...measure.treble.flatMap(n => n.midiNumbers),

      ...measure.bass  .flatMap(n => n.midiNumbers),

    ]),

  [measure]);



  useEffect(() => {

    if (!divRef.current) return;

    const el = divRef.current;



    // Dynamic import keeps VexFlow out of SSR bundle
    import('vexflow').then((VFModule: any) => {
      try {
        const VF = VFModule.Flow || VFModule;
        const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Dot, StaveConnector } = VF;

        el.innerHTML = '';

        const renderer = new Renderer(el, Renderer.Backends.SVG);
        renderer.resize(MEASURE_W, SVG_H);
        const ctx = renderer.getContext();
        ctx.scale(SHEET_SCALE, SHEET_SCALE);

        ctx.setStrokeStyle(C_STAFF);
        ctx.setFillStyle(C_STAFF);

        const noteArea = isFirst ? BASE_MEASURE_W - 90 : BASE_MEASURE_W - 30;

        // ── Treble stave ──
        const treble = new Stave(0, TREBLE_Y, BASE_MEASURE_W);
        treble.setStyle({ strokeStyle: C_STAFF, fillStyle: C_STAFF });
        if (isFirst) treble.addClef('treble').addTimeSignature(timeSignature);
        treble.setContext(ctx).draw();

        // ── Bass stave ──
        const bass = new Stave(0, BASS_Y, BASE_MEASURE_W);
        bass.setStyle({ strokeStyle: C_STAFF, fillStyle: C_STAFF });
        if (isFirst) bass.addClef('bass').addTimeSignature(timeSignature);
        bass.setContext(ctx).draw();

        // ── Connectors ──
        if (isFirst) {
          const brace = new StaveConnector(treble, bass, 'brace');
          brace.setStyle({ strokeStyle: C_STAFF, fillStyle: C_STAFF });
          brace.setContext(ctx).draw();
        }
        const leftBar = new StaveConnector(treble, bass, 'single_left');
        leftBar.setStyle({ strokeStyle: C_STAFF, fillStyle: C_STAFF });
        leftBar.setContext(ctx).draw();

        // ── Helper: build VexFlow StaveNote list ──
        const makeNotes = (sheetNotes: SheetNote[], clef: 'treble' | 'bass') =>
          sheetNotes.map(sn => {
            const color = sn.isRest ? C_REST : C_NOTE;
            const vn = new StaveNote({ keys: sn.keys, duration: sn.duration, clef, dots: sn.dotted ? 1 : 0 });
            vn.setStyle({ strokeStyle: color, fillStyle: color });
            sn.accidentals.forEach((acc, idx) => {
              if (acc) {
                const a = new Accidental(acc);
                a.setStyle({ strokeStyle: color, fillStyle: color });
                vn.addModifier(a, idx);
              }
            });
            if (sn.dotted) Dot.buildAndAttach([vn], { all: true });
            return vn;
          });

        // ── Treble voice ──
        const tn = makeNotes(measure.treble, 'treble');
        let tv: any = null;
        if (tn.length) {
          const [numBeats, beatValue] = timeSignature.split('/').map(Number);
          tv = new Voice({ numBeats, beatValue })
            .setMode(Voice.Mode.SOFT)
            .addTickables(tn);
        }

        // ── Bass voice ──
        const bn = makeNotes(measure.bass, 'bass');
        let bv: any = null;
        if (bn.length) {
          const [numBeats, beatValue] = timeSignature.split('/').map(Number);
          bv = new Voice({ numBeats, beatValue })
            .setMode(Voice.Mode.SOFT)
            .addTickables(bn);
        }

        // ── Format and Draw Together ──
        const voices = [];
        if (tv) voices.push(tv);
        if (bv) voices.push(bv);

        if (voices.length > 0) {
          new Formatter().joinVoices(voices).format(voices, noteArea);
          if (tv) tv.draw(ctx, treble);
          if (bv) bv.draw(ctx, bass);
        }

      } catch (renderErr: any) {
        console.warn('[MeasureBlock] VexFlow render error:', renderErr);
        el.innerHTML = `<div style="color:red; font-size:12px; padding: 4px;">Error: ${renderErr?.message || renderErr}</div>`;
      }
    }).catch(err => console.warn('[MeasureBlock] VexFlow load error:', err));

    // Re-render only when the measure content itself changes
  }, [measure, isFirst, timeSignature]);



  return (

    <div

      ref={divRef}

      style={{ position: 'absolute', left: x, top: 0, width: MEASURE_W, height: SVG_H }}

    />

  );

});

MeasureBlock.displayName = 'MeasureBlock';



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// SheetView â€“ main component

// â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 



interface VexFlowViewProps {

  notes:         NoteEvent[];

  tempo:         number;

  timeSignature: string;

  canvasWidth:   number;

  canvasHeight:  number;

  keyboardRange: KeyboardRange;

  userActiveKeysRef: React.MutableRefObject<Set<number>>;

  config:        GameConfig;

  waitingForNote: number | null;

  showFingering: boolean;

  registerDrawCallback: (cb: (currentTime: number, activeNotes: ActiveNote[]) => void) => () => void;

}



export const VexFlowView: React.FC<VexFlowViewProps> = React.memo(({

  notes, tempo, timeSignature,

  canvasWidth, canvasHeight, keyboardRange, userActiveKeysRef,

  config, waitingForNote, showFingering, registerDrawCallback,

}) => {

  const scrollRef  = useRef<HTMLDivElement>(null);

  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [visRange, setVisRange] = useState<[number, number]>([0, POST_BUF]);



  // â”€â”€ Data: build all measure data once â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const measures = useMemo(
    () => buildSheetMeasures(notes, tempo, timeSignature),
    [notes, tempo, timeSignature]
  );

      // ── Active MIDI sets for highlighting ──
  const activeMidi = useMemo(() => new Set<number>(), []);
  const hitMidi = useMemo(() => new Set<number>(), []);

  // ── Layout calculations ──GameCanvas keyboard formula exactly 
  const whiteKeyW  = canvasWidth / keyboardRange.numWhiteKeys;

  // Use same formula as GameCanvas: Math.min(canvasHeight * 0.3, whiteKeyW * 5)
  // But cap keyboard at 28% so sheet gets at least 72% height

  const keyboardH  = Math.min(canvasHeight * 0.28, whiteKeyW * 5);

  const sheetH     = canvasHeight - keyboardH;

  const playheadX  = canvasWidth * PLAYHEAD;



  // CÄƒn khung nháº¡c xuá»‘ng dÆ°á»›i nhÆ°ng Ä‘á»ƒ láº¡i má»™t khoáº£ng trá»‘ng nhá» (khÃ´ng bá»‹ sÃ¡t quÃ¡)

  const staveOffsetY = Math.max(0, sheetH - SVG_H - 10);



  const measureDur = useMemo(() => {

    const [beats] = timeSignature.split('/').map(Number);

    return beats * (60 / tempo);

  }, [tempo, timeSignature]);







  // â”€â”€ Scroll & Overlay Canvas: direct mutation (no setState = no re-render per frame) â”€â”€

  useEffect(() => {

    if (!scrollRef.current || !measures.length) return;

    const canvas = overlayCanvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!ctx) return;



    const unregister = registerDrawCallback((currentTime, currentActiveNotes) => {

      // 1. Scroll

      const mIdx  = Math.floor(currentTime / measureDur);

      const frac  = (currentTime % measureDur) / measureDur;

      const scrollX = Math.max(0, (mIdx + frac) * MEASURE_W - playheadX);



      // Direct style mutation â€“ avoids React re-render on every frame

      if (scrollRef.current) scrollRef.current.style.transform = `translateX(${-scrollX}px)`;



      // Lazily update which measures are mounted (only changes at measure boundaries)
      // measures[] has absolute indices — find sequential array positions near mIdx
      const absFirst = mIdx - PRE_BUF;
      const absLast  = mIdx + POST_BUF;
      const rawSeqFirst = measures.findIndex(m => m.index >= absFirst);
      const seqFirst = rawSeqFirst === -1 ? 0 : Math.max(0, rawSeqFirst);
      const seqLastRaw = measures.findIndex(m => m.index > absLast);
      const seqLast  = seqLastRaw === -1 ? measures.length - 1 : Math.max(0, seqLastRaw - 1);

      setVisRange(prev => (prev[0] === seqFirst && prev[1] === seqLast) ? prev : [seqFirst, seqLast]);



      // 2. Overlay drawing (Measure text & Map Pins)

      ctx.clearRect(0, 0, canvasWidth, sheetH);

      

      // Measure text

      ctx.fillStyle = 'rgba(0,0,0,0.5)';

      ctx.fillRect(canvasWidth - 110, 10, 100, 30);

      ctx.fillStyle = '#fff';

      ctx.font = '14px sans-serif';

      ctx.textAlign = 'center';

      ctx.textBaseline = 'middle';

      ctx.fillText(`Measure ${Math.min(mIdx + 1, measures.length > 0 ? measures[measures.length-1].index + 1 : 1)}/${measures.length > 0 ? measures[measures.length-1].index + 1 : 1}`, canvasWidth - 60, 25);



      // Map pins

      const pinMidis = new Set<number>(userActiveKeysRef.current);

      if (waitingForNote !== null) pinMidis.add(waitingForNote);

      currentActiveNotes.forEach(n => {

        // Here, currentTime vs note.startTime determines if it's at playhead

        const timeFromHit = currentTime - n.startTime;

        if (timeFromHit >= -0.2 && timeFromHit <= n.duration + 0.1) {

          pinMidis.add(n.midiNumber);

        }

      });



      pinMidis.forEach(midi => {

        const layout = getPianoKeyLayout(midi, canvasWidth, keyboardRange);

        if (!layout) return;

        const x = layout.centerX;
        // Place badge just above the keyboard, inside the bottom gap area
        const y = sheetH - 2;

        

        ctx.save();

        ctx.shadowColor = 'rgba(0,0,0,0.3)';

        ctx.shadowBlur = 6;

        ctx.shadowOffsetY = 4;

        ctx.fillStyle = '#A855F7';

        ctx.beginPath();

        ctx.moveTo(x, y);

        ctx.lineTo(x - 22, y - 22);

        ctx.arc(x, y - 44, 22, Math.PI * 0.75, Math.PI * 0.25);

        ctx.closePath();

        ctx.fill();

        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = '#000';

        ctx.lineWidth = 3;

        ctx.stroke();

        

        ctx.fillStyle = '#fff';

        ctx.font = '900 16px Nunito, sans-serif';

        ctx.textAlign = 'center';

        ctx.textBaseline = 'middle';

        ctx.fillText(NOTE_NAMES[midi % 12], x, y - 44);

        ctx.restore();

      });

    });

    

    return unregister;

  }, [measureDur, measures.length, playheadX, registerDrawCallback, canvasWidth, canvasHeight, sheetH, userActiveKeysRef, waitingForNote, keyboardRange]);



  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (

    <div style={{

      position: 'absolute', inset: 0,

      background: '#F8F6F0',   // warm white sheet paper

      overflow: 'hidden',

    }}>



      {/* â”€â”€ Sheet music area â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

      <div style={{

        position: 'absolute', top: 0, left: 0, right: 0,

        height: sheetH, overflow: 'hidden',

      }}>



        {/* Scrolling measure container */}

        <div

          ref={scrollRef}

          style={{

            position: 'absolute',

            top: staveOffsetY,

            left: 0,

            width: (measures.length > 0 ? measures[measures.length - 1].index + 2 : 2) * MEASURE_W,

            height: SVG_H,

            willChange: 'transform',

          }}

        >

          {measures.slice(visRange[0], visRange[1] + 1).map(m => (

            <MeasureBlock

              key={m.index}

              measure={m}

              isFirst={m.index === 0}

              timeSignature={timeSignature}

              activeMidi={activeMidi}

              hitMidi={hitMidi}

              x={m.index * MEASURE_W}

            />

          ))}

        </div>



        {/* Playhead indicator */}

        <div style={{

          position: 'absolute',

          top: staveOffsetY - 20,

          left: playheadX,

          width: 30,

          height: SVG_H + 40,

          background: 'rgba(0, 100, 255, 0.15)',

          borderLeft: '4px solid rgba(0, 100, 255, 0.5)',

          transform: 'translateX(-4px)',

          zIndex: 10,

        }} />



        {/* Fade-out left edge */}

        <div style={{

          position: 'absolute', left: 0, top: 0, width: 80, height: '100%',

          background: 'linear-gradient(90deg,#F8F6F0,transparent)',

          pointerEvents: 'none', zIndex: 11,

        }} />

        {/* Fade-out right edge */}

        <div style={{

          position: 'absolute', right: 0, top: 0, width: 80, height: '100%',

          background: 'linear-gradient(270deg,#F8F6F0,transparent)',

          pointerEvents: 'none', zIndex: 11,

        }} />

        

        <canvas 

          ref={overlayCanvasRef}

          width={canvasWidth}

          height={sheetH}

          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 35 }}

        />

      </div>



      {/* Divider */}

      <div style={{

        position: 'absolute', top: sheetH, left: 0, right: 0,

        height: 2, background: 'rgba(0,0,0,0.12)',

      }} />



      {/* â”€â”€ Piano keyboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

      {/* We reuse GameCanvas and clip it so only the keyboard portion shows */}

      <div style={{

        position: 'absolute',

        top: sheetH, left: 0, right: 0,

        height: keyboardH,

        background: '#F8F6F0',

        overflow: 'hidden',

      }}>

        {/* Position full-height GameCanvas with bottom anchored to container */}

        <div style={{

          position: 'absolute',

          bottom: 0, left: 0,

          width: canvasWidth, height: canvasHeight,

        }}>

          <GameCanvas
            registerDrawCallback={registerDrawCallback}
            userActiveKeysRef={userActiveKeysRef}
            config={config}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            waitingForNote={waitingForNote}
            keyboardRange={keyboardRange}
            showFingering={showFingering}
          />

        </div>

      </div>

    </div>
  );
});

