declare module 'pitchfinder' {
  export interface PitchfinderConfig {
    sampleRate?: number;
    bufferSize?: number;
    threshold?: number;
  }

  export type PitchDetector = (float32AudioBuffer: Float32Array) => number | null;

  export const YIN: (config?: PitchfinderConfig) => PitchDetector;
  export const AMDF: (config?: PitchfinderConfig) => PitchDetector;
  export const MacLeod: (config?: PitchfinderConfig) => PitchDetector;
  export const DynamicWavelet: (config?: PitchfinderConfig) => PitchDetector;
}
