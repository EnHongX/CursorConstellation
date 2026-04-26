export interface Point {
  x: number;
  y: number;
  timestamp: number;
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';

export interface SessionInfo {
  pointCount: number;
  duration: number;
}
