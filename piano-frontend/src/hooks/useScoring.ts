import { useState, useCallback, useRef } from 'react';
import { ActiveNote, HitResult } from '../types';

export const useScoring = () => {
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [stars, setStars] = useState(0);

  // Use refs for values needed inside callbacks to avoid stale closures
  const comboRef = useRef(0);
  const hitRef = useRef(0);
  const totalRef = useRef(0);

  /**
   * Calculate hit quality based on timing accuracy.
   * Perfect: within 25% of hitWindowMs
   * Good:    within 100% of hitWindowMs
   * Miss:    outside window
   */
  const calculateHit = useCallback(
    (timeDiff: number, hitWindowMs: number): HitResult => {
      const absMs = Math.abs(timeDiff * 1000);
      if (absMs < hitWindowMs * 0.25) return 'perfect';
      if (absMs < hitWindowMs) return 'good';
      return 'miss';
    },
    []
  );

  /** Call when a note is successfully hit. Note object is accepted but not required for scoring. */
  const addHit = useCallback((_note: ActiveNote, result: HitResult) => {
    hitRef.current += 1;
    totalRef.current += 1;

    const newCombo = comboRef.current + 1;
    comboRef.current = newCombo;
    setCombo(newCombo);

    const basePoints = result === 'perfect' ? 100 : 50;
    const comboMultiplier = Math.max(1, Math.floor(newCombo / 5) + 1);
    setScore(prev => prev + basePoints * comboMultiplier);

    const accuracy = hitRef.current / totalRef.current;
    setStars(accuracy >= 0.8 ? 3 : accuracy >= 0.5 ? 2 : 1);
  }, []);

  /** Call when a note is missed. */
  const addMiss = useCallback((_note: ActiveNote) => {
    totalRef.current += 1;
    comboRef.current = 0;
    setCombo(0);

    const accuracy = hitRef.current / totalRef.current;
    setStars(accuracy >= 0.8 ? 3 : accuracy >= 0.5 ? 2 : 1);
  }, []);

  const reset = useCallback(() => {
    setScore(0);
    setCombo(0);
    setStars(0);
    comboRef.current = 0;
    hitRef.current = 0;
    totalRef.current = 0;
  }, []);

  return { score, combo, stars, addHit, addMiss, reset, calculateHit };
};
