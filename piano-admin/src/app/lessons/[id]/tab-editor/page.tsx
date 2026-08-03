'use client';
/**
 * Tab Editor — Chỉnh sửa nốt nhạc của bài sau khi auto-parse
 * Route: /lessons/[id]/tab-editor
 * Copyright: Hồ Công Lượng <hclhcl0@gmail.com>
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const MIDI_SVC = process.env.NEXT_PUBLIC_MIDI_URL || 'http://localhost:8000';

type Track = 'left' | 'right';
type Role  = 'melody' | 'root' | 'chord_tone' | 'bass_walk';

interface NoteEvent {
  id: string;          // generated client-side for key
  note: string;
  midiNumber: number;
  startTime: number;
  duration: number;
  track: Track;
  role: Role;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function midiToName(m: number) {
  return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
}

function addIds(notes: Omit<NoteEvent,'id'>[]): NoteEvent[] {
  return notes.map((n, i) => ({ ...n, id: `n-${i}-${n.midiNumber}-${n.startTime}` }));
}

export default function TabEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [notes, setNotes] = useState<NoteEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [midiFileUrl, setMidiFileUrl] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all'|'left'|'right'>('all');
  const [filterRole, setFilterRole] = useState<'all'|Role>('all');
  const [editCell, setEditCell] = useState<{id: string; field: string} | null>(null);

  // ── Load lesson + notes ───────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/lessons/${id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        setLessonTitle(data.title || '');
        setMidiFileUrl(data.midiFileUrl || '');

        if (data.midiJsonUrl) {
          const jr = await fetch(data.midiJsonUrl);
          const json = await jr.json();
          const raw = Array.isArray(json) ? json : (json.notes || []);
          setNotes(addIds(raw));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // ── Re-parse từ MIDI service ──────────────────────────────────────────────
  const reParse = useCallback(async () => {
    if (!midiFileUrl) return;
    setReparsing(true);
    try {
      const res = await fetch(`${MIDI_SVC}/parse-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: midiFileUrl }),
      });
      const data = await res.json();
      const raw = data.notes || [];
      setNotes(addIds(raw));
      setSelected(new Set());
    } catch (e) {
      alert('Re-parse lỗi: ' + e);
    } finally {
      setReparsing(false);
    }
  }, [midiFileUrl]);

  // ── Lưu tab ───────────────────────────────────────────────────────────────
  const saveTab = useCallback(async () => {
    setSaving(true);
    try {
      const payload = notes.map(({ id: _, ...n }) => n); // bỏ id client
      const res = await fetch(`${API}/api/lessons/${id}/tab`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ notes: payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert('✅ Đã lưu tab!');
    } catch (e) {
      alert('Lỗi lưu: ' + e);
    } finally {
      setSaving(false);
    }
  }, [id, notes]);

  // ── Chỉnh sửa inline ─────────────────────────────────────────────────────
  const updateNote = (noteId: string, field: keyof NoteEvent, value: string | number) => {
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      const updated = { ...n, [field]: value };
      // Nếu đổi midiNumber → cập nhật note string
      if (field === 'midiNumber') updated.note = midiToName(Number(value));
      return updated;
    }));
  };

  // ── Xoá nốt chọn ─────────────────────────────────────────────────────────
  const deleteSelected = () => {
    setNotes(prev => prev.filter(n => !selected.has(n.id)));
    setSelected(new Set());
  };

  // ── Transpose chọn ───────────────────────────────────────────────────────
  const transposeSelected = (semitones: number) => {
    setNotes(prev => prev.map(n => {
      if (!selected.has(n.id)) return n;
      const midi = Math.max(21, Math.min(108, n.midiNumber + semitones));
      return { ...n, midiNumber: midi, note: midiToName(midi) };
    }));
  };

  // ── Chuyển track ─────────────────────────────────────────────────────────
  const switchTrack = (track: Track) => {
    setNotes(prev => prev.map(n =>
      selected.has(n.id) ? { ...n, track } : n
    ));
  };

  // ── Filtered view ─────────────────────────────────────────────────────────
  const visible = notes.filter(n => {
    if (filter !== 'all' && n.track !== filter) return false;
    if (filterRole !== 'all' && n.role !== filterRole) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map(n => n.id)));
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const rightNotes = notes.filter(n => n.track === 'right');
  const leftNotes  = notes.filter(n => n.track === 'left');

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0f172a', color:'#fff', fontFamily:'Nunito,sans-serif', fontSize:20 }}>
      Đang tải tab...
    </div>
  );

  const btnStyle = (color: string): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: color, color: '#fff', fontFamily: 'Nunito,sans-serif', fontSize: 13, fontWeight: 700,
  });

  const activeFilter = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 20, border: '2px solid',
    borderColor: active ? '#818cf8' : 'rgba(255,255,255,0.15)',
    background: active ? 'rgba(129,140,248,0.2)' : 'transparent',
    color: active ? '#818cf8' : '#94a3b8',
    cursor: 'pointer', fontFamily: 'Nunito,sans-serif', fontSize: 13,
  });

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', color:'#e2e8f0', fontFamily:'Nunito,sans-serif' }}>

      {/* Header */}
      <div style={{ background:'rgba(255,255,255,0.05)', borderBottom:'1px solid rgba(255,255,255,0.1)', padding:'16px 24px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <button onClick={() => router.back()} style={{ ...btnStyle('rgba(255,255,255,0.15)'), padding:'6px 12px' }}>← Back</button>
        <h1 style={{ margin:0, fontSize:20, fontWeight:900, flex:1 }}>
          🎹 Tab Editor — <span style={{ color:'#818cf8' }}>{lessonTitle}</span>
        </h1>

        {/* Stats */}
        <div style={{ display:'flex', gap:12, fontSize:13, opacity:0.8 }}>
          <span>🟢 Right: <b>{rightNotes.length}</b></span>
          <span>🔵 Left: <b>{leftNotes.length}</b></span>
          <span>📝 Total: <b>{notes.length}</b></span>
        </div>

        <button onClick={reParse} disabled={reparsing || !midiFileUrl}
          style={{ ...btnStyle('#7c3aed'), opacity: reparsing ? 0.6 : 1 }}>
          {reparsing ? '⏳ Đang re-parse...' : '🔄 Re-parse MIDI'}
        </button>
        <button onClick={saveTab} disabled={saving}
          style={{ ...btnStyle('#059669'), opacity: saving ? 0.6 : 1 }}>
          {saving ? '💾 Đang lưu...' : '💾 Lưu Tab'}
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ padding:'12px 24px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
        {/* Track filter */}
        <div style={{ display:'flex', gap:6 }}>
          {(['all','right','left'] as const).map(t => (
            <button key={t} style={activeFilter(filter===t)} onClick={() => setFilter(t)}>
              {t === 'all' ? 'Tất cả' : t === 'right' ? '🟢 Right' : '🔵 Left'}
            </button>
          ))}
        </div>
        <div style={{ width:1, height:24, background:'rgba(255,255,255,0.15)' }} />
        {/* Role filter */}
        <div style={{ display:'flex', gap:6 }}>
          {(['all','melody','root','chord_tone'] as const).map(r => (
            <button key={r} style={activeFilter(filterRole===r)} onClick={() => setFilterRole(r)}>
              {r === 'all' ? 'Mọi role' : r}
            </button>
          ))}
        </div>

        <div style={{ flex:1 }} />

        {/* Selection actions */}
        {selected.size > 0 && (
          <div style={{ display:'flex', gap:8, alignItems:'center', background:'rgba(129,140,248,0.1)', padding:'6px 12px', borderRadius:8, border:'1px solid rgba(129,140,248,0.3)' }}>
            <span style={{ fontSize:13, color:'#818cf8' }}>{selected.size} chọn</span>
            <button onClick={() => transposeSelected(+1)}  style={{ ...btnStyle('#0ea5e9'), padding:'4px 10px' }}>▲ +1</button>
            <button onClick={() => transposeSelected(-1)}  style={{ ...btnStyle('#0ea5e9'), padding:'4px 10px' }}>▼ -1</button>
            <button onClick={() => transposeSelected(+12)} style={{ ...btnStyle('#6366f1'), padding:'4px 10px' }}>+8va</button>
            <button onClick={() => transposeSelected(-12)} style={{ ...btnStyle('#6366f1'), padding:'4px 10px' }}>-8va</button>
            <button onClick={() => switchTrack('right')}   style={{ ...btnStyle('#22c55e'), padding:'4px 10px' }}>→ Right</button>
            <button onClick={() => switchTrack('left')}    style={{ ...btnStyle('#3b82f6'), padding:'4px 10px' }}>→ Left</button>
            <button onClick={deleteSelected}               style={{ ...btnStyle('#ef4444'), padding:'4px 10px' }}>🗑 Xoá</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX:'auto', padding:'0 24px 24px' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', marginTop:12, fontSize:13 }}>
          <thead>
            <tr style={{ background:'rgba(255,255,255,0.05)', textAlign:'left' }}>
              <th style={{ padding:'10px 8px', width:36 }}>
                <input type="checkbox" checked={selected.size === visible.length && visible.length > 0}
                  onChange={toggleAll} style={{ cursor:'pointer' }} />
              </th>
              <th style={{ padding:'10px 8px' }}>#</th>
              <th style={{ padding:'10px 8px' }}>Nốt</th>
              <th style={{ padding:'10px 8px' }}>MIDI</th>
              <th style={{ padding:'10px 8px' }}>Start (s)</th>
              <th style={{ padding:'10px 8px' }}>Duration (s)</th>
              <th style={{ padding:'10px 8px' }}>Track</th>
              <th style={{ padding:'10px 8px' }}>Role</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((n, idx) => {
              const isSel = selected.has(n.id);
              const isEditing = (field: string) => editCell?.id === n.id && editCell.field === field;
              const rowBg = isSel ? 'rgba(129,140,248,0.12)' : (idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent');

              return (
                <tr key={n.id} style={{ background: rowBg, borderBottom:'1px solid rgba(255,255,255,0.04)' }}
                  onClick={() => toggleSelect(n.id)}>
                  <td style={{ padding:'8px' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleSelect(n.id)} />
                  </td>
                  <td style={{ padding:'8px', opacity:0.5 }}>{idx + 1}</td>

                  {/* Note name (readonly computed) */}
                  <td style={{ padding:'8px', fontWeight:700, color: n.track === 'right' ? '#86efac' : '#93c5fd' }}>
                    {n.note}
                  </td>

                  {/* MIDI number editable */}
                  <td style={{ padding:'4px 8px' }} onClick={e => { e.stopPropagation(); setEditCell({id:n.id, field:'midiNumber'}); }}>
                    {isEditing('midiNumber') ? (
                      <input type="number" defaultValue={n.midiNumber} min={21} max={108}
                        autoFocus
                        style={{ width:60, background:'#1e293b', border:'1px solid #818cf8', borderRadius:4, color:'#fff', padding:'2px 6px' }}
                        onBlur={e => { updateNote(n.id, 'midiNumber', Number(e.target.value)); setEditCell(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    ) : (
                      <span style={{ cursor:'text', padding:'2px 6px', borderRadius:4, border:'1px solid transparent',
                        ':hover': { borderColor:'#818cf8' } } as any}>{n.midiNumber}</span>
                    )}
                  </td>

                  {/* Start time editable */}
                  <td style={{ padding:'4px 8px' }} onClick={e => { e.stopPropagation(); setEditCell({id:n.id, field:'startTime'}); }}>
                    {isEditing('startTime') ? (
                      <input type="number" defaultValue={n.startTime} step={0.01}
                        autoFocus
                        style={{ width:80, background:'#1e293b', border:'1px solid #818cf8', borderRadius:4, color:'#fff', padding:'2px 6px' }}
                        onBlur={e => { updateNote(n.id, 'startTime', Number(e.target.value)); setEditCell(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    ) : (
                      <span style={{ cursor:'text', fontFamily:'monospace' }}>{n.startTime.toFixed(3)}</span>
                    )}
                  </td>

                  {/* Duration editable */}
                  <td style={{ padding:'4px 8px' }} onClick={e => { e.stopPropagation(); setEditCell({id:n.id, field:'duration'}); }}>
                    {isEditing('duration') ? (
                      <input type="number" defaultValue={n.duration} step={0.01} min={0.05}
                        autoFocus
                        style={{ width:80, background:'#1e293b', border:'1px solid #818cf8', borderRadius:4, color:'#fff', padding:'2px 6px' }}
                        onBlur={e => { updateNote(n.id, 'duration', Number(e.target.value)); setEditCell(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    ) : (
                      <span style={{ cursor:'text', fontFamily:'monospace' }}>{n.duration.toFixed(3)}</span>
                    )}
                  </td>

                  {/* Track toggle */}
                  <td style={{ padding:'4px 8px' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => updateNote(n.id, 'track', n.track === 'right' ? 'left' : 'right')}
                      style={{ padding:'2px 10px', borderRadius:12, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
                        background: n.track === 'right' ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)',
                        color: n.track === 'right' ? '#86efac' : '#93c5fd',
                      }}>
                      {n.track}
                    </button>
                  </td>

                  {/* Role */}
                  <td style={{ padding:'4px 8px', opacity:0.6, fontSize:12 }}>{n.role}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <div style={{ textAlign:'center', padding:40, opacity:0.5 }}>
            Không có nốt nào khớp bộ lọc
          </div>
        )}
      </div>
    </div>
  );
}
