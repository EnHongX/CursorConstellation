import { KeyPoint, Point, SpeedStats, TimeSegment } from '../types'

export function getColorByProgress(progress: number): { r: number; g: number; b: number } {
  const startColor = { r: 100, g: 200, b: 255 }
  const midColor = { r: 233, g: 69, b: 96 }
  const endColor = { r: 255, g: 200, b: 100 }

  if (progress < 0.5) {
    const t = progress * 2
    return {
      r: Math.round(startColor.r + (midColor.r - startColor.r) * t),
      g: Math.round(startColor.g + (midColor.g - startColor.g) * t),
      b: Math.round(startColor.b + (midColor.b - startColor.b) * t),
    }
  }

  const t = (progress - 0.5) * 2
  return {
    r: Math.round(midColor.r + (endColor.r - midColor.r) * t),
    g: Math.round(midColor.g + (endColor.g - midColor.g) * t),
    b: Math.round(midColor.b + (endColor.b - midColor.b) * t),
  }
}

export function getColorBySpeed(speed: number, minSpeed: number, maxSpeed: number): { r: number; g: number; b: number } {
  const normalizedSpeed = maxSpeed === minSpeed ? 0.5 : (speed - minSpeed) / (maxSpeed - minSpeed)

  const slowColor = { r: 0, g: 184, b: 148 }
  const midColor = { r: 253, g: 203, b: 110 }
  const fastColor = { r: 233, g: 69, b: 96 }

  if (normalizedSpeed < 0.5) {
    const t = normalizedSpeed * 2
    return {
      r: Math.round(slowColor.r + (midColor.r - slowColor.r) * t),
      g: Math.round(slowColor.g + (midColor.g - slowColor.g) * t),
      b: Math.round(slowColor.b + (midColor.b - slowColor.b) * t),
    }
  }

  const t = (normalizedSpeed - 0.5) * 2
  return {
    r: Math.round(midColor.r + (fastColor.r - midColor.r) * t),
    g: Math.round(midColor.g + (fastColor.g - midColor.g) * t),
    b: Math.round(midColor.b + (fastColor.b - midColor.b) * t),
  }
}

export function limitDisplayPoints<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) {
    return items
  }

  const step = Math.max(1, Math.floor(items.length / limit))
  return items.filter((_, index) => index % step === 0 || index === items.length - 1)
}

export function getTimeProgress(timestamp: number, startTime: number, totalDuration: number): number {
  if (totalDuration <= 0) {
    return 0
  }

  return Math.max(0, Math.min((timestamp - startTime) / totalDuration, 1))
}

export function calculateSpeedStats(points: Point[]): SpeedStats {
  if (points.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0 }
  }

  const speeds = points.map((point) => point.speed)
  const sortedSpeeds = [...speeds].sort((a, b) => a - b)
  const sum = speeds.reduce((current, next) => current + next, 0)
  const avg = sum / speeds.length
  const medianIndex = Math.floor(sortedSpeeds.length / 2)
  const median = sortedSpeeds.length % 2 === 0
    ? (sortedSpeeds[medianIndex - 1] + sortedSpeeds[medianIndex]) / 2
    : sortedSpeeds[medianIndex]

  return {
    min: sortedSpeeds[0],
    max: sortedSpeeds[sortedSpeeds.length - 1],
    avg,
    median,
  }
}

export function detectKeyPoints(points: Point[]): KeyPoint[] {
  const keyPoints: KeyPoint[] = []

  if (points.length < 3) {
    return keyPoints
  }

  const pauseSpeedThreshold = 20
  const turnAngleThreshold = 45
  const speedChangeThreshold = 50

  for (let index = 1; index < points.length - 1; index++) {
    const current = points[index]
    const previous = points[index - 1]
    const next = points[index + 1]

    if (current.speed < pauseSpeedThreshold) {
      const isPause = points[index - 1].speed < pauseSpeedThreshold && points[index + 1].speed < pauseSpeedThreshold

      if (isPause && (index === 1 || points[index - 2].speed >= pauseSpeedThreshold)) {
        keyPoints.push({
          type: 'pause',
          index,
          timestamp: current.timestamp,
          x: current.x,
          y: current.y,
          description: '停顿点',
        })
      }
    }

    const angle1 = Math.atan2(current.y - previous.y, current.x - previous.x) * 180 / Math.PI
    const angle2 = Math.atan2(next.y - current.y, next.x - current.x) * 180 / Math.PI
    let angleDiff = Math.abs(angle2 - angle1)
    if (angleDiff > 180) {
      angleDiff = 360 - angleDiff
    }

    if (angleDiff > turnAngleThreshold) {
      keyPoints.push({
        type: 'turn',
        index,
        timestamp: current.timestamp,
        x: current.x,
        y: current.y,
        description: `转折点 (${Math.round(angleDiff)}°)`,
      })
    }

    const speedDiff = Math.abs(next.speed - previous.speed)
    if (speedDiff > speedChangeThreshold) {
      keyPoints.push({
        type: 'speed_change',
        index,
        timestamp: current.timestamp,
        x: current.x,
        y: current.y,
        description: next.speed > previous.speed ? '加速点' : '减速点',
      })
    }
  }

  return keyPoints
}

export function getTimeSegments(points: Point[], segmentCount: number = 5): TimeSegment[] {
  if (points.length === 0) {
    return []
  }

  const segments: TimeSegment[] = []
  const totalDuration = points[points.length - 1].timestamp - points[0].timestamp
  const segmentDuration = totalDuration / segmentCount

  for (let index = 0; index < segmentCount; index++) {
    const segmentStart = points[0].timestamp + index * segmentDuration
    const segmentEnd = points[0].timestamp + (index + 1) * segmentDuration
    const segmentPoints = points.filter((point) => point.timestamp >= segmentStart && point.timestamp <= segmentEnd)
    const avgSpeed = segmentPoints.length > 0
      ? segmentPoints.reduce((sum, point) => sum + point.speed, 0) / segmentPoints.length
      : 0

    segments.push({
      start: segmentStart,
      end: segmentEnd,
      points: segmentPoints,
      avgSpeed,
    })
  }

  return segments
}
