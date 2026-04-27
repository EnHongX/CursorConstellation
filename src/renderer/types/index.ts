export interface Point {
  x: number;
  y: number;
  timestamp: number;
  speed: number;
}

export type ColorMode = 'time' | 'speed';

export interface SpeedStats {
  min: number;
  max: number;
  avg: number;
  median: number;
}

export interface KeyPoint {
  type: 'pause' | 'turn' | 'speed_change';
  index: number;
  timestamp: number;
  x: number;
  y: number;
  description: string;
}

export interface TimeSegment {
  start: number;
  end: number;
  points: Point[];
  avgSpeed: number;
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

export interface DbErrorResponse {
  success: false;
  error: string;
}

export interface DbSuccessResponse<T> {
  success: true;
  data: T;
}

export type DbResponse<T> = DbSuccessResponse<T> | DbErrorResponse;

export interface AppError {
  context: string;
  message: string;
  timestamp: number;
}
