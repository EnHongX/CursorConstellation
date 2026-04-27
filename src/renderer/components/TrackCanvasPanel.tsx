import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { ColorMode, KeyPoint, Point, RecordingStatus, Session } from '../types'
import {
  calculateSpeedStats,
  detectKeyPoints,
  getColorByProgress,
  getColorBySpeed,
  getTimeProgress,
  limitDisplayPoints,
} from '../utils/trajectory'
import './TrackCanvasPanel.css'

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 400
const POINT_DISPLAY_LIMIT = 2000

interface TrackCanvasPanelProps {
  colorMode: ColorMode
  loadedSession: Session | null
  playbackSpeed: number
  points: Point[]
  selectedKeyPoint: KeyPoint | null
  selectedSession: Session | null
  showKeyPoints: boolean
  status: RecordingStatus
  onColorModeChange: (mode: ColorMode) => void
  onShowKeyPointsChange: (show: boolean) => void
}

export const TrackCanvasPanel = forwardRef<HTMLCanvasElement, TrackCanvasPanelProps>(function TrackCanvasPanel(
  {
    colorMode,
    loadedSession,
    playbackSpeed,
    points,
    selectedKeyPoint,
    selectedSession,
    showKeyPoints,
    status,
    onColorModeChange,
    onShowKeyPointsChange,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [devicePixelRatio, setDevicePixelRatio] = useState<number>(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)

  const setCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas
    if (!ref) {
      return
    }
    const canvasToForward = points.length > 0 ? canvas : null
    if (typeof ref === 'function') {
      ref(canvasToForward)
    } else {
      ref.current = canvasToForward
    }
  }, [ref, points.length])

  useEffect(() => {
    const updatePixelRatio = () => {
      setDevicePixelRatio(window.devicePixelRatio || 1)
    }

    const mediaQueryList = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    mediaQueryList.addEventListener('change', updatePixelRatio)

    return () => {
      mediaQueryList.removeEventListener('change', updatePixelRatio)
    }
  }, [])

  const physicalWidth = CANVAS_WIDTH * devicePixelRatio
  const physicalHeight = CANVAS_HEIGHT * devicePixelRatio

  const normalizePoints = useCallback((inputPoints: Point[]): Point[] => {
    if (inputPoints.length === 0) {
      return []
    }

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const point of inputPoints) {
      if (point.x < minX) minX = point.x
      if (point.x > maxX) maxX = point.x
      if (point.y < minY) minY = point.y
      if (point.y > maxY) maxY = point.y
    }

    const padding = 30
    const rangeX = maxX - minX
    const rangeY = maxY - minY
    const availableWidth = CANVAS_WIDTH - padding * 2
    const availableHeight = CANVAS_HEIGHT - padding * 2

    let scale = 1
    if (rangeX > 0 && rangeY > 0) {
      scale = Math.min(availableWidth / rangeX, availableHeight / rangeY)
    }

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    return inputPoints.map((point) => ({
      x: CANVAS_WIDTH / 2 + (point.x - centerX) * scale,
      y: CANVAS_HEIGHT / 2 + (point.y - centerY) * scale,
      speed: point.speed,
      timestamp: point.timestamp,
    }))
  }, [])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    context.save()
    context.scale(devicePixelRatio, devicePixelRatio)

    context.fillStyle = '#16213e'
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    context.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    context.lineWidth = 1
    const gridSize = 40
    for (let x = 0; x <= CANVAS_WIDTH; x += gridSize) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, CANVAS_HEIGHT)
      context.stroke()
    }
    for (let y = 0; y <= CANVAS_HEIGHT; y += gridSize) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(CANVAS_WIDTH, y)
      context.stroke()
    }

    const displayPoints = limitDisplayPoints(points, POINT_DISPLAY_LIMIT)
    const normalizedPoints = normalizePoints(displayPoints)

    if (normalizedPoints.length === 0) {
      context.restore()
      return
    }

    const speedStats = calculateSpeedStats(displayPoints)
    const keyPoints = showKeyPoints ? detectKeyPoints(displayPoints) : []
    const startTime = displayPoints[0].timestamp
    const totalDuration = displayPoints[displayPoints.length - 1].timestamp - startTime

    context.lineWidth = 2
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (let index = 1; index < normalizedPoints.length; index++) {
      const color = colorMode === 'time'
        ? getColorByProgress(getTimeProgress(displayPoints[index].timestamp, startTime, totalDuration))
        : getColorBySpeed(normalizedPoints[index].speed, speedStats.min, speedStats.max)

      context.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`
      context.beginPath()
      context.moveTo(normalizedPoints[index - 1].x, normalizedPoints[index - 1].y)
      context.lineTo(normalizedPoints[index].x, normalizedPoints[index].y)
      context.stroke()
    }

    if (showKeyPoints && keyPoints.length > 0) {
      const normalizedKeyPoints = normalizePoints(keyPoints.map((keyPoint) => ({
        x: keyPoint.x,
        y: keyPoint.y,
        timestamp: keyPoint.timestamp,
        speed: displayPoints[keyPoint.index]?.speed || 0,
      })))

      normalizedKeyPoints.forEach((normalizedKeyPoint, index) => {
        const keyPoint = keyPoints[index]
        let markerColor = '#00b894'
        let markerSize = 6

        switch (keyPoint.type) {
          case 'pause':
            markerColor = '#fdcb6e'
            markerSize = 10
            break
          case 'turn':
            markerColor = '#6c5ce7'
            markerSize = 8
            break
          case 'speed_change':
            markerColor = '#00b894'
            markerSize = 6
            break
        }

        context.fillStyle = markerColor
        context.beginPath()
        context.arc(normalizedKeyPoint.x, normalizedKeyPoint.y, markerSize, 0, Math.PI * 2)
        context.fill()

        context.strokeStyle = 'rgba(255, 255, 255, 0.8)'
        context.lineWidth = 2
        context.stroke()

        if (selectedKeyPoint && selectedKeyPoint.timestamp === keyPoint.timestamp && selectedKeyPoint.type === keyPoint.type) {
          context.strokeStyle = '#ffffff'
          context.lineWidth = 3
          context.beginPath()
          context.arc(normalizedKeyPoint.x, normalizedKeyPoint.y, markerSize + 4, 0, Math.PI * 2)
          context.stroke()
        }
      })
    }

    const lastNPoints = Math.min(normalizedPoints.length, 100)
    const startIndex = normalizedPoints.length - lastNPoints

    for (let index = startIndex; index < normalizedPoints.length; index++) {
      const point = normalizedPoints[index]
      const color = colorMode === 'time'
        ? getColorByProgress(getTimeProgress(displayPoints[index].timestamp, startTime, totalDuration))
        : getColorBySpeed(point.speed, speedStats.min, speedStats.max)

      const alpha = 0.3 + ((index - startIndex) / lastNPoints) * 0.7
      context.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
      context.beginPath()
      context.arc(point.x, point.y, index === normalizedPoints.length - 1 ? 6 : 3, 0, Math.PI * 2)
      context.fill()
    }

    const lastPoint = normalizedPoints[normalizedPoints.length - 1]
    const lastColor = colorMode === 'time'
      ? getColorByProgress(getTimeProgress(displayPoints[displayPoints.length - 1].timestamp, startTime, totalDuration))
      : getColorBySpeed(lastPoint.speed, speedStats.min, speedStats.max)

    const gradient = context.createRadialGradient(lastPoint.x, lastPoint.y, 0, lastPoint.x, lastPoint.y, 20)
    gradient.addColorStop(0, `rgba(${lastColor.r}, ${lastColor.g}, ${lastColor.b}, 0.5)`)
    gradient.addColorStop(1, `rgba(${lastColor.r}, ${lastColor.g}, ${lastColor.b}, 0)`)
    context.fillStyle = gradient
    context.beginPath()
    context.arc(lastPoint.x, lastPoint.y, 20, 0, Math.PI * 2)
    context.fill()

    context.restore()
  }, [colorMode, normalizePoints, points, selectedKeyPoint, showKeyPoints, devicePixelRatio])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  return (
    <div className="canvas-container">
      <div className="canvas-controls">
        <div className="color-mode-toggle">
          <span className="control-label">颜色模式:</span>
          <button
            className={`color-mode-btn ${colorMode === 'time' ? 'active' : ''}`}
            onClick={() => onColorModeChange('time')}
          >
            按时间
          </button>
          <button
            className={`color-mode-btn ${colorMode === 'speed' ? 'active' : ''}`}
            onClick={() => onColorModeChange('speed')}
          >
            按速度
          </button>
        </div>
        <div className="key-points-toggle">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showKeyPoints}
              onChange={(event) => onShowKeyPointsChange(event.target.checked)}
              className="toggle-checkbox"
            />
            显示关键点
          </label>
        </div>
      </div>

      <canvas
        ref={setCanvasRef}
        width={physicalWidth}
        height={physicalHeight}
        className="track-canvas"
      />

      {points.length > 0 && (
        <div className="canvas-legend">
          <div className="legend-main">
            <div className="legend-color-mode">
              <span className="legend-mode-label">
                当前颜色模式: <strong>{colorMode === 'time' ? '时间' : '速度'}</strong>
              </span>
            </div>
            <div className="legend-gradient-container">
              <div className={`legend-gradient ${colorMode}-gradient`}></div>
              <div className="legend-gradient-labels">
                <span className="legend-start-label">
                  {colorMode === 'time' ? '时间起点' : '慢速'}
                  <span className="legend-color-preview time-start-color"></span>
                </span>
                <span className="legend-mid-label">
                  {colorMode === 'time' ? '时间中点' : '中速'}
                  <span className="legend-color-preview time-mid-color"></span>
                </span>
                <span className="legend-end-label">
                  {colorMode === 'time' ? '时间终点' : '快速'}
                  <span className="legend-color-preview time-end-color"></span>
                </span>
              </div>
            </div>
          </div>
          {showKeyPoints && (
            <div className="legend-key-section">
              <span className="legend-key-title">关键点标记:</span>
              <div className="legend-key-points">
                <div className="legend-key-item">
                  <div className="legend-key-marker pause-marker"></div>
                  <span>停顿点 (速度低)</span>
                </div>
                <div className="legend-key-item">
                  <div className="legend-key-marker turn-marker"></div>
                  <span>转折点 (方向变)</span>
                </div>
                <div className="legend-key-item">
                  <div className="legend-key-marker speed-marker"></div>
                  <span>速度变化 (快慢变)</span>
                </div>
              </div>
            </div>
          )}
          <div className="legend-info">
            <span className="legend-info-text">
              {colorMode === 'time'
                ? '提示：颜色从蓝→红→黄，表示时间从开始到结束'
                : '提示：颜色从绿→黄→红，表示速度从慢到快'}
            </span>
          </div>
        </div>
      )}

      {status === 'idle' && points.length === 0 && !loadedSession && (
        <div className="canvas-overlay">
          <div>
            <p>点击「开始」按钮开始记录鼠标轨迹</p>
            <p className="canvas-hint">或选择右侧历史记录查看</p>
          </div>
        </div>
      )}

      {status === 'replaying' && (
        <div className="replay-indicator">
          <span>回放中 - {selectedSession?.id}</span>
          <span className="replay-speed">x{playbackSpeed}</span>
        </div>
      )}
    </div>
  )
})
