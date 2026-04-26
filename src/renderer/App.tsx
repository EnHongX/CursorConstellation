import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Point, RecordingStatus, Session, SessionInfo, PermissionStatus, AppError, DbResponse } from './types'
import './App.css'

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 400
const POINT_DISPLAY_LIMIT = 2000

const isElectron = typeof window !== 'undefined' && 'electronAPI' in window

function isDbError<T>(response: DbResponse<T>): response is { success: false; error: string } {
  return !response.success
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const replayPointsRef = useRef<Point[]>([])
  const replayIndexRef = useRef<number>(0)

  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [points, setPoints] = useState<Point[]>([])
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null)
  const [showPermissionWarning, setShowPermissionWarning] = useState(false)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [duration, setDuration] = useState<number>(0)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [isElectronEnv, setIsElectronEnv] = useState(isElectron)
  const [appError, setAppError] = useState<AppError | null>(null)
  const [dbUnavailable, setDbUnavailable] = useState(false)

  const loadSessions = useCallback(async () => {
    if (!isElectronEnv || dbUnavailable) return
    
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
  }, [isElectronEnv, dbUnavailable])

  const checkPermission = useCallback(async () => {
    if (!isElectronEnv) return
    
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
    if (!isElectronEnv) return
    
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
      setDuration(prev => prev + 100)
    }, 100)
  }, [])

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
  }, [])

  const stopReplay = useCallback(() => {
    if (replayIntervalRef.current) {
      clearTimeout(replayIntervalRef.current)
      replayIntervalRef.current = null
    }
    replayPointsRef.current = []
    replayIndexRef.current = 0
    setStatus('idle')
    setSelectedSession(null)
    setPoints([])
  }, [])

  const startReplay = useCallback((session: Session) => {
    if (session.points.length === 0) return

    stopReplay()
    setStatus('replaying')
    setSelectedSession(session)
    replayPointsRef.current = session.points
    replayIndexRef.current = 0
    setPoints([])

    const replayNext = () => {
      if (replayIndexRef.current >= replayPointsRef.current.length) {
        stopReplay()
        return
      }

      const currentPoint = replayPointsRef.current[replayIndexRef.current]
      const nextPoint = replayPointsRef.current[replayIndexRef.current + 1]

      setPoints(prev => [...prev, currentPoint])
      replayIndexRef.current++

      if (nextPoint) {
        const delay = nextPoint.timestamp - currentPoint.timestamp
        replayIntervalRef.current = setTimeout(replayNext, Math.max(delay, 1))
      } else {
        stopReplay()
      }
    }

    replayNext()
  }, [stopReplay])

  const handleStart = () => {
    if (!isElectronEnv) return
    setPoints([])
    setSessionInfo(null)
    setSelectedSession(null)
    setDuration(0)
    setStartTime(Date.now())
    window.electronAPI.startRecording()
    startDurationTimer()
  }

  const handlePause = () => {
    if (!isElectronEnv) return
    window.electronAPI.pauseRecording()
    stopDurationTimer()
  }

  const handleResume = () => {
    if (!isElectronEnv) return
    window.electronAPI.resumeRecording()
    startDurationTimer()
  }

  const handleStop = () => {
    if (!isElectronEnv) return
    window.electronAPI.stopRecording()
    stopDurationTimer()
  }

  const handleLoadSession = async (sessionId: string) => {
    if (!isElectronEnv) return
    
    try {
      const result = await window.electronAPI.getSession(sessionId)
      
      if (isDbError(result)) {
        console.error('Failed to load session:', result.error)
        return
      }
      
      if (result.data) {
        startReplay(result.data)
      }
    } catch (error) {
      console.error('Failed to load session:', error)
    }
  }

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isElectronEnv) return
    
    try {
      const result = await window.electronAPI.deleteSession(sessionId)
      
      if (isDbError(result)) {
        console.error('Failed to delete session:', result.error)
        return
      }
      
      await loadSessions()
      
      if (selectedSession?.id === sessionId) {
        stopReplay()
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const normalizePoints = useCallback((inputPoints: Point[]): { x: number; y: number; speed: number }[] => {
    if (inputPoints.length === 0) return []

    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity

    for (const point of inputPoints) {
      if (point.x < minX) minX = point.x
      if (point.x > maxX) maxX = point.x
      if (point.y < minY) minY = point.y
      if (point.y > maxY) maxY = point.y
    }

    const padding = 30
    const rangeX = maxX - minX
    const rangeY = maxY - minY
    const canvasAvailableWidth = CANVAS_WIDTH - padding * 2
    const canvasAvailableHeight = CANVAS_HEIGHT - padding * 2

    let scale = 1
    if (rangeX > 0 && rangeY > 0) {
      const scaleX = canvasAvailableWidth / rangeX
      const scaleY = canvasAvailableHeight / rangeY
      scale = Math.min(scaleX, scaleY)
    }

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const canvasCenterX = CANVAS_WIDTH / 2
    const canvasCenterY = CANVAS_HEIGHT / 2

    return inputPoints.map(point => ({
      x: canvasCenterX + (point.x - centerX) * scale,
      y: canvasCenterY + (point.y - centerY) * scale,
      speed: point.speed
    }))
  }, [])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#16213e'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    const gridSize = 40
    for (let x = 0; x <= CANVAS_WIDTH; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, CANVAS_HEIGHT)
      ctx.stroke()
    }
    for (let y = 0; y <= CANVAS_HEIGHT; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(CANVAS_WIDTH, y)
      ctx.stroke()
    }

    let displayPoints = points
    if (points.length > POINT_DISPLAY_LIMIT) {
      const step = Math.floor(points.length / POINT_DISPLAY_LIMIT)
      displayPoints = points.filter((_, i) => i % step === 0 || i === points.length - 1)
    }

    const normalizedPoints = normalizePoints(displayPoints)

    if (normalizedPoints.length === 0) return

    ctx.strokeStyle = '#e94560'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    ctx.moveTo(normalizedPoints[0].x, normalizedPoints[0].y)
    for (let i = 1; i < normalizedPoints.length; i++) {
      ctx.lineTo(normalizedPoints[i].x, normalizedPoints[i].y)
    }
    ctx.stroke()

    const lastNPoints = Math.min(normalizedPoints.length, 100)
    const startIndex = normalizedPoints.length - lastNPoints

    for (let i = startIndex; i < normalizedPoints.length; i++) {
      const point = normalizedPoints[i]
      const alpha = 0.3 + ((i - startIndex) / lastNPoints) * 0.7
      ctx.fillStyle = `rgba(233, 69, 96, ${alpha})`
      ctx.beginPath()
      const size = i === normalizedPoints.length - 1 ? 6 : 3
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2)
      ctx.fill()
    }

    const lastPoint = normalizedPoints[normalizedPoints.length - 1]
    const gradient = ctx.createRadialGradient(
      lastPoint.x, lastPoint.y, 0,
      lastPoint.x, lastPoint.y, 20
    )
    gradient.addColorStop(0, 'rgba(233, 69, 96, 0.5)')
    gradient.addColorStop(1, 'rgba(233, 69, 96, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(lastPoint.x, lastPoint.y, 20, 0, Math.PI * 2)
    ctx.fill()
  }, [points, normalizePoints])

  useEffect(() => {
    if (!isElectronEnv) return

    const cleanupFns: (() => void)[] = []

    const unsub1 = window.electronAPI.onNewPoint((point) => {
      setPoints(prev => [...prev, point])
    })
    cleanupFns.push(unsub1)

    const unsub2 = window.electronAPI.onRecordingStarted(() => {
      setStatus('recording')
    })
    cleanupFns.push(unsub2)

    const unsub3 = window.electronAPI.onRecordingPaused(() => {
      setStatus('paused')
    })
    cleanupFns.push(unsub3)

    const unsub4 = window.electronAPI.onRecordingResumed(() => {
      setStatus('recording')
    })
    cleanupFns.push(unsub4)

    const unsub5 = window.electronAPI.onRecordingStopped((session) => {
      setStatus('stopped')
      setSessionInfo({
        id: session.id,
        pointCount: session.pointCount,
        duration: session.duration,
        startTime: session.startTime,
        endTime: session.endTime
      })
      stopDurationTimer()
      loadSessions()
    })
    cleanupFns.push(unsub5)

    const unsub6 = window.electronAPI.onPermissionStatus((status) => {
      setPermissionStatus(status)
      setShowPermissionWarning(!status.hasPermission)
    })
    cleanupFns.push(unsub6)

    const unsub7 = window.electronAPI.onAppError((error) => {
      console.error('App error:', error)
      setAppError(error)
      
      if (error.context === 'database_init') {
        setDbUnavailable(true)
      }
    })
    cleanupFns.push(unsub7)

    return () => {
      cleanupFns.forEach(fn => fn())
    }
  }, [isElectronEnv, loadSessions, stopDurationTimer])

  useEffect(() => {
    if (!isElectronEnv) return
    checkPermission()
    loadSessions()
  }, [isElectronEnv, checkPermission, loadSessions])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  useEffect(() => {
    return () => {
      stopDurationTimer()
      stopReplay()
    }
  }, [stopDurationTimer, stopReplay])

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes > 0) {
      return `${minutes}分${remainingSeconds}秒`
    }
    return `${remainingSeconds}秒`
  }

  const formatTimestamp = (ts: number): string => {
    const date = new Date(ts)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getStatusText = () => {
    switch (status) {
      case 'idle': return '等待开始'
      case 'recording': return '记录中...'
      case 'paused': return '已暂停'
      case 'stopped': return '已停止'
      case 'replaying': return '回放中...'
    }
  }

  const getStatusDotClass = () => {
    if (status === 'replaying') return 'replaying'
    return status
  }

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
        <main className="app-main" style={{ justifyContent: 'center' }}>
          <div style={{ 
            background: 'rgba(0, 0, 0, 0.3)', 
            padding: '40px', 
            borderRadius: '16px',
            textAlign: 'center',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <p style={{ fontSize: '18px', color: '#fdcb6e', marginBottom: '12px' }}>
              ⚠️ 请在 Electron 环境中运行此应用
            </p>
            <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
              此应用需要在 Electron 桌面环境中运行才能使用完整功能
            </p>
            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '8px' }}>
              使用 npm run dev 或 npm run start 启动应用
            </p>
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
            <div className="canvas-container">
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="track-canvas"
              />
              {status === 'idle' && points.length === 0 && (
                <div className="canvas-overlay">
                  <p>点击「开始」按钮开始记录鼠标轨迹</p>
                </div>
              )}
              {status === 'replaying' && (
                <div className="replay-indicator">
                  <span>回放中 - {selectedSession?.id}</span>
                </div>
              )}
            </div>

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
                  className={`control-btn stop-btn ${(status !== 'recording' && status !== 'paused' && status !== 'replaying') ? 'disabled' : ''}`}
                  onClick={status === 'replaying' ? stopReplay : handleStop}
                  disabled={status !== 'recording' && status !== 'paused' && status !== 'replaying'}
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

            {(status === 'recording' || status === 'paused' || status === 'stopped') && (
              <div className="session-stats">
                <h3>当前 Session</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">轨迹点数</span>
                    <span className="stat-value">{points.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">开始时间</span>
                    <span className="stat-value stat-text">
                      {startTime ? formatTimestamp(startTime) : '-'}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">持续时间</span>
                    <span className="stat-value stat-text">{formatDuration(duration)}</span>
                  </div>
                </div>
              </div>
            )}

            {sessionInfo && status === 'stopped' && !selectedSession && (
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
            <div className="history-section">
              <h3>历史记录</h3>
              {dbUnavailable ? (
                <div className="empty-history">
                  <p>数据库不可用</p>
                  <p className="empty-hint">请尝试重新运行 npm run rebuild</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="empty-history">
                  <p>暂无历史记录</p>
                  <p className="empty-hint">开始记录后，点击停止即可保存</p>
                </div>
              ) : (
                <div className="session-list">
                  {sessions.map(session => (
                    <div
                      key={session.id}
                      className={`session-item ${selectedSession?.id === session.id ? 'selected' : ''}`}
                      onClick={() => handleLoadSession(session.id)}
                    >
                      <div className="session-info">
                        <div className="session-time">{formatTimestamp(session.startTime)}</div>
                        <div className="session-meta">
                          <span>{session.pointCount} 个点</span>
                          <span>•</span>
                          <span>{formatDuration(session.duration)}</span>
                        </div>
                      </div>
                      <button
                        className="delete-session-btn"
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        title="删除此记录"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
