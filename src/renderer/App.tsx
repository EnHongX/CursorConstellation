import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Point, RecordingStatus, SessionInfo } from './types'
import './App.css'

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 400
const POINT_INTERVAL = 50

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const lastPointRef = useRef<Point | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedTimeRef = useRef<number>(0)
  const totalPausedDurationRef = useRef<number>(0)

  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [points, setPoints] = useState<Point[]>([])
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)

  const generateNextPoint = useCallback((prevPoint: Point | null): Point => {
    const now = Date.now()
    const centerX = CANVAS_WIDTH / 2
    const centerY = CANVAS_HEIGHT / 2

    if (!prevPoint) {
      return {
        x: centerX + (Math.random() - 0.5) * 100,
        y: centerY + (Math.random() - 0.5) * 100,
        timestamp: now,
      }
    }

    const timeSincePrev = now - prevPoint.timestamp
    const baseSpeed = 2

    const angle = (Math.sin(now / 1000) + Math.cos(now / 700)) * Math.PI
    const speedVariation = 1 + Math.sin(now / 500) * 0.5

    let newX = prevPoint.x + Math.cos(angle) * baseSpeed * speedVariation
    let newY = prevPoint.y + Math.sin(angle) * baseSpeed * speedVariation

    newX += (Math.random() - 0.5) * 3
    newY += (Math.random() - 0.5) * 3

    const margin = 20
    if (newX < margin) newX = margin + Math.random() * 50
    if (newX > CANVAS_WIDTH - margin) newX = CANVAS_WIDTH - margin - Math.random() * 50
    if (newY < margin) newY = margin + Math.random() * 50
    if (newY > CANVAS_HEIGHT - margin) newY = CANVAS_HEIGHT - margin - Math.random() * 50

    return {
      x: newX,
      y: newY,
      timestamp: now,
    }
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

    if (points.length === 0) return

    ctx.strokeStyle = '#e94560'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.stroke()

    points.forEach((point, index) => {
      const alpha = 0.3 + (index / points.length) * 0.7
      ctx.fillStyle = `rgba(233, 69, 96, ${alpha})`
      ctx.beginPath()
      const size = index === points.length - 1 ? 6 : 3
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2)
      ctx.fill()
    })

    const lastPoint = points[points.length - 1]
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
  }, [points])

  const startRecording = useCallback(() => {
    setPoints([])
    setSessionInfo(null)
    lastPointRef.current = null
    startTimeRef.current = Date.now()
    totalPausedDurationRef.current = 0
    setStatus('recording')
  }, [])

  const pauseRecording = useCallback(() => {
    pausedTimeRef.current = Date.now()
    setStatus('paused')
  }, [])

  const resumeRecording = useCallback(() => {
    const now = Date.now()
    totalPausedDurationRef.current += now - pausedTimeRef.current
    setStatus('recording')
  }, [])

  const stopRecording = useCallback(() => {
    const now = Date.now()
    const duration = now - startTimeRef.current - totalPausedDurationRef.current
    setSessionInfo({
      pointCount: points.length,
      duration: duration,
    })
    setStatus('stopped')
  }, [points.length])

  useEffect(() => {
    if (status !== 'recording') {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      return
    }

    let lastUpdateTime = 0

    const animate = (timestamp: number) => {
      if (timestamp - lastUpdateTime >= POINT_INTERVAL) {
        setPoints((prevPoints) => {
          const newPoint = generateNextPoint(lastPointRef.current)
          lastPointRef.current = newPoint
          return [...prevPoints, newPoint]
        })
        lastUpdateTime = timestamp
      }
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [status, generateNextPoint])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes > 0) {
      return `${minutes}分${remainingSeconds}秒`
    }
    return `${remainingSeconds}秒`
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Cursor Constellation</h1>
        <p className="subtitle">轨迹记录演示应用</p>
      </header>

      <main className="app-main">
        <div className="canvas-container">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="track-canvas"
          />
          {status === 'idle' && (
            <div className="canvas-overlay">
              <p>点击「开始」按钮开始记录轨迹</p>
            </div>
          )}
        </div>

        <div className="controls">
          <div className="button-group">
            <button
              className={`control-btn start-btn ${status === 'idle' || status === 'stopped' ? '' : 'disabled'}`}
              onClick={startRecording}
              disabled={status === 'recording' || status === 'paused'}
            >
              <span className="btn-icon">▶</span>
              开始
            </button>

            <button
              className={`control-btn pause-btn ${status === 'recording' ? '' : 'disabled'}`}
              onClick={pauseRecording}
              disabled={status !== 'recording'}
            >
              <span className="btn-icon">⏸</span>
              暂停
            </button>

            <button
              className={`control-btn resume-btn ${status === 'paused' ? '' : 'disabled'}`}
              onClick={resumeRecording}
              disabled={status !== 'paused'}
            >
              <span className="btn-icon">▶▶</span>
              继续
            </button>

            <button
              className={`control-btn stop-btn ${status === 'recording' || status === 'paused' ? '' : 'disabled'}`}
              onClick={stopRecording}
              disabled={status !== 'recording' && status !== 'paused'}
            >
              <span className="btn-icon">⏹</span>
              停止
            </button>
          </div>

          <div className="status-indicator">
            <div className={`status-dot ${status}`}></div>
            <span className="status-text">
              {status === 'idle' && '等待开始'}
              {status === 'recording' && '记录中...'}
              {status === 'paused' && '已暂停'}
              {status === 'stopped' && '已停止'}
            </span>
            {status === 'recording' && (
              <span className="point-count">已记录 {points.length} 个点</span>
            )}
          </div>
        </div>

        {sessionInfo && (
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
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
