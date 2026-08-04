import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'kidspiano_settings_v1';

export interface UserSettings {
  waitMode: boolean;
  autoPlay: boolean;
  speed: number;
  chordMode: 'simple' | 'full' | 'arpeggio';
  numOctaves: number;
  showFingering: boolean;
  showChord: boolean;
  isMicEnabled: boolean;
  viewMode: 'falling' | 'sheet';
  sheetMusicEngine: 'osmd' | 'vexflow';
}

const DEFAULT_SETTINGS: UserSettings = {
  waitMode: true,
  autoPlay: false,
  speed: 1,
  chordMode: 'simple',
  numOctaves: 4,
  showFingering: false,
  showChord: true,
  isMicEnabled: false,
  viewMode: 'falling',
  sheetMusicEngine: 'osmd',
};

function load(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<UserSettings>(load);

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const updateSetting = useCallback(<K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    setSettingsState(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettingsState(DEFAULT_SETTINGS);
  }, []);

  return { settings, updateSetting, resetSettings };
}
