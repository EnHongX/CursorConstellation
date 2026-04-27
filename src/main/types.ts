export interface Point {
  x: number;
  y: number;
  timestamp: number;
  speed: number;
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped' | 'replaying';

export interface SessionInfo {
  id: string;
  pointCount: number;
  duration: number;
  startTime: number;
  endTime: number;
  pollInterval: number;
  name: string;
  note: string;
}

export interface Session extends SessionInfo {
  points: Point[];
}

export interface PermissionStatus {
  hasPermission: boolean;
  message: string;
}
