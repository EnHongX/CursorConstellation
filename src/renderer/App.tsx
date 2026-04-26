import React, { useCallback, useEffect, useRef, useState } from 'react'
import { HistoryPanel } from './components/HistoryPanel'
import { ProjectionView } from './components/ProjectionView'
import { ExportFormat, ExportView, ReplayControlsPanel } from './components/ReplayControlsPanel'
import { SpeedChartPanel } from './components/SpeedChartPanel'
import { TrackCanvasPanel } from './components/TrackCanvasPanel'
import { TrajectoryAnalysisPanel } from './components/TrajectoryAnalysisPanel'
import './App.css'
import {
  AppError,
  ColorMode,
  DbResponse,
  KeyPoint,
  PermissionStatus,
  Point,
  RecordingStatus,
  Session,
  SessionInfo,
} from './types'
import { formatDuration, formatTimestamp } from './utils/format'

const DEFAULT_TIME_RANGE_MS = 5000
const PLAYBACK_SPEEDS = [1, 2, 5, 10, 20]

const isElectron = typeof window !== 'undefined' && 'electronAPI' in window

function isDbError<T>(response: DbResponse<T>): response is { success: false; error: string } {
  return !response.success
}

function App() {
  const isElectronEnv = isElectron
  const timelineRef = useRef<HTMLDivElement>(null)
  const trackCanvasRef = useRef<HTMLCanvasElement>(null)
  const projectionCanvasRef = useRef<HTMLCanvasElement>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const replayPointsRef = useRef<Point[]>([])
  const replayIndexRef = useRef<number>(0)
  const playbackSpeedRef = useRef<number>(1)

  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [points, setPoints] = useState<Point[]>([])
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null)
  const [showPermissionWarning, setShowPermissionWarning] = useState(false)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [duration, setDuration] = useState<number>(0)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [appError, setAppError] = useState<AppError | null>(null)
  const [dbUnavailable, setDbUnavailable] = useState(false)
  const [loadedSession, setLoadedSession] = useState<Session | null>(null)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1)
  const [timeRangeStart, setTimeRangeStart] = useState<number>(0)
  const [timeRangeEnd, setTimeRangeEnd] = useState<number>(0)
  const [isDraggingLeft, setIsDraggingLeft] = useState(false)
  const [isDraggingRight, setIsDraggingRight] = useState(false)
  const [isDraggingRange, setIsDraggingRange] = useState(false)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartRange, setDragStartRange] = useState({ start: 0, end: 0 })
  const [colorMode, setColorMode] = useState<ColorMode>('time')
  const [showKeyPoints, setShowKeyPoints] = useState(true)
  const [selectedKeyPoint, setSelectedKeyPoint] = useState<KeyPoint | null>(null)
  const [hoveredTimeSegment, setHoveredTimeSegment] = useState<number | null>(null)

  const loadSessions = useCallback(async () => {
    if (!isElectronEnv || dbUnavailable) {
      return
    }

    try {
      const result = await window.electronAPI.getSessions()
      if (isDbError(result)) {
        console.error('Failed to load sessions:', result.error)
        setDbUnavailable(true)
        return
      }

      setSessions(result.data)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }, [dbUnavailable, isElectronEnv])

  const checkPermission = useCallback(async () => {
    if (!isElectronEnv) {
      return
    }

    try {
      const status = await window.electronAPI.checkPermission()
      setPermissionStatus(status)
      if (!status.hasPermission) {
        setShowPermissionWarning(true)
      }
    } catch (error) {
      console.error('Failed to check permission:', error)
    }
  }, [isElectronEnv])

  const handleRequestPermission = async () => {
    if (!isElectronEnv) {
      return
    }

    try {
      const status = await window.electronAPI.requestPermission()
      setPermissionStatus(status)
      setShowPermissionWarning(!status.hasPermission)
    } catch (error) {
      console.error('Failed to request permission:', error)
    }
  }

  const startDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
    }

    durationIntervalRef.current = setInterval(() => {
      setDuration((previous) => previous + 100)
    }, 100)
  }, [])

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
  }, [])

  const stopReplay = useCallback((clearPoints: boolean = true) => {
    if (replayIntervalRef.current) {
      clearTimeout(replayIntervalRef.current)
      replayIntervalRef.current = null
    }

    replayPointsRef.current = []
    replayIndexRef.current = 0
    setStatus('idle')
    if (clearPoints) {
      setPoints([])
    }
  }, [])

  const getPointsInTimeRange = useCallback((session: Session, startMs: number, endMs: number): Point[] => {
    if (session.points.length === 0) {
      return []
    }

    const rangeStartTimestamp = session.startTime + startMs
    const rangeEndTimestamp = session.startTime + endMs

    return session.points.filter((point) => point.timestamp >= rangeStartTimestamp && point.timestamp <= rangeEndTimestamp)
  }, [])

  const startReplay = useCallback((session: Session, startMs: number, endMs: number, speed: number) => {
    const pointsInRange = getPointsInTimeRange(session, startMs, endMs)
    if (pointsInRange.length === 0) {
      return
    }

    stopReplay(true)
    setStatus('replaying')
    setSelectedSession(session)
    replayPointsRef.current = pointsInRange
    replayIndexRef.current = 0
    playbackSpeedRef.current = speed
    setPoints([])

    const replayNext = () => {
      if (replayIndexRef.current >= replayPointsRef.current.length) {
        stopReplay(false)
        return
      }

      const currentPoint = replayPointsRef.current[replayIndexRef.current]
      const nextPoint = replayPointsRef.current[replayIndexRef.current + 1]

      setPoints((previous) => [...previous, currentPoint])
      replayIndexRef.current += 1

      if (nextPoint) {
        const delay = (nextPoint.timestamp - currentPoint.timestamp) / playbackSpeedRef.current
        replayIntervalRef.current = setTimeout(replayNext, Math.max(delay, 1))
      } else {
        stopReplay(false)
      }
    }

    replayNext()
  }, [getPointsInTimeRange, stopReplay])

  const handleStart = () => {
    if (!isElectronEnv) {
      return
    }

    setPoints([])
    setSessionInfo(null)
    setSelectedSession(null)
    setLoadedSession(null)
    setDuration(0)
    setStartTime(Date.now())
    window.electronAPI.startRecording()
    startDurationTimer()
  }

  const handlePause = () => {
    if (!isElectronEnv) {
      return
    }

    window.electronAPI.pauseRecording()
    stopDurationTimer()
  }

  const handleResume = () => {
    if (!isElectronEnv) {
      return
    }

    window.electronAPI.resumeRecording()
    startDurationTimer()
  }

  const handleStop = () => {
    if (!isElectronEnv) {
      return
    }

    window.electronAPI.stopRecording()
    stopDurationTimer()
  }

  const initTimeRange = useCallback((session: Session) => {
    const totalDuration = session.duration
    const defaultRange = Math.min(DEFAULT_TIME_RANGE_MS, totalDuration)
    const start = totalDuration - defaultRange
    const end = totalDuration

    setTimeRangeStart(start)
    setTimeRangeEnd(end)
    setSelectedKeyPoint(null)
    setHoveredTimeSegment(null)
    setPoints(getPointsInTimeRange(session, start, end))
  }, [getPointsInTimeRange])

  const handleLoadSession = async (sessionId: string) => {
    if (!isElectronEnv) {
      return
    }

    try {
      const result = await window.electronAPI.getSession(sessionId)
      if (isDbError(result)) {
        console.error('Failed to load session:', result.error)
        return
      }

      if (result.data) {
        stopReplay()
        setLoadedSession(result.data)
        setSelectedSession(result.data)
        initTimeRange(result.data)
      }
    } catch (error) {
      console.error('Failed to load session:', error)
    }
  }

  const handlePlayReplay = () => {
    if (!loadedSession) {
      return
    }

    startReplay(loadedSession, timeRangeStart, timeRangeEnd, playbackSpeed)
  }

  const handleDeleteSession = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!isElectronEnv) {
      return
    }

    try {
      const result = await window.electronAPI.deleteSession(sessionId)
      if (isDbError(result)) {
        console.error('Failed to delete session:', result.error)
        return
      }

      await loadSessions()
      if (loadedSession?.id === sessionId) {
        stopReplay()
        setLoadedSession(null)
        setSelectedSession(null)
        setPoints([])
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const handleExport = useCallback((format: ExportFormat, view?: ExportView) => {
    if (!loadedSession) {
      return
    }

    if (format === 'json') {
      const pointsInRange = getPointsInTimeRange(loadedSession, timeRangeStart, timeRangeEnd)
      const exportData = {
        sessionId: loadedSession.id,
        startTime: loadedSession.startTime + timeRangeStart,
        endTime: loadedSession.startTime + timeRangeEnd,
        duration: timeRangeEnd - timeRangeStart,
        pointCount: pointsInRange.length,
        points: pointsInRange.map((point) => ({
          x: point.x,
          y: point.y,
          timestamp: point.timestamp,
          speed: point.speed,
        })),
      }

      const jsonString = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `session_${loadedSession.id}_${Date.now()}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } else if (format === 'png') {
      const exportCanvas = (canvas: HTMLCanvasElement | null, suffix: string) => {
        if (!canvas) {
          return
        }
        const url = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        link.href = url
        link.download = `session_${loadedSession.id}_${suffix}_${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      if (view === 'track' || view === 'both') {
        exportCanvas(trackCanvasRef.current, 'track')
      }
      if (view === 'projection' || view === 'both') {
        exportCanvas(projectionCanvasRef.current, 'projection')
      }
    }
  }, [loadedSession, getPointsInTimeRange, timeRangeStart, timeRangeEnd])

  const handlePlaybackSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed)
    playbackSpeedRef.current = speed
  }, [])

  const getTimelinePosition = useCallback((clientX: number): number => {
    if (!timelineRef.current) {
      return 0
    }

    const rect = timelineRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    return x / rect.width
  }, [])

  const handleTimelineMouseDown = useCallback((event: React.MouseEvent, type: 'left' | 'right' | 'range') => {
    event.preventDefault()
    event.stopPropagation()

    if (type === 'left') {
      setIsDraggingLeft(true)
    } else if (type === 'right') {
      setIsDraggingRight(true)
    } else {
      setIsDraggingRange(true)
      setDragStartX(event.clientX)
      setDragStartRange({ start: timeRangeStart, end: timeRangeEnd })
    }
  }, [timeRangeEnd, timeRangeStart])

  const handleTimelineMouseMove = useCallback((event: React.MouseEvent) => {
    if (!loadedSession) {
      return
    }

    const totalDuration = loadedSession.duration

    if (isDraggingLeft) {
      const position = getTimelinePosition(event.clientX)
      const newStart = Math.max(0, Math.min(position * totalDuration, timeRangeEnd - 100))
      setTimeRangeStart(newStart)
      setPoints(getPointsInTimeRange(loadedSession, newStart, timeRangeEnd))
      return
    }

    if (isDraggingRight) {
      const position = getTimelinePosition(event.clientX)
      const newEnd = Math.max(timeRangeStart + 100, Math.min(position * totalDuration, totalDuration))
      setTimeRangeEnd(newEnd)
      setPoints(getPointsInTimeRange(loadedSession, timeRangeStart, newEnd))
      return
    }

    if (isDraggingRange) {
      const deltaX = event.clientX - dragStartX
      const timelineWidth = timelineRef.current?.getBoundingClientRect().width || 1
      const deltaTime = (deltaX / timelineWidth) * totalDuration

      let newStart = dragStartRange.start + deltaTime
      let newEnd = dragStartRange.end + deltaTime

      if (newStart < 0) {
        newEnd -= newStart
        newStart = 0
      }

      if (newEnd > totalDuration) {
        newStart -= newEnd - totalDuration
        newEnd = totalDuration
      }

      setTimeRangeStart(newStart)
      setTimeRangeEnd(newEnd)
      setPoints(getPointsInTimeRange(loadedSession, newStart, newEnd))
    }
  }, [
    dragStartRange,
    dragStartX,
    getPointsInTimeRange,
    getTimelinePosition,
    isDraggingLeft,
    isDraggingRange,
    isDraggingRight,
    loadedSession,
    timeRangeEnd,
    timeRangeStart,
  ])

  const handleTimelineMouseUp = useCallback(() => {
    setIsDraggingLeft(false)
    setIsDraggingRight(false)
    setIsDraggingRange(false)
    setSelectedKeyPoint(null)
    setHoveredTimeSegment(null)
  }, [])

  useEffect(() => {
    if (!(isDraggingLeft || isDraggingRight || isDraggingRange)) {
      return
    }

    const handleGlobalMouseMove = (event: MouseEvent) => {
      handleTimelineMouseMove(event as unknown as React.MouseEvent)
    }

    const handleGlobalMouseUp = () => {
      handleTimelineMouseUp()
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [handleTimelineMouseMove, handleTimelineMouseUp, isDraggingLeft, isDraggingRange, isDraggingRight])

  useEffect(() => {
    if (!isElectronEnv) {
      return
    }

    const cleanupFns: Array<() => void> = []

    cleanupFns.push(window.electronAPI.onNewPoint((point) => {
      setPoints((previous) => [...previous, point])
    }))

    cleanupFns.push(window.electronAPI.onRecordingStarted(() => {
      setStatus('recording')
    }))

    cleanupFns.push(window.electronAPI.onRecordingPaused(() => {
      setStatus('paused')
    }))

    cleanupFns.push(window.electronAPI.onRecordingResumed(() => {
      setStatus('recording')
    }))

    cleanupFns.push(window.electronAPI.onRecordingStopped((session) => {
      setStatus('stopped')
      setSessionInfo({
        id: session.id,
        pointCount: session.pointCount,
        duration: session.duration,
        startTime: session.startTime,
        endTime: session.endTime,
      })
      stopDurationTimer()
      loadSessions()
    }))

    cleanupFns.push(window.electronAPI.onPermissionStatus((status) => {
      setPermissionStatus(status)
      setShowPermissionWarning(!status.hasPermission)
    }))

    cleanupFns.push(window.electronAPI.onAppError((error) => {
      console.error('App error:', error)
      setAppError(error)

      if (error.context === 'database_init') {
        setDbUnavailable(true)
      }
    }))

    return () => {
      cleanupFns.forEach((cleanup) => cleanup())
    }
  }, [isElectronEnv, loadSessions, stopDurationTimer])

  useEffect(() => {
    if (!isElectronEnv) {
      return
    }

    checkPermission()
    loadSessions()
  }, [checkPermission, isElectronEnv, loadSessions])

  useEffect(() => () => {
    stopDurationTimer()
    stopReplay()
  }, [stopDurationTimer, stopReplay])

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return '等待开始'
      case 'recording':
        return '记录中...'
      case 'paused':
        return '已暂停'
      case 'stopped':
        return '已停止'
      case 'replaying':
        return '回放中...'
    }
  }

  const getStatusDotClass = () => (status === 'replaying' ? 'replaying' : status)

  const dismissError = () => {
    setAppError(null)
  }

  if (!isElectronEnv) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Cursor Constellation</h1>
          <p className="subtitle">鼠标轨迹记录应用</p>
        </header>
        <main className="app-main app-main-centered">
          <div className="electron-only-card">
            <p className="electron-only-warning">⚠️ 请在 Electron 环境中运行此应用</p>
            <p className="electron-only-message">此应用需要在 Electron 桌面环境中运行才能使用完整功能</p>
            <p className="electron-only-hint">使用 npm run dev 或 npm run start 启动应用</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Cursor Constellation</h1>
        <p className="subtitle">鼠标轨迹记录应用</p>
      </header>

      <main className="app-main">
        {appError && (
          <div className="error-banner">
            <div className="error-banner-content">
              <span className="error-icon">⚠</span>
              <div>
                <p className="error-title">发生错误: {appError.context}</p>
                <p className="error-message">{appError.message}</p>
              </div>
              <button className="error-close-btn" onClick={dismissError}>✕</button>
            </div>
          </div>
        )}

        {dbUnavailable && (
          <div className="error-banner warning-banner">
            <div className="error-banner-content">
              <span className="error-icon">💾</span>
              <div>
                <p className="error-title">数据库不可用</p>
                <p className="error-message">历史记录功能将不可用。可能是 better-sqlite3 模块未正确编译。请尝试重新运行 npm run rebuild</p>
              </div>
            </div>
          </div>
        )}

        <div className="main-content">
          <div className="left-panel">
            <TrackCanvasPanel
              ref={trackCanvasRef}
              colorMode={colorMode}
              loadedSession={loadedSession}
              playbackSpeed={playbackSpeed}
              points={points}
              selectedKeyPoint={selectedKeyPoint}
              selectedSession={selectedSession}
              showKeyPoints={showKeyPoints}
              status={status}
              onColorModeChange={setColorMode}
              onShowKeyPointsChange={setShowKeyPoints}
            />

            <ProjectionView
              ref={projectionCanvasRef}
              colorMode={colorMode}
              points={points}
              selectedKeyPoint={selectedKeyPoint}
              showKeyPoints={showKeyPoints}
            />

            {loadedSession && (
              <ReplayControlsPanel
                loadedSession={loadedSession}
                playbackSpeed={playbackSpeed}
                playbackSpeeds={PLAYBACK_SPEEDS}
                status={status}
                timeRangeEnd={timeRangeEnd}
                timeRangeStart={timeRangeStart}
                timelineRef={timelineRef}
                onExport={handleExport}
                onPlay={handlePlayReplay}
                onPlaybackSpeedChange={handlePlaybackSpeedChange}
                onStop={stopReplay}
                onTimelineMouseDown={handleTimelineMouseDown}
                onTimelineMouseMove={handleTimelineMouseMove}
              />
            )}

            <div className="controls">
              <div className="button-group">
                <button
                  className={`control-btn start-btn ${(status === 'recording' || status === 'paused' || status === 'replaying') ? 'disabled' : ''}`}
                  onClick={handleStart}
                  disabled={status === 'recording' || status === 'paused' || status === 'replaying'}
                >
                  <span className="btn-icon">▶</span>
                  开始
                </button>

                <button
                  className={`control-btn pause-btn ${status !== 'recording' ? 'disabled' : ''}`}
                  onClick={handlePause}
                  disabled={status !== 'recording'}
                >
                  <span className="btn-icon">⏸</span>
                  暂停
                </button>

                <button
                  className={`control-btn resume-btn ${status !== 'paused' ? 'disabled' : ''}`}
                  onClick={handleResume}
                  disabled={status !== 'paused'}
                >
                  <span className="btn-icon">▶▶</span>
                  继续
                </button>

                <button
                  className={`control-btn stop-btn ${(status !== 'recording' && status !== 'paused') ? 'disabled' : ''}`}
                  onClick={handleStop}
                  disabled={status !== 'recording' && status !== 'paused'}
                >
                  <span className="btn-icon">⏹</span>
                  停止
                </button>
              </div>

              <div className="status-indicator">
                <div className={`status-dot ${getStatusDotClass()}`}></div>
                <span className="status-text">{getStatusText()}</span>
                {(status === 'recording' || status === 'replaying') && (
                  <span className="point-count">已记录 {points.length} 个点</span>
                )}
              </div>
            </div>

            {showPermissionWarning && permissionStatus && (
              <div className="permission-warning">
                <div className="warning-icon">⚠</div>
                <div className="warning-content">
                  <p className="warning-title">权限不足</p>
                  <p className="warning-message">{permissionStatus.message}</p>
                </div>
                <button className="request-permission-btn" onClick={handleRequestPermission}>
                  请求权限
                </button>
                <button className="close-warning-btn" onClick={() => setShowPermissionWarning(false)}>
                  ✕
                </button>
              </div>
            )}

            {(status === 'recording' || status === 'paused' || status === 'stopped') && !loadedSession && (
              <div className="session-stats">
                <h3>当前 Session</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">轨迹点数</span>
                    <span className="stat-value">{points.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">开始时间</span>
                    <span className="stat-value stat-text">{startTime ? formatTimestamp(startTime) : '-'}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">持续时间</span>
                    <span className="stat-value stat-text">{formatDuration(duration)}</span>
                  </div>
                </div>
              </div>
            )}

            {sessionInfo && status === 'stopped' && !loadedSession && (
              <div className="session-summary">
                <h2>本次记录总结</h2>
                <div className="summary-stats">
                  <div className="stat-item">
                    <span className="stat-label">轨迹点数</span>
                    <span className="stat-value">{sessionInfo.pointCount}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">持续时间</span>
                    <span className="stat-value">{formatDuration(sessionInfo.duration)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">开始时间</span>
                    <span className="stat-value stat-text">{formatTimestamp(sessionInfo.startTime)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="right-panel">
            <SpeedChartPanel points={points} showKeyPoints={showKeyPoints} />
            <TrajectoryAnalysisPanel
              hoveredTimeSegment={hoveredTimeSegment}
              points={points}
              selectedKeyPoint={selectedKeyPoint}
              onHoverTimeSegmentChange={setHoveredTimeSegment}
              onSelectKeyPoint={setSelectedKeyPoint}
            />
            <HistoryPanel
              dbUnavailable={dbUnavailable}
              loadedSessionId={loadedSession?.id || null}
              sessions={sessions}
              onDeleteSession={handleDeleteSession}
              onLoadSession={handleLoadSession}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
