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
