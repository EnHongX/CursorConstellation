import { contextBridge, ipcRenderer } from 'electron'
import { Point, Session, SessionInfo, PermissionStatus } from './types'

export interface DbErrorResponse {
  success: false
  error: string
}

export interface DbSuccessResponse<T> {
  success: true
  data: T
}

export type DbResponse<T> = DbSuccessResponse<T> | DbErrorResponse

export interface AppError {
  context: string
  message: string
  timestamp: number
}

contextBridge.exposeInMainWorld('electronAPI', {
  checkPermission: (): Promise<PermissionStatus> => {
    return ipcRenderer.invoke('permission:check')
  },

  requestPermission: (): Promise<PermissionStatus> => {
    return ipcRenderer.invoke('permission:request')
  },

  startRecording: (): void => {
    ipcRenderer.send('recording:start')
  },

  pauseRecording: (): void => {
    ipcRenderer.send('recording:pause')
  },

  resumeRecording: (): void => {
    ipcRenderer.send('recording:resume')
  },

  stopRecording: (): void => {
    ipcRenderer.send('recording:stop')
  },

  onNewPoint: (callback: (point: Point) => void) => {
    ipcRenderer.on('recording:point', (_event, point: Point) => {
      callback(point)
    })
    return () => ipcRenderer.removeAllListeners('recording:point')
  },

  onRecordingStarted: (callback: () => void) => {
    ipcRenderer.on('recording:started', () => callback())
    return () => ipcRenderer.removeAllListeners('recording:started')
  },

  onRecordingPaused: (callback: () => void) => {
    ipcRenderer.on('recording:paused', () => callback())
    return () => ipcRenderer.removeAllListeners('recording:paused')
  },

  onRecordingResumed: (callback: () => void) => {
    ipcRenderer.on('recording:resumed', () => callback())
    return () => ipcRenderer.removeAllListeners('recording:resumed')
  },

  onRecordingStopped: (callback: (session: Session) => void) => {
    ipcRenderer.on('recording:stopped', (_event, session: Session) => {
      callback(session)
    })
    return () => ipcRenderer.removeAllListeners('recording:stopped')
  },

  onPermissionStatus: (callback: (status: PermissionStatus) => void) => {
    ipcRenderer.on('permission:status', (_event, status: PermissionStatus) => {
      callback(status)
    })
    return () => ipcRenderer.removeAllListeners('permission:status')
  },

  onAppError: (callback: (error: AppError) => void) => {
    ipcRenderer.on('app:error', (_event, error: AppError) => {
      callback(error)
    })
    return () => ipcRenderer.removeAllListeners('app:error')
  },

  getSessions: (): Promise<DbResponse<SessionInfo[]>> => {
    return ipcRenderer.invoke('db:getSessions')
  },

  getSession: (id: string): Promise<DbResponse<Session | null>> => {
    return ipcRenderer.invoke('db:getSession', id)
  },

  deleteSession: (id: string): Promise<DbResponse<boolean>> => {
    return ipcRenderer.invoke('db:deleteSession', id)
  },

  searchSessions: (searchTerm: string): Promise<DbResponse<SessionInfo[]>> => {
    return ipcRenderer.invoke('db:searchSessions', searchTerm)
  },

  getSessionsByTimeRange: (startTime: number, endTime: number): Promise<DbResponse<SessionInfo[]>> => {
    return ipcRenderer.invoke('db:getSessionsByTimeRange', startTime, endTime)
  },

  updateSessionName: (id: string, name: string): Promise<DbResponse<boolean>> => {
    return ipcRenderer.invoke('db:updateSessionName', id, name)
  },

  updateSessionNote: (id: string, note: string): Promise<DbResponse<boolean>> => {
    return ipcRenderer.invoke('db:updateSessionNote', id, note)
  },

  setPollInterval: (interval: number): Promise<{ success: boolean; interval?: number; error?: string }> => {
    return ipcRenderer.invoke('recording:setPollInterval', interval)
  },

  getPollInterval: (): Promise<{ success: boolean; interval?: number; options?: number[]; error?: string }> => {
    return ipcRenderer.invoke('recording:getPollInterval')
  },
})

declare global {
  interface Window {
    electronAPI: {
      checkPermission: () => Promise<PermissionStatus>
      requestPermission: () => Promise<PermissionStatus>
      startRecording: () => void
      pauseRecording: () => void
      resumeRecording: () => void
      stopRecording: () => void
      onNewPoint: (callback: (point: Point) => void) => () => void
      onRecordingStarted: (callback: () => void) => () => void
      onRecordingPaused: (callback: () => void) => () => void
      onRecordingResumed: (callback: () => void) => () => void
      onRecordingStopped: (callback: (session: Session) => void) => () => void
      onPermissionStatus: (callback: (status: PermissionStatus) => void) => () => void
      onAppError: (callback: (error: AppError) => void) => () => void
      getSessions: () => Promise<DbResponse<SessionInfo[]>>
      getSession: (id: string) => Promise<DbResponse<Session | null>>
      deleteSession: (id: string) => Promise<DbResponse<boolean>>
      searchSessions: (searchTerm: string) => Promise<DbResponse<SessionInfo[]>>
      getSessionsByTimeRange: (startTime: number, endTime: number) => Promise<DbResponse<SessionInfo[]>>
      updateSessionName: (id: string, name: string) => Promise<DbResponse<boolean>>
      updateSessionNote: (id: string, note: string) => Promise<DbResponse<boolean>>
      setPollInterval: (interval: number) => Promise<{ success: boolean; interval?: number; error?: string }>
      getPollInterval: () => Promise<{ success: boolean; interval?: number; options?: number[]; error?: string }>
    }
  }
}
