import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Point, RecordingStatus, Session, SessionInfo, PermissionStatus, AppError, DbResponse } from './types'
import './App.css'

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 400
const POINT_DISPLAY_LIMIT = 2000
const DEFAULT_TIME_RANGE_MS = 5000
const PLAYBACK_SPEEDS = [1, 2, 5, 10, 20]

const isElectron = typeof window !== 'undefined' && 'electronAPI' in window

function isDbError<T>(response: DbResponse<T>): response is { success: false; error: string } {
  return !response.success
}

function getColorByProgress(progress: number): { r: number; g: number; b: number } {
  const startColor = { r: 100, g: 200, b: 255 }
  const midColor = { r: 233, g: 69, b: 96 }
  const endColor = { r: 255, g: 200, b: 100 }

  let color: { r: number; g: number; b: number }

  if (progress < 0.5) {
    const t = progress * 2
    color = {
      r: Math.round(startColor.r + (midColor.r - startColor.r) * t),
      g: Math.round(startColor.g + (midColor.g - startColor.g) * t),
      b: Math.round(startColor.b + (midColor.b - startColor.b) * t),
    }
  } else {
    const t = (progress - 0.5) * 2
    color = {
      r: Math.round(midColor.r + (endColor.r - midColor.r) * t),
      g: Math.round(midColor.g + (endColor.g - midColor.g) * t),
      b: Math.round(midColor.b + (endColor.b - midColor.b) * t),
    }
  }

  return color
}

function getColorBySpeed(speed: number, minSpeed: number, maxSpeed: number): { r: number; g: number; b: number } {
  const normalizedSpeed = maxSpeed === minSpeed ? 0.5 : (speed - minSpeed) / (maxSpeed - minSpeed)
  
  const slowColor = { r: 0, g: 184, b: 148 }
  const midColor = { r: 253, g: 203, b: 110 }
  const fastColor = { r: 233, g: 69, b: 96 }

  let color: { r: number; g: number; b: number }

  if (normalizedSpeed < 0.5) {
    const t = normalizedSpeed * 2
    color = {
      r: Math.round(slowColor.r + (midColor.r - slowColor.r) * t),
      g: Math.round(slowColor.g + (midColor.g - slowColor.g) * t),
      b: Math.round(slowColor.b + (midColor.b - slowColor.b) * t),
    }
  } else {
    const t = (normalizedSpeed - 0.5) * 2
    color = {
      r: Math.round(midColor.r + (fastColor.r - midColor.r) * t),
      g: Math.round(midColor.g + (fastColor.g - midColor.g) * t),
      b: Math.round(midColor.b + (fastColor.b - midColor.b) * t),
    }
  }

  return color
}

interface SpeedStats {
  min: number
  max: number
  avg: number
  median: number
}

interface KeyPoint {
  type: 'pause' | 'turn' | 'speed_change'
  index: number
  timestamp: number
  x: number
  y: number
  description: string
}

function calculateSpeedStats(points: Point[]): SpeedStats {
  if (points.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0 }
  }

  const speeds = points.map(p => p.speed)
  const sortedSpeeds = [...speeds].sort((a, b) => a - b)
  
  const sum = speeds.reduce((a, b) => a + b, 0)
  const avg = sum / speeds.length
  
  const medianIndex = Math.floor(sortedSpeeds.length / 2)
  const median = sortedSpeeds.length % 2 === 0
    ? (sortedSpeeds[medianIndex - 1] + sortedSpeeds[medianIndex]) / 2
    : sortedSpeeds[medianIndex]

  return {
    min: sortedSpeeds[0],
    max: sortedSpeeds[sortedSpeeds.length - 1],
    avg,
    median
  }
}

function detectKeyPoints(points: Point[]): KeyPoint[] {
  const keyPoints: KeyPoint[] = []
  
  if (points.length < 3) return keyPoints

  const pauseSpeedThreshold = 20
  const turnAngleThreshold = 45
  const speedChangeThreshold = 50

  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i]
    const prev = points[i - 1]
    const next = points[i + 1]

    if (current.speed < pauseSpeedThreshold) {
      const isPause = i > 0 && i < points.length - 1 && 
        points[i - 1].speed < pauseSpeedThreshold && 
        points[i + 1].speed < pauseSpeedThreshold
      
      if (isPause && (i === 1 || points[i - 2].speed >= pauseSpeedThreshold)) {
        keyPoints.push({
          type: 'pause',
          index: i,
          timestamp: current.timestamp,
          x: current.x,
          y: current.y,
          description: '停顿点'
        })
      }
    }

    const angle1 = Math.atan2(current.y - prev.y, current.x - prev.x) * 180 / Math.PI
    const angle2 = Math.atan2(next.y - current.y, next.x - current.x) * 180 / Math.PI
    let angleDiff = Math.abs(angle2 - angle1)
    if (angleDiff > 180) angleDiff = 360 - angleDiff

    if (angleDiff > turnAngleThreshold) {
      keyPoints.push({
        type: 'turn',
        index: i,
        timestamp: current.timestamp,
        x: current.x,
        y: current.y,
        description: `转折点 (${Math.round(angleDiff)}°)`
      })
    }

    const speedDiff = Math.abs(next.speed - prev.speed)
    if (speedDiff > speedChangeThreshold) {
      const isAcceleration = next.speed > prev.speed
      keyPoints.push({
        type: 'speed_change',
        index: i,
        timestamp: current.timestamp,
        x: current.x,
        y: current.y,
        description: isAcceleration ? '加速点' : '减速点'
      })
    }
  }

  return keyPoints
}

function getTimeSegments(points: Point[], segmentCount: number = 5): { start: number; end: number; points: Point[]; avgSpeed: number }[] {
  if (points.length === 0) return []

  const segments: { start: number; end: number; points: Point[]; avgSpeed: number }[] = []
  const totalDuration = points[points.length - 1].timestamp - points[0].timestamp
  const segmentDuration = totalDuration / segmentCount

  for (let i = 0; i < segmentCount; i++) {
    const segmentStart = points[0].timestamp + i * segmentDuration
    const segmentEnd = points[0].timestamp + (i + 1) * segmentDuration
    
    const segmentPoints = points.filter(p => 
      p.timestamp >= segmentStart && p.timestamp <= segmentEnd
    )

    const avgSpeed = segmentPoints.length > 0
      ? segmentPoints.reduce((sum, p) => sum + p.speed, 0) / segmentPoints.length
      : 0

    segments.push({
      start: segmentStart,
      end: segmentEnd,
      points: segmentPoints,
      avgSpeed
    })
  }

  return segments
}

const VIEW_4D_WIDTH = 800
const VIEW_4D_HEIGHT = 300
const SPEED_CHART_WIDTH = 260
const SPEED_CHART_HEIGHT = 200

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view4DCanvasRef = useRef<HTMLCanvasElement>(null)
  const speedChartCanvasRef = useRef<HTMLCanvasElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
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
  const [isElectronEnv, setIsElectronEnv] = useState(isElectron)
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
  
  const [colorMode, setColorMode] = useState<'time' | 'speed'>('time')
  const [showKeyPoints, setShowKeyPoints] = useState(true)
  const [selectedKeyPoint, setSelectedKeyPoint] = useState<KeyPoint | null>(null)
  const [hoveredTimeSegment, setHoveredTimeSegment] = useState<number | null>(null)

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
    if (session.points.length === 0) return []
    
    const sessionStartTime = session.startTime
    const rangeStartTimestamp = sessionStartTime + startMs
    const rangeEndTimestamp = sessionStartTime + endMs

    return session.points.filter(
      point => point.timestamp >= rangeStartTimestamp && point.timestamp <= rangeEndTimestamp
    )
  }, [])

  const startReplay = useCallback((session: Session, startMs: number, endMs: number, speed: number) => {
    const pointsInRange = getPointsInTimeRange(session, startMs, endMs)
    
    if (pointsInRange.length === 0) return

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

      setPoints(prev => [...prev, currentPoint])
      replayIndexRef.current++

      if (nextPoint) {
        const delay = (nextPoint.timestamp - currentPoint.timestamp) / playbackSpeedRef.current
        replayIntervalRef.current = setTimeout(replayNext, Math.max(delay, 1))
      } else {
        stopReplay(false)
      }
    }

    replayNext()
  }, [stopReplay, getPointsInTimeRange])

  const handleStart = () => {
    if (!isElectronEnv) return
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

  const initTimeRange = useCallback((session: Session) => {
    const totalDuration = session.duration
    const defaultRange = Math.min(DEFAULT_TIME_RANGE_MS, totalDuration)
    const start = totalDuration - defaultRange
    const end = totalDuration

    setTimeRangeStart(start)
    setTimeRangeEnd(end)
    setSelectedKeyPoint(null)
    setHoveredTimeSegment(null)

    const pointsInRange = getPointsInTimeRange(session, start, end)
    setPoints(pointsInRange)
  }, [getPointsInTimeRange])

  const handleLoadSession = async (sessionId: string) => {
    if (!isElectronEnv) return
    
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
    if (!loadedSession) return
    startReplay(loadedSession, timeRangeStart, timeRangeEnd, playbackSpeed)
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

  const normalizePoints = useCallback((inputPoints: Point[]): { x: number; y: number; speed: number; timestamp: number }[] => {
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
      speed: point.speed,
      timestamp: point.timestamp,
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

    const speedStats = calculateSpeedStats(displayPoints)
    const keyPoints = showKeyPoints ? detectKeyPoints(displayPoints) : []

    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (let i = 1; i < normalizedPoints.length; i++) {
      let color
      if (colorMode === 'time') {
        const progress = i / (normalizedPoints.length - 1)
        color = getColorByProgress(progress)
      } else {
        color = getColorBySpeed(normalizedPoints[i].speed, speedStats.min, speedStats.max)
      }
      ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`
      ctx.beginPath()
      ctx.moveTo(normalizedPoints[i - 1].x, normalizedPoints[i - 1].y)
      ctx.lineTo(normalizedPoints[i].x, normalizedPoints[i].y)
      ctx.stroke()
    }

    if (showKeyPoints && keyPoints.length > 0) {
      const normalizedKeyPoints = normalizePoints(keyPoints.map(kp => ({
        x: kp.x,
        y: kp.y,
        timestamp: kp.timestamp,
        speed: displayPoints[kp.index]?.speed || 0
      })))

      normalizedKeyPoints.forEach((nkp, idx) => {
        const kp = keyPoints[idx]
        let markerColor
        let markerSize = 8

        switch (kp.type) {
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

        ctx.fillStyle = markerColor
        ctx.beginPath()
        ctx.arc(nkp.x, nkp.y, markerSize, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
        ctx.lineWidth = 2
        ctx.stroke()

        if (selectedKeyPoint && selectedKeyPoint.index === kp.index) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(nkp.x, nkp.y, markerSize + 4, 0, Math.PI * 2)
          ctx.stroke()
        }
      })
    }

    const lastNPoints = Math.min(normalizedPoints.length, 100)
    const startIndex = normalizedPoints.length - lastNPoints

    for (let i = startIndex; i < normalizedPoints.length; i++) {
      const point = normalizedPoints[i]
      let color
      if (colorMode === 'time') {
        const progress = i / (normalizedPoints.length - 1)
        color = getColorByProgress(progress)
      } else {
        color = getColorBySpeed(point.speed, speedStats.min, speedStats.max)
      }
      const alpha = 0.3 + ((i - startIndex) / lastNPoints) * 0.7
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
      ctx.beginPath()
      const size = i === normalizedPoints.length - 1 ? 6 : 3
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2)
      ctx.fill()
    }

    if (normalizedPoints.length > 0) {
      const lastPoint = normalizedPoints[normalizedPoints.length - 1]
      let lastColor
      if (colorMode === 'time') {
        const lastProgress = (normalizedPoints.length - 1) / Math.max(normalizedPoints.length - 1, 1)
        lastColor = getColorByProgress(lastProgress)
      } else {
        lastColor = getColorBySpeed(lastPoint.speed, speedStats.min, speedStats.max)
      }
      const gradient = ctx.createRadialGradient(
        lastPoint.x, lastPoint.y, 0,
        lastPoint.x, lastPoint.y, 20
      )
      gradient.addColorStop(0, `rgba(${lastColor.r}, ${lastColor.g}, ${lastColor.b}, 0.5)`)
      gradient.addColorStop(1, `rgba(${lastColor.r}, ${lastColor.g}, ${lastColor.b}, 0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(lastPoint.x, lastPoint.y, 20, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [points, normalizePoints, colorMode, showKeyPoints, selectedKeyPoint])

  const draw4DView = useCallback(() => {
    const canvas = view4DCanvasRef.current
    if (!canvas || points.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#16213e'
    ctx.fillRect(0, 0, VIEW_4D_WIDTH, VIEW_4D_HEIGHT)

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    const gridSize = 40
    for (let x = 0; x <= VIEW_4D_WIDTH; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, VIEW_4D_HEIGHT)
      ctx.stroke()
    }
    for (let y = 0; y <= VIEW_4D_HEIGHT; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(VIEW_4D_WIDTH, y)
      ctx.stroke()
    }

    const padding = { left: 60, right: 40, top: 50, bottom: 40 }
    const availableWidth = VIEW_4D_WIDTH - padding.left - padding.right
    const availableHeight = VIEW_4D_HEIGHT - padding.top - padding.bottom

    const startTime = points[0].timestamp
    const endTime = points[points.length - 1].timestamp
    const totalDuration = endTime - startTime

    const speedStats = calculateSpeedStats(points)

    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity

    for (const point of points) {
      if (point.x < minX) minX = point.x
      if (point.x > maxX) maxX = point.x
      if (point.y < minY) minY = point.y
      if (point.y > maxY) maxY = point.y
    }

    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1

    const projectTo4D = (point: Point, timeProgress: number): { x: number; y: number } => {
      const normalizedX = (point.x - minX) / rangeX
      const normalizedY = (point.y - minY) / rangeY

      const baseX = padding.left + normalizedX * availableWidth
      const baseY = padding.top + (1 - normalizedY) * availableHeight

      const timeOffset = timeProgress * 80
      const parallaxX = timeProgress * 30
      
      return {
        x: baseX - parallaxX,
        y: baseY - timeOffset
      }
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    
    const corners = [
      { x: minX, y: minY, label: '起点' },
      { x: maxX, y: minY, label: 'X最大' },
      { x: maxX, y: maxY, label: 'Y最大' },
      { x: minX, y: maxY, label: '' }
    ]

    for (let i = 0; i < corners.length; i++) {
      const start2D = projectTo4D(
        { x: corners[i].x, y: corners[i].y, timestamp: startTime, speed: 0 }, 
        0
      )
      const end2D = projectTo4D(
        { x: corners[i].x, y: corners[i].y, timestamp: endTime, speed: 0 }, 
        1
      )

      ctx.beginPath()
      ctx.moveTo(start2D.x, start2D.y)
      ctx.lineTo(end2D.x, end2D.y)
      ctx.stroke()

      if (corners[i].label) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
        ctx.fillText(corners[i].label, start2D.x - 15, start2D.y + 15)
      }
    }

    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('时间轴 (从后往前)', VIEW_4D_WIDTH / 2 - 40, 25)
    
    const timeStartPoint = projectTo4D({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, timestamp: startTime, speed: 0 }, 0)
    const timeEndPoint = projectTo4D({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, timestamp: endTime, speed: 0 }, 1)
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(timeStartPoint.x, 35)
    ctx.lineTo(timeEndPoint.x, 35)
    ctx.stroke()
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.beginPath()
    ctx.moveTo(timeEndPoint.x + 8, 35)
    ctx.lineTo(timeEndPoint.x, 30)
    ctx.lineTo(timeEndPoint.x, 40)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = 'rgba(100, 200, 255, 0.7)'
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('开始', timeStartPoint.x - 10, 32)
    ctx.fillStyle = 'rgba(255, 200, 100, 0.7)'
    ctx.fillText('结束', timeEndPoint.x - 10, 32)

    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1]
      const currPoint = points[i]

      const prevProgress = (prevPoint.timestamp - startTime) / (totalDuration || 1)
      const currProgress = (currPoint.timestamp - startTime) / (totalDuration || 1)

      const prev2D = projectTo4D(prevPoint, prevProgress)
      const curr2D = projectTo4D(currPoint, currProgress)

      let color
      if (colorMode === 'time') {
        const progress = i / (points.length - 1)
        color = getColorByProgress(progress)
      } else {
        color = getColorBySpeed(currPoint.speed, speedStats.min, speedStats.max)
      }

      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`
      ctx.beginPath()
      ctx.moveTo(prev2D.x, prev2D.y)
      ctx.lineTo(curr2D.x, curr2D.y)
      ctx.stroke()
    }

    const sampleCount = Math.min(points.length, 20)
    const sampleStep = Math.max(1, Math.floor(points.length / sampleCount))
    
    for (let i = 0; i < points.length; i += sampleStep) {
      const point = points[i]
      const progress = (point.timestamp - startTime) / (totalDuration || 1)
      const point2D = projectTo4D(point, progress)

      let color
      if (colorMode === 'time') {
        color = getColorByProgress(progress)
      } else {
        color = getColorBySpeed(point.speed, speedStats.min, speedStats.max)
      }

      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.6)`
      ctx.beginPath()
      ctx.arc(point2D.x, point2D.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    if (points.length > 0) {
      const firstPoint = points[0]
      const lastPoint = points[points.length - 1]
      
      const first2D = projectTo4D(firstPoint, 0)
      const last2D = projectTo4D(lastPoint, 1)

      let firstColor, lastColor
      if (colorMode === 'time') {
        firstColor = getColorByProgress(0)
        lastColor = getColorByProgress(1)
      } else {
        firstColor = getColorBySpeed(firstPoint.speed, speedStats.min, speedStats.max)
        lastColor = getColorBySpeed(lastPoint.speed, speedStats.min, speedStats.max)
      }

      ctx.fillStyle = `rgb(${firstColor.r}, ${firstColor.g}, ${firstColor.b})`
      ctx.beginPath()
      ctx.arc(first2D.x, first2D.y, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = 'rgba(100, 200, 255, 0.9)'
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillText('起点', first2D.x + 10, first2D.y - 8)

      ctx.fillStyle = `rgb(${lastColor.r}, ${lastColor.g}, ${lastColor.b})`
      ctx.beginPath()
      ctx.arc(last2D.x, last2D.y, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = 'rgba(255, 200, 100, 0.9)'
      ctx.fillText('终点', last2D.x + 10, last2D.y - 8)

      const gradient = ctx.createRadialGradient(
        last2D.x, last2D.y, 0,
        last2D.x, last2D.y, 25
      )
      gradient.addColorStop(0, `rgba(${lastColor.r}, ${lastColor.g}, ${lastColor.b}, 0.4)`)
      gradient.addColorStop(1, `rgba(${lastColor.r}, ${lastColor.g}, ${lastColor.b}, 0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(last2D.x, last2D.y, 25, 0, Math.PI * 2)
      ctx.fill()
    }

    if (showKeyPoints) {
      const keyPoints = detectKeyPoints(points)
      keyPoints.forEach(kp => {
        const kpProgress = (kp.timestamp - startTime) / (totalDuration || 1)
        const kp2D = projectTo4D(
          { x: kp.x, y: kp.y, timestamp: kp.timestamp, speed: points[kp.index]?.speed || 0 },
          kpProgress
        )

        let markerColor
        let markerSize = 7

        switch (kp.type) {
          case 'pause':
            markerColor = '#fdcb6e'
            markerSize = 9
            break
          case 'turn':
            markerColor = '#6c5ce7'
            markerSize = 7
            break
          case 'speed_change':
            markerColor = '#00b894'
            markerSize = 6
            break
        }

        ctx.fillStyle = markerColor
        ctx.beginPath()
        ctx.arc(kp2D.x, kp2D.y, markerSize, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        if (selectedKeyPoint && selectedKeyPoint.index === kp.index) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(kp2D.x, kp2D.y, markerSize + 5, 0, Math.PI * 2)
          ctx.stroke()

          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
          ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif'
          ctx.fillText(kp.description, kp2D.x + 15, kp2D.y - 10)
        }
      })
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('提示：越靠后（视觉上越远）的点时间越早，越靠前的点时间越晚', padding.left, VIEW_4D_HEIGHT - 10)
  }, [points, colorMode, showKeyPoints, selectedKeyPoint])

  const drawSpeedChart = useCallback(() => {
    const canvas = speedChartCanvasRef.current
    if (!canvas || points.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#16213e'
    ctx.fillRect(0, 0, SPEED_CHART_WIDTH, SPEED_CHART_HEIGHT)

    const padding = { top: 20, right: 10, bottom: 30, left: 40 }
    const chartWidth = SPEED_CHART_WIDTH - padding.left - padding.right
    const chartHeight = SPEED_CHART_HEIGHT - padding.top - padding.bottom

    const speedStats = calculateSpeedStats(points)
    const maxSpeed = Math.max(speedStats.max, 1)

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i / 5) * chartHeight
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(padding.left + chartWidth, y)
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i / 5) * chartHeight
      const speed = maxSpeed - (i / 5) * maxSpeed
      ctx.fillText(`${Math.round(speed)}`, padding.left - 5, y + 4)
    }
    ctx.fillText('速度', padding.left - 5, padding.top - 5)

    ctx.textAlign = 'center'
    const timeSegments = 5
    for (let i = 0; i <= timeSegments; i++) {
      const x = padding.left + (i / timeSegments) * chartWidth
      const progress = i / timeSegments
      const timeMs = progress * (points[points.length - 1].timestamp - points[0].timestamp)
      ctx.fillText(`${(timeMs / 1000).toFixed(0)}s`, x, padding.top + chartHeight + 15)
    }

    ctx.beginPath()
    ctx.moveTo(padding.left, padding.top + chartHeight)

    for (let i = 0; i < points.length; i++) {
      const x = padding.left + (i / (points.length - 1)) * chartWidth
      const y = padding.top + chartHeight - (points[i].speed / maxSpeed) * chartHeight
      
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }

    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight)
    ctx.closePath()

    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight)
    gradient.addColorStop(0, 'rgba(233, 69, 96, 0.4)')
    gradient.addColorStop(0.5, 'rgba(253, 203, 110, 0.3)')
    gradient.addColorStop(1, 'rgba(0, 184, 148, 0.2)')
    ctx.fillStyle = gradient
    ctx.fill()

    ctx.beginPath()
    for (let i = 0; i < points.length; i++) {
      const x = padding.left + (i / (points.length - 1)) * chartWidth
      const y = padding.top + chartHeight - (points[i].speed / maxSpeed) * chartHeight
      
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }

    ctx.strokeStyle = '#e94560'
    ctx.lineWidth = 2
    ctx.stroke()

    if (showKeyPoints) {
      const keyPoints = detectKeyPoints(points)
      keyPoints.forEach(kp => {
        const x = padding.left + (kp.index / (points.length - 1)) * chartWidth
        const y = padding.top + chartHeight - (points[kp.index]?.speed || 0) / maxSpeed * chartHeight

        let markerColor
        let markerSize = 4

        switch (kp.type) {
          case 'pause':
            markerColor = '#fdcb6e'
            markerSize = 5
            break
          case 'turn':
            markerColor = '#6c5ce7'
            markerSize = 4
            break
          case 'speed_change':
            markerColor = '#00b894'
            markerSize = 3
            break
        }

        ctx.fillStyle = markerColor
        ctx.beginPath()
        ctx.arc(x, y, markerSize, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
        ctx.lineWidth = 1
        ctx.stroke()
      })
    }

    if (speedStats.avg > 0) {
      const avgY = padding.top + chartHeight - (speedStats.avg / maxSpeed) * chartHeight
      ctx.strokeStyle = 'rgba(108, 92, 231, 0.6)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(padding.left, avgY)
      ctx.lineTo(padding.left + chartWidth, avgY)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = 'rgba(108, 92, 231, 0.9)'
      ctx.textAlign = 'left'
      ctx.fillText(`平均: ${speedStats.avg.toFixed(1)}`, padding.left + 5, avgY - 5)
    }
  }, [points, showKeyPoints])

  const getTimelinePosition = useCallback((clientX: number): number => {
    if (!timelineRef.current) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    return x / rect.width
  }, [])

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent, type: 'left' | 'right' | 'range') => {
    e.preventDefault()
    e.stopPropagation()
    
    if (type === 'left') {
      setIsDraggingLeft(true)
    } else if (type === 'right') {
      setIsDraggingRight(true)
    } else {
      setIsDraggingRange(true)
      setDragStartX(e.clientX)
      setDragStartRange({ start: timeRangeStart, end: timeRangeEnd })
    }
  }, [timeRangeStart, timeRangeEnd])

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
    if (!loadedSession) return
    const totalDuration = loadedSession.duration

    if (isDraggingLeft) {
      const position = getTimelinePosition(e.clientX)
      const newStart = Math.max(0, Math.min(position * totalDuration, timeRangeEnd - 100))
      setTimeRangeStart(newStart)
      const pointsInRange = getPointsInTimeRange(loadedSession, newStart, timeRangeEnd)
      setPoints(pointsInRange)
    } else if (isDraggingRight) {
      const position = getTimelinePosition(e.clientX)
      const newEnd = Math.max(timeRangeStart + 100, Math.min(position * totalDuration, totalDuration))
      setTimeRangeEnd(newEnd)
      const pointsInRange = getPointsInTimeRange(loadedSession, timeRangeStart, newEnd)
      setPoints(pointsInRange)
    } else if (isDraggingRange) {
      const deltaX = e.clientX - dragStartX
      const timelineWidth = timelineRef.current?.getBoundingClientRect().width || 1
      const deltaTime = (deltaX / timelineWidth) * totalDuration
      
      let newStart = dragStartRange.start + deltaTime
      let newEnd = dragStartRange.end + deltaTime
      
      if (newStart < 0) {
        newEnd = newEnd - newStart
        newStart = 0
      }
      if (newEnd > totalDuration) {
        newStart = newStart - (newEnd - totalDuration)
        newEnd = totalDuration
      }
      
      setTimeRangeStart(newStart)
      setTimeRangeEnd(newEnd)
      const pointsInRange = getPointsInTimeRange(loadedSession, newStart, newEnd)
      setPoints(pointsInRange)
    }
  }, [isDraggingLeft, isDraggingRight, isDraggingRange, loadedSession, timeRangeStart, timeRangeEnd, getTimelinePosition, getPointsInTimeRange, dragStartX, dragStartRange])

  const handleTimelineMouseUp = useCallback(() => {
    setIsDraggingLeft(false)
    setIsDraggingRight(false)
    setIsDraggingRange(false)
    setSelectedKeyPoint(null)
    setHoveredTimeSegment(null)
  }, [])

  useEffect(() => {
    if (isDraggingLeft || isDraggingRight || isDraggingRange) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        handleTimelineMouseMove(e as unknown as React.MouseEvent)
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
    }
  }, [isDraggingLeft, isDraggingRight, isDraggingRange, handleTimelineMouseMove, handleTimelineMouseUp])

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
    draw4DView()
    drawSpeedChart()
  }, [drawCanvas, draw4DView, drawSpeedChart])

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

  const formatTimeShort = (ms: number): string => {
    const seconds = (ms / 1000).toFixed(1)
    return `${seconds}秒`
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
              <div className="canvas-controls">
                <div className="color-mode-toggle">
                  <span className="control-label">颜色模式:</span>
                  <button
                    className={`color-mode-btn ${colorMode === 'time' ? 'active' : ''}`}
                    onClick={() => setColorMode('time')}
                  >
                    按时间
                  </button>
                  <button
                    className={`color-mode-btn ${colorMode === 'speed' ? 'active' : ''}`}
                    onClick={() => setColorMode('speed')}
                  >
                    按速度
                  </button>
                </div>
                <div className="key-points-toggle">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={showKeyPoints}
                      onChange={(e) => setShowKeyPoints(e.target.checked)}
                      className="toggle-checkbox"
                    />
                    显示关键点
                  </label>
                </div>
              </div>
              
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
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
                  <p>点击「开始」按钮开始记录鼠标轨迹</p>
                  <p className="canvas-hint">或选择右侧历史记录查看</p>
                </div>
              )}
              {status === 'replaying' && (
                <div className="replay-indicator">
                  <span>回放中 - {selectedSession?.id}</span>
                  <span className="replay-speed">x{playbackSpeed}</span>
                </div>
              )}
            </div>

            {points.length > 0 && (
              <div className="view-4d-container">
                <div className="view-4d-header">
                  <span className="view-4d-title">4D 轨迹视图 (X/Y/时间)</span>
                  <span className="view-4d-hint">等距投影展示轨迹随时间的变化</span>
                </div>
                <canvas
                  ref={view4DCanvasRef}
                  width={VIEW_4D_WIDTH}
                  height={VIEW_4D_HEIGHT}
                  className="view-4d-canvas"
                />
              </div>
            )}

            {loadedSession && (
              <div className="replay-controls">
                <div className="replay-header">
                  <span className="replay-title">回放控制</span>
                  <span className="replay-session-info">
                    {formatTimestamp(loadedSession.startTime)} · {formatDuration(loadedSession.duration)}
                  </span>
                </div>

                <div className="speed-controls">
                  <span className="speed-label">播放速度:</span>
                  <div className="speed-buttons">
                    {PLAYBACK_SPEEDS.map(speed => (
                      <button
                        key={speed}
                        className={`speed-btn ${playbackSpeed === speed ? 'active' : ''} ${status === 'replaying' ? 'disabled' : ''}`}
                        onClick={() => {
                          if (status !== 'replaying') {
                            setPlaybackSpeed(speed)
                            playbackSpeedRef.current = speed
                          }
                        }}
                        disabled={status === 'replaying'}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>

                <div 
                  ref={timelineRef}
                  className="timeline-container"
                  onMouseMove={handleTimelineMouseMove}
                >
                  <div className="timeline-track">
                    <div 
                      className="timeline-range"
                      style={{
                        left: `${(timeRangeStart / loadedSession.duration) * 100}%`,
                        width: `${((timeRangeEnd - timeRangeStart) / loadedSession.duration) * 100}%`,
                      }}
                      onMouseDown={(e) => handleTimelineMouseDown(e, 'range')}
                    />
                    <div 
                      className="timeline-handle timeline-handle-left"
                      style={{
                        left: `${(timeRangeStart / loadedSession.duration) * 100}%`,
                      }}
                      onMouseDown={(e) => handleTimelineMouseDown(e, 'left')}
                    >
                      <div className="handle-icon">◀</div>
                    </div>
                    <div 
                      className="timeline-handle timeline-handle-right"
                      style={{
                        left: `${(timeRangeEnd / loadedSession.duration) * 100}%`,
                      }}
                      onMouseDown={(e) => handleTimelineMouseDown(e, 'right')}
                    >
                      <div className="handle-icon">▶</div>
                    </div>
                  </div>
                  <div className="timeline-labels">
                    <span>{formatTimeShort(timeRangeStart)}</span>
                    <span>选择范围: {formatTimeShort(timeRangeEnd - timeRangeStart)}</span>
                    <span>{formatTimeShort(timeRangeEnd)}</span>
                  </div>
                </div>

                <div className="replay-button-group">
                  <button
                    className={`control-btn replay-btn ${status === 'replaying' ? 'disabled' : ''}`}
                    onClick={handlePlayReplay}
                    disabled={status === 'replaying' || points.length === 0}
                  >
                    <span className="btn-icon">▶</span>
                    播放选中范围
                  </button>
                  <button
                    className={`control-btn stop-btn ${status !== 'replaying' ? 'disabled' : ''}`}
                    onClick={stopReplay}
                    disabled={status !== 'replaying'}
                  >
                    <span className="btn-icon">⏹</span>
                    停止
                  </button>
                </div>
              </div>
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
            {points.length > 0 && (
              <>
                <div className="analysis-section">
                  <h3>速度变化曲线</h3>
                  <canvas
                    ref={speedChartCanvasRef}
                    width={SPEED_CHART_WIDTH}
                    height={SPEED_CHART_HEIGHT}
                    className="speed-chart-canvas"
                  />
                </div>

                <div className="analysis-section">
                  <h3>轨迹分析</h3>
                  {(() => {
                    const speedStats = calculateSpeedStats(points)
                    const keyPoints = detectKeyPoints(points)
                    const timeSegments = getTimeSegments(points, 5)
                    
                    const pausePoints = keyPoints.filter(kp => kp.type === 'pause')
                    const turnPoints = keyPoints.filter(kp => kp.type === 'turn')
                    const speedChangePoints = keyPoints.filter(kp => kp.type === 'speed_change')

                    return (
                      <div className="analysis-content">
                        <div className="stats-summary">
                          <div className="stat-card">
                            <span className="stat-card-label">平均速度</span>
                            <span className="stat-card-value">{speedStats.avg.toFixed(1)}</span>
                          </div>
                          <div className="stat-card">
                            <span className="stat-card-label">最高速度</span>
                            <span className="stat-card-value">{speedStats.max.toFixed(1)}</span>
                          </div>
                          <div className="stat-card">
                            <span className="stat-card-label">最低速度</span>
                            <span className="stat-card-value">{speedStats.min.toFixed(1)}</span>
                          </div>
                        </div>

                        <div className="key-points-summary">
                          <div className="key-point-item">
                            <div className="key-point-icon pause-icon"></div>
                            <span className="key-point-count">{pausePoints.length}</span>
                            <span className="key-point-label">停顿点</span>
                          </div>
                          <div className="key-point-item">
                            <div className="key-point-icon turn-icon"></div>
                            <span className="key-point-count">{turnPoints.length}</span>
                            <span className="key-point-label">转折点</span>
                          </div>
                          <div className="key-point-item">
                            <div className="key-point-icon speed-icon"></div>
                            <span className="key-point-count">{speedChangePoints.length}</span>
                            <span className="key-point-label">速度变化</span>
                          </div>
                        </div>

                        {timeSegments.length > 0 && (
                          <div className="time-segments">
                            <h4>时间分段分析</h4>
                            <div className="segments-list">
                              {timeSegments.map((segment, idx) => (
                                <div 
                                  key={idx}
                                  className={`segment-item ${hoveredTimeSegment === idx ? 'hovered' : ''}`}
                                  onMouseEnter={() => setHoveredTimeSegment(idx)}
                                  onMouseLeave={() => setHoveredTimeSegment(null)}
                                >
                                  <div className="segment-info">
                                    <span className="segment-index">第 {idx + 1} 段</span>
                                    <span className="segment-duration">
                                      {((segment.end - segment.start) / 1000).toFixed(1)}s
                                    </span>
                                  </div>
                                  <div className="segment-speed-bar">
                                    <div 
                                      className="segment-speed-fill"
                                      style={{
                                        width: `${Math.min((segment.avgSpeed / (speedStats.max || 1)) * 100, 100)}%`,
                                        background: segment.avgSpeed > speedStats.avg 
                                          ? 'linear-gradient(90deg, #e94560, #ff6b6b)'
                                          : 'linear-gradient(90deg, #00b894, #00cec9)'
                                      }}
                                    ></div>
                                  </div>
                                  <span className="segment-avg-speed">
                                    {segment.avgSpeed.toFixed(1)} 平均
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {keyPoints.length > 0 && (
                          <div className="key-points-list">
                            <h4>关键点位</h4>
                            <div className="points-list">
                              {keyPoints.slice(0, 10).map((kp, idx) => (
                                <div 
                                  key={idx}
                                  className={`point-list-item ${selectedKeyPoint?.index === kp.index ? 'selected' : ''}`}
                                  onClick={() => setSelectedKeyPoint(kp)}
                                >
                                  <div className={`point-marker ${kp.type}-marker`}></div>
                                  <div className="point-details">
                                    <span className="point-type">{kp.description}</span>
                                    <span className="point-time">
                                      {((kp.timestamp - (points[0]?.timestamp || 0)) / 1000).toFixed(2)}s
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {keyPoints.length > 10 && (
                                <div className="more-points-hint">
                                  ... 还有 {keyPoints.length - 10} 个关键点
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </>
            )}

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
                      className={`session-item ${loadedSession?.id === session.id ? 'selected' : ''}`}
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
