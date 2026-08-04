import React from 'react';
import { UserSettings } from '../hooks/useSettings';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdate: <K extends keyof UserSettings>(key: K, val: UserSettings[K]) => void;
  onReset: () => void;
  numOctaves: number;
  onOctavesChange: (n: number) => void;
}

// ── Toggle switch ──────────────────────────────────────────────────────────────
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; color?: string }> = ({
  checked, onChange, color = '#00E676',
}) => (
  <div
    onClick={() => onChange(!checked)}
    style={{
      width: 48, height: 26, borderRadius: 13, cursor: 'pointer', flexShrink: 0,
      background: checked ? color : 'rgba(255,255,255,0.15)',
      position: 'relative', transition: 'background 0.25s',
      boxShadow: checked ? `0 0 10px ${color}60` : 'none',
    }}
  >
    <div style={{
      position: 'absolute', top: 3, left: checked ? 25 : 3,
      width: 20, height: 20, borderRadius: '50%',
      background: '#fff', transition: 'left 0.25s',
      boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    }} />
  </div>
);

// ── Row wrapper ────────────────────────────────────────────────────────────────
const Row: React.FC<{ label: string; icon: string; children: React.ReactNode }> = ({ label, icon, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
      <span style={{ fontSize: 18 }}>{icon}</span>{label}
    </span>
    {children}
  </div>
);

// ── Section header ─────────────────────────────────────────────────────────────
const Section: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', padding: '16px 0 4px' }}>
    {title}
  </div>
);

// ── Speed pill selector ────────────────────────────────────────────────────────
const SpeedPills: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div style={{ display: 'flex', gap: 4 }}>
    {[0.5, 0.75, 1, 1.25].map(s => (
      <button key={s} onClick={() => onChange(s)} style={{
        padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
        background: value === s ? 'linear-gradient(135deg,#00C9FF,#92FE9D)' : 'rgba(255,255,255,0.12)',
        color: value === s ? '#000' : '#fff', fontWeight: 700, transition: 'all 0.2s',
      }}>{s}x</button>
    ))}
  </div>
);

// ── Chord mode selector ────────────────────────────────────────────────────────
const ChordPills: React.FC<{ value: string; onChange: (v: 'simple'|'full'|'arpeggio') => void }> = ({ value, onChange }) => (
  <div style={{ display: 'flex', gap: 4 }}>
    {(['simple','full','arpeggio'] as const).map(m => (
      <button key={m} onClick={() => onChange(m)} style={{
        padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
        background: value === m ? 'linear-gradient(135deg,#11998e,#38ef7d)' : 'rgba(255,255,255,0.12)',
        color: value === m ? '#000' : '#fff', fontWeight: 700, transition: 'all 0.2s',
      }}>{m === 'simple' ? 'Bass' : m === 'full' ? 'Chord' : 'Rải'}</button>
    ))}
  </div>
);

// ── Octave stepper ─────────────────────────────────────────────────────────────
const OctaveStepper: React.FC<{ value: number; onChange: (n: number) => void }> = ({ value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <button onClick={() => onChange(Math.max(2, value - 1))} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 16, fontWeight: 900 }}>-</button>
    <span style={{ fontSize: 18, fontWeight: 900, color: '#FFD700', minWidth: 20, textAlign: 'center' }}>{value}</span>
    <button onClick={() => onChange(Math.min(5, value + 1))} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 16, fontWeight: 900 }}>+</button>
  </div>
);

// ── Main Settings Panel ────────────────────────────────────────────────────────
export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  open, onClose, settings, onUpdate, onReset, numOctaves, onOctavesChange,
}) => (
  <>
    {/* Overlay */}
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 200, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
      transition: 'opacity 0.3s',
    }} />

    {/* Drawer */}
    <div style={{
      position: 'fixed', top: 0, right: 0, height: '100%', width: 320,
      background: 'linear-gradient(180deg, #0f0f2a 0%, #1a1a3e 100%)',
      borderLeft: '1px solid rgba(255,255,255,0.1)',
      backdropFilter: 'blur(20px)',
      zIndex: 201, overflowY: 'auto',
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)',
      padding: '0 20px 32px',
      fontFamily: 'Nunito, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 8px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>⚙️ Cài đặt</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>

      {/* \u2500\u2500 Ch\u1ebf \u0111\u1ed9 xem \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <Section title="\ud83c\udfbc Ch\u1ebf \u0111\u1ed9 xem" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        {(['falling', 'sheet'] as const).map(mode => (
          <button key={mode} onClick={() => onUpdate('viewMode', mode)} style={{
            flex: 1, padding: '10px 4px', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: settings.viewMode === mode
              ? 'linear-gradient(135deg,#667eea,#764ba2)'
              : 'rgba(255,255,255,0.10)',
            color: '#fff', fontWeight: 800,
            fontFamily: 'Nunito, sans-serif', fontSize: 13,
            transition: 'all 0.22s',
            boxShadow: settings.viewMode === mode ? '0 0 12px rgba(118,75,162,0.5)' : 'none',
          }}>
            {mode === 'falling' ? '\ud83c\udfb5 N\u1ed1t r\u01a1i' : '\ud83d\udcdc Khu\u00f4ng nh\u1ea1c'}
          </button>
        ))}
      </div>

      {/* \u2500\u2500 Gameplay \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <Section title="\ud83c\udfae Gameplay" />

      <Row label="Wait Mode" icon="⏸">
        <Toggle checked={settings.waitMode} onChange={v => onUpdate('waitMode', v)} color="#FFD700" />
      </Row>

      <Row label="Auto Play" icon="🤖">
        <Toggle checked={settings.autoPlay} onChange={v => onUpdate('autoPlay', v)} color="#FF4B2B" />
      </Row>

      <Row label="Tốc độ" icon="🚀">
        <SpeedPills value={settings.speed} onChange={v => onUpdate('speed', v)} />
      </Row>

      <Row label="Hợp âm (Tay trái)" icon="🎸">
        <ChordPills value={settings.chordMode} onChange={v => onUpdate('chordMode', v)} />
      </Row>

      {settings.viewMode === 'sheet' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🎼</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Kiểu Bản nhạc</span>
          </div>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', borderRadius: '20px', padding: '4px' }}>
            {['osmd', 'vexflow'].map(engine => (
              <button
                key={engine}
                onClick={() => onUpdate('sheetMusicEngine', engine as 'osmd' | 'vexflow')}
                style={{
                  background: settings.sheetMusicEngine === engine ? 'linear-gradient(135deg, #FF416C, #FF4B2B)' : 'transparent',
                  color: settings.sheetMusicEngine === engine ? '#fff' : 'rgba(255,255,255,0.6)',
                  border: 'none',
                  padding: '6px 16px',
                  borderRadius: '16px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: settings.sheetMusicEngine === engine ? '0 0 12px rgba(255,65,108,0.5)' : 'none',
                }}>
                {engine === 'osmd' ? 'Gốc (OSMD)' : 'Tự đệm (VexFlow)'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Piano ─────────────────────────────────────── */}
      <Section title="🎹 Bàn phím" />

      <Row label="Số quãng" icon="🎹">
        <OctaveStepper value={numOctaves} onChange={onOctavesChange} />
      </Row>

      <Row label="Mic Piano Cơ" icon="🎙️">
        <Toggle checked={settings.isMicEnabled} onChange={v => onUpdate('isMicEnabled', v)} color="#00C9FF" />
      </Row>

      {/* ── Hiển thị ──────────────────────────────────── */}
      <Section title="👁️ Hiển thị" />

      <Row label="Tên hợp âm" icon="🔠">
        <Toggle checked={settings.showChord} onChange={v => onUpdate('showChord', v)} color="#8E2DE2" />
      </Row>

      <Row label="Ngón tay" icon="🖐️">
        <Toggle checked={settings.showFingering} onChange={v => onUpdate('showFingering', v)} color="#FF9800" />
      </Row>

      {/* Reset */}
      <div style={{ marginTop: 28, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20, textAlign: 'center' }}>
        <button onClick={onReset} style={{
          padding: '8px 24px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)',
          background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
          fontSize: 13, fontFamily: 'Nunito, sans-serif', transition: 'all 0.2s',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
        >
          🔄 Đặt lại mặc định
        </button>
      </div>
    </div>
  </>
);
