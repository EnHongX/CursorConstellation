import React, { forwardRef, useCallback, useEffect, useRef } from 'react'
import { ColorMode, KeyPoint, Point } from '../types'
import {
  calculateSpeedStats,
  detectKeyPoints,
  getColorByProgress,
  getColorBySpeed,
  getTimeProgress,
  limitDisplayPoints,
} from '../utils/trajectory'
import './ProjectionView.css'

const PROJECTION_VIEW_WIDTH = 800
const PROJECTION_VIEW_HEIGHT = 500
const POINT_DISPLAY_LIMIT = 2000

interface ProjectionPanel {
  x: number
  y: number
  width: number
  height: number
}

interface ProjectionViewProps {
  colorMode: ColorMode
  points: Point[]
  selectedKeyPoint: KeyPoint | null
  showKeyPoints: boolean
}

export const ProjectionView = forwardRef<HTMLCanvasElement, ProjectionViewProps>(function ProjectionView(
  {
    colorMode,
    points,
    selectedKeyPoint,
    showKeyPoints,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

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

  const drawProjectionViews = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || points.length === 0) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    context.fillStyle = '#16213e'
    context.fillRect(0, 0, PROJECTION_VIEW_WIDTH, PROJECTION_VIEW_HEIGHT)

    const displayPoints = limitDisplayPoints(points, POINT_DISPLAY_LIMIT)
    if (displayPoints.length === 0) {
      return
    }

    const startTime = displayPoints[0].timestamp
    const endTime = displayPoints[displayPoints.length - 1].timestamp
    const totalDuration = endTime - startTime
    const speedStats = calculateSpeedStats(displayPoints)
    const keyPoints = showKeyPoints ? detectKeyPoints(displayPoints) : []

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const point of displayPoints) {
      if (point.x < minX) minX = point.x
      if (point.x > maxX) maxX = point.x
      if (point.y < minY) minY = point.y
      if (point.y > maxY) maxY = point.y
    }

    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const outerPadding = 18
    const panelGap = 16
    const topPanelHeight = 172
    const topPanelWidth = (PROJECTION_VIEW_WIDTH - outerPadding * 2 - panelGap) / 2
    const bottomPanelHeight = PROJECTION_VIEW_HEIGHT - outerPadding * 2 - topPanelHeight - panelGap
    const xyPanel: ProjectionPanel = { x: outerPadding, y: outerPadding, width: topPanelWidth, height: topPanelHeight }
    const ytPanel: ProjectionPanel = { x: outerPadding + topPanelWidth + panelGap, y: outerPadding, width: topPanelWidth, height: topPanelHeight }
    const xytPanel: ProjectionPanel = { x: outerPadding, y: outerPadding + topPanelHeight + panelGap, width: PROJECTION_VIEW_WIDTH - outerPadding * 2, height: bottomPanelHeight }

    const getPointColor = (point: Point) => {
      if (colorMode === 'time') {
        return getColorByProgress(getTimeProgress(point.timestamp, startTime, totalDuration))
      }

      return getColorBySpeed(point.speed, speedStats.min, speedStats.max)
    }

    const drawPanelFrame = (panel: ProjectionPanel, title: string, subtitle: string) => {
      context.save()
      context.beginPath()
      context.roundRect(panel.x, panel.y, panel.width, panel.height, 16)
      context.fillStyle = 'rgba(5, 10, 24, 0.55)'
      context.fill()
      context.strokeStyle = 'rgba(255, 255, 255, 0.08)'
      context.lineWidth = 1
      context.stroke()

      context.fillStyle = 'rgba(255, 255, 255, 0.92)'
      context.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif'
      context.fillText(title, panel.x + 18, panel.y + 22)
      context.fillStyle = 'rgba(255, 255, 255, 0.46)'
      context.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
      context.fillText(subtitle, panel.x + 18, panel.y + 38)
      context.restore()
    }

    const getContentRect = (panel: ProjectionPanel, padding = { left: 20, right: 18, top: 50, bottom: 24 }): ProjectionPanel => ({
      x: panel.x + padding.left,
      y: panel.y + padding.top,
      width: panel.width - padding.left - padding.right,
      height: panel.height - padding.top - padding.bottom,
    })

    const drawGrid = (contentRect: ProjectionPanel, columns: number = 4, rows: number = 4) => {
      context.save()
      context.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      context.lineWidth = 1

      for (let column = 0; column <= columns; column++) {
        const x = contentRect.x + (column / columns) * contentRect.width
        context.beginPath()
        context.moveTo(x, contentRect.y)
        context.lineTo(x, contentRect.y + contentRect.height)
        context.stroke()
      }

      for (let row = 0; row <= rows; row++) {
        const y = contentRect.y + (row / rows) * contentRect.height
        context.beginPath()
        context.moveTo(contentRect.x, y)
        context.lineTo(contentRect.x + contentRect.width, y)
        context.stroke()
      }

      context.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      context.strokeRect(contentRect.x, contentRect.y, contentRect.width, contentRect.height)
      context.restore()
    }

    const drawStartEndMarker = (x: number, y: number, label: string, color: string, align: 'left' | 'right' = 'left') => {
      context.save()
      context.fillStyle = color
      context.beginPath()
      context.arc(x, y, 5.5, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = 'rgba(255, 255, 255, 0.92)'
      context.lineWidth = 2
      context.stroke()

      context.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
      context.fillStyle = 'rgba(255, 255, 255, 0.78)'
      const textX = align === 'left' ? x + 10 : x - context.measureText(label).width - 10
      context.fillText(label, textX, y - 8)
      context.restore()
    }

    const drawKeyPointMarker = (keyPoint: KeyPoint, x: number, y: number, textOffsetX: number = 12, textOffsetY: number = -10) => {
      let markerColor = '#00b894'
      let markerSize = 5

      switch (keyPoint.type) {
        case 'pause':
          markerColor = '#fdcb6e'
          markerSize = 7
          break
        case 'turn':
          markerColor = '#6c5ce7'
          markerSize = 6
          break
        case 'speed_change':
          markerColor = '#00b894'
          markerSize = 5
          break
      }

      context.save()
      context.fillStyle = markerColor
      context.beginPath()
      context.arc(x, y, markerSize, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = 'rgba(255, 255, 255, 0.78)'
      context.lineWidth = 1.5
      context.stroke()

      if (selectedKeyPoint && selectedKeyPoint.timestamp === keyPoint.timestamp && selectedKeyPoint.type === keyPoint.type) {
        context.strokeStyle = '#ffffff'
        context.lineWidth = 2.5
        context.beginPath()
        context.arc(x, y, markerSize + 4, 0, Math.PI * 2)
        context.stroke()

        context.fillStyle = 'rgba(255, 255, 255, 0.95)'
        context.font = '11px -apple-system, BlinkMacSystemFont, sans-serif'
        context.fillText(keyPoint.description, x + textOffsetX, y + textOffsetY)
      }

      context.restore()
    }

    drawPanelFrame(xyPanel, '俯视 XY', '看平面路径怎么走')
    drawPanelFrame(ytPanel, '侧视 Y-T', '看时间推进时的上下波动')
    drawPanelFrame(xytPanel, '透视 XY-T', '看轨迹如何被时间抬升')

    const xyContent = getContentRect(xyPanel)
    drawGrid(xyContent)
    const xyScale = Math.min(xyContent.width / rangeX, xyContent.height / rangeY)
    const projectXY = (point: Point) => ({
      x: xyContent.x + xyContent.width / 2 + (point.x - centerX) * xyScale,
      y: xyContent.y + xyContent.height / 2 + (point.y - centerY) * xyScale,
    })

    context.save()
    context.lineWidth = 2.2
    context.lineCap = 'round'
    context.lineJoin = 'round'
    for (let index = 1; index < displayPoints.length; index++) {
      const previous = projectXY(displayPoints[index - 1])
      const current = projectXY(displayPoints[index])
      const color = getPointColor(displayPoints[index])
      context.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.95)`
      context.beginPath()
      context.moveTo(previous.x, previous.y)
      context.lineTo(current.x, current.y)
      context.stroke()
    }
    context.fillStyle = 'rgba(255, 255, 255, 0.45)'
    context.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText('屏幕 X', xyContent.x + xyContent.width - 34, xyPanel.y + xyPanel.height - 8)
    context.fillText('屏幕 Y', xyPanel.x + 18, xyContent.y + 12)
    context.restore()

    const xyFirstPoint = projectXY(displayPoints[0])
    const xyLastPoint = projectXY(displayPoints[displayPoints.length - 1])
    drawStartEndMarker(xyFirstPoint.x, xyFirstPoint.y, '早', '#64c8ff')
    drawStartEndMarker(xyLastPoint.x, xyLastPoint.y, '晚', '#ffc864', 'right')
    keyPoints.forEach((keyPoint) => {
      const projected = projectXY({ x: keyPoint.x, y: keyPoint.y, timestamp: keyPoint.timestamp, speed: displayPoints[keyPoint.index]?.speed || 0 })
      drawKeyPointMarker(keyPoint, projected.x, projected.y)
    })

    const ytContent = getContentRect(ytPanel)
    drawGrid(ytContent, 5, 4)
    const projectYT = (point: Point) => ({
      x: ytContent.x + getTimeProgress(point.timestamp, startTime, totalDuration) * ytContent.width,
      y: ytContent.y + ((point.y - minY) / rangeY) * ytContent.height,
    })

    context.save()
    context.lineWidth = 2.1
    context.lineCap = 'round'
    context.lineJoin = 'round'
    for (let index = 1; index < displayPoints.length; index++) {
      const previous = projectYT(displayPoints[index - 1])
      const current = projectYT(displayPoints[index])
      const color = getPointColor(displayPoints[index])
      context.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.92)`
      context.beginPath()
      context.moveTo(previous.x, previous.y)
      context.lineTo(current.x, current.y)
      context.stroke()
    }
    context.fillStyle = 'rgba(255, 255, 255, 0.48)'
    context.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText('上', ytPanel.x + 14, ytContent.y + 10)
    context.fillText('下', ytPanel.x + 14, ytContent.y + ytContent.height - 2)
    context.textAlign = 'center'
    context.fillText('0s', ytContent.x, ytPanel.y + ytPanel.height - 8)
    context.fillText(`${(totalDuration / 2000).toFixed(1)}s`, ytContent.x + ytContent.width / 2, ytPanel.y + ytPanel.height - 8)
    context.fillText(`${(totalDuration / 1000).toFixed(1)}s`, ytContent.x + ytContent.width, ytPanel.y + ytPanel.height - 8)
    context.textAlign = 'start'
    context.restore()

    const ytFirstPoint = projectYT(displayPoints[0])
    const ytLastPoint = projectYT(displayPoints[displayPoints.length - 1])
    drawStartEndMarker(ytFirstPoint.x, ytFirstPoint.y, '早', '#64c8ff')
    drawStartEndMarker(ytLastPoint.x, ytLastPoint.y, '晚', '#ffc864', 'right')
    keyPoints.forEach((keyPoint) => {
      const projected = projectYT({ x: keyPoint.x, y: keyPoint.y, timestamp: keyPoint.timestamp, speed: displayPoints[keyPoint.index]?.speed || 0 })
      drawKeyPointMarker(keyPoint, projected.x, projected.y)
    })

    const xytContent = getContentRect(xytPanel, { left: 28, right: 28, top: 54, bottom: 28 })
    const timeLiftY = Math.min(96, xytContent.height * 0.48)
    const timeLiftX = Math.min(42, xytContent.width * 0.08)
    const xytScale = Math.min((xytContent.width - timeLiftX) / rangeX, (xytContent.height - timeLiftY) / rangeY)
    const projectXYT = (point: Point) => {
      const progress = getTimeProgress(point.timestamp, startTime, totalDuration)
      const baseX = xytContent.x + xytContent.width / 2 + (point.x - centerX) * xytScale
      const baseY = xytContent.y + xytContent.height / 2 + (point.y - centerY) * xytScale + timeLiftY / 2

      return {
        x: baseX - progress * timeLiftX,
        y: baseY - progress * timeLiftY,
      }
    }

    const corners = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]
    const startPlane = corners.map((corner) => projectXYT({ ...corner, timestamp: startTime, speed: 0 }))
    const endPlane = corners.map((corner) => projectXYT({ ...corner, timestamp: endTime, speed: 0 }))

    context.save()
    context.strokeStyle = 'rgba(255, 255, 255, 0.16)'
    context.lineWidth = 1
    context.setLineDash([5, 5])
    for (let index = 0; index < corners.length; index++) {
      const nextIndex = (index + 1) % corners.length
      context.beginPath()
      context.moveTo(startPlane[index].x, startPlane[index].y)
      context.lineTo(startPlane[nextIndex].x, startPlane[nextIndex].y)
      context.stroke()

      context.beginPath()
      context.moveTo(endPlane[index].x, endPlane[index].y)
      context.lineTo(endPlane[nextIndex].x, endPlane[nextIndex].y)
      context.stroke()

      context.beginPath()
      context.moveTo(startPlane[index].x, startPlane[index].y)
      context.lineTo(endPlane[index].x, endPlane[index].y)
      context.stroke()
    }
    context.setLineDash([])

    const arrowStartX = xytPanel.x + xytPanel.width - 110
    const arrowStartY = xytPanel.y + xytPanel.height - 46
    const arrowEndX = arrowStartX - 32
    const arrowEndY = arrowStartY - 54
    context.strokeStyle = 'rgba(255, 255, 255, 0.34)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(arrowStartX, arrowStartY)
    context.lineTo(arrowEndX, arrowEndY)
    context.stroke()
    context.beginPath()
    context.moveTo(arrowEndX, arrowEndY)
    context.lineTo(arrowEndX + 10, arrowEndY + 3)
    context.lineTo(arrowEndX + 2, arrowEndY + 12)
    context.closePath()
    context.fillStyle = 'rgba(255, 255, 255, 0.55)'
    context.fill()
    context.fillStyle = 'rgba(255, 255, 255, 0.48)'
    context.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText('时间抬升', arrowStartX - 4, arrowStartY + 16)
    context.restore()

    context.save()
    context.lineWidth = 2.4
    context.lineCap = 'round'
    context.lineJoin = 'round'
    for (let index = 1; index < displayPoints.length; index++) {
      const previous = projectXYT(displayPoints[index - 1])
      const current = projectXYT(displayPoints[index])
      const color = getPointColor(displayPoints[index])
      context.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.94)`
      context.beginPath()
      context.moveTo(previous.x, previous.y)
      context.lineTo(current.x, current.y)
      context.stroke()
    }
    context.restore()

    const sampleCount = Math.min(displayPoints.length, 24)
    const sampleStep = Math.max(1, Math.floor(displayPoints.length / sampleCount))
    for (let index = 0; index < displayPoints.length; index += sampleStep) {
      const point = displayPoints[index]
      const projected = projectXYT(point)
      const color = getPointColor(point)
      context.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.65)`
      context.beginPath()
      context.arc(projected.x, projected.y, 2.5, 0, Math.PI * 2)
      context.fill()
    }

    const xytFirstPoint = projectXYT(displayPoints[0])
    const xytLastPoint = projectXYT(displayPoints[displayPoints.length - 1])
    drawStartEndMarker(xytFirstPoint.x, xytFirstPoint.y, '早', '#64c8ff')
    drawStartEndMarker(xytLastPoint.x, xytLastPoint.y, '晚', '#ffc864', 'right')
    keyPoints.forEach((keyPoint) => {
      const projected = projectXYT({ x: keyPoint.x, y: keyPoint.y, timestamp: keyPoint.timestamp, speed: displayPoints[keyPoint.index]?.speed || 0 })
      drawKeyPointMarker(keyPoint, projected.x, projected.y, 14, -12)
    })

    context.fillStyle = 'rgba(255, 255, 255, 0.44)'
    context.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText('说明：这里的“厚度”只表示时间，不表示密度或停留时长。', xytPanel.x + 18, xytPanel.y + xytPanel.height - 10)
  }, [colorMode, points, selectedKeyPoint, showKeyPoints])

  useEffect(() => {
    drawProjectionViews()
  }, [drawProjectionViews])

  if (points.length === 0) {
    return null
  }

  return (
    <div className="projection-view-container">
      <div className="projection-view-header">
        <span className="projection-view-title">时空投影视图</span>
        <span className="projection-view-hint">同一段轨迹，同时看平面路径、时间波动和时间挤出</span>
      </div>
      <div className="projection-view-meta">
        <span className="projection-time-badge">厚度 = 时间</span>
        <span className="projection-view-note">主画布负责看原始平面轨迹，这里把同一数据换成三种投影视角。</span>
      </div>
      <canvas
        ref={setCanvasRef}
        width={PROJECTION_VIEW_WIDTH}
        height={PROJECTION_VIEW_HEIGHT}
        className="projection-view-canvas"
      />
    </div>
  )
})
