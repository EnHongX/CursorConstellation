import React, { useCallback, useEffect, useRef } from 'react'
import { Point } from '../types'
import { calculateSpeedStats, detectKeyPoints } from '../utils/trajectory'
import './AnalysisPanels.css'

const SPEED_CHART_WIDTH = 260
const SPEED_CHART_HEIGHT = 200

interface SpeedChartPanelProps {
  points: Point[]
  showKeyPoints: boolean
}

export function SpeedChartPanel({ points, showKeyPoints }: SpeedChartPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const drawSpeedChart = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || points.length === 0) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    context.fillStyle = '#16213e'
    context.fillRect(0, 0, SPEED_CHART_WIDTH, SPEED_CHART_HEIGHT)

    const padding = { top: 20, right: 10, bottom: 30, left: 40 }
    const chartWidth = SPEED_CHART_WIDTH - padding.left - padding.right
    const chartHeight = SPEED_CHART_HEIGHT - padding.top - padding.bottom
    const speedStats = calculateSpeedStats(points)
    const maxSpeed = Math.max(speedStats.max, 1)

    context.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    context.lineWidth = 1
    for (let index = 0; index <= 5; index++) {
      const y = padding.top + (index / 5) * chartHeight
      context.beginPath()
      context.moveTo(padding.left, y)
      context.lineTo(padding.left + chartWidth, y)
      context.stroke()
    }

    context.fillStyle = 'rgba(255, 255, 255, 0.5)'
    context.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
    context.textAlign = 'right'
    for (let index = 0; index <= 5; index++) {
      const y = padding.top + (index / 5) * chartHeight
      const speed = maxSpeed - (index / 5) * maxSpeed
      context.fillText(`${Math.round(speed)}`, padding.left - 5, y + 4)
    }
    context.fillText('速度', padding.left - 5, padding.top - 5)

    context.textAlign = 'center'
    for (let index = 0; index <= 5; index++) {
      const x = padding.left + (index / 5) * chartWidth
      const progress = index / 5
      const timeMs = progress * (points[points.length - 1].timestamp - points[0].timestamp)
      context.fillText(`${(timeMs / 1000).toFixed(0)}s`, x, padding.top + chartHeight + 15)
    }

    context.beginPath()
    context.moveTo(padding.left, padding.top + chartHeight)
    for (let index = 0; index < points.length; index++) {
      const x = padding.left + (index / Math.max(points.length - 1, 1)) * chartWidth
      const y = padding.top + chartHeight - (points[index].speed / maxSpeed) * chartHeight
      if (index === 0) {
        context.moveTo(x, y)
      } else {
        context.lineTo(x, y)
      }
    }
    context.lineTo(padding.left + chartWidth, padding.top + chartHeight)
    context.closePath()

    const gradient = context.createLinearGradient(0, padding.top, 0, padding.top + chartHeight)
    gradient.addColorStop(0, 'rgba(233, 69, 96, 0.4)')
    gradient.addColorStop(0.5, 'rgba(253, 203, 110, 0.3)')
    gradient.addColorStop(1, 'rgba(0, 184, 148, 0.2)')
    context.fillStyle = gradient
    context.fill()

    context.beginPath()
    for (let index = 0; index < points.length; index++) {
      const x = padding.left + (index / Math.max(points.length - 1, 1)) * chartWidth
      const y = padding.top + chartHeight - (points[index].speed / maxSpeed) * chartHeight
      if (index === 0) {
        context.moveTo(x, y)
      } else {
        context.lineTo(x, y)
      }
    }
    context.strokeStyle = '#e94560'
    context.lineWidth = 2
    context.stroke()

    if (showKeyPoints) {
      const keyPoints = detectKeyPoints(points)
      keyPoints.forEach((keyPoint) => {
        const x = padding.left + (keyPoint.index / Math.max(points.length - 1, 1)) * chartWidth
        const y = padding.top + chartHeight - (points[keyPoint.index]?.speed || 0) / maxSpeed * chartHeight
        let markerColor = '#00b894'
        let markerSize = 3

        switch (keyPoint.type) {
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

        context.fillStyle = markerColor
        context.beginPath()
        context.arc(x, y, markerSize, 0, Math.PI * 2)
        context.fill()

        context.strokeStyle = 'rgba(255, 255, 255, 0.8)'
        context.lineWidth = 1
        context.stroke()
      })
    }

    if (speedStats.avg > 0) {
      const avgY = padding.top + chartHeight - (speedStats.avg / maxSpeed) * chartHeight
      context.strokeStyle = 'rgba(108, 92, 231, 0.6)'
      context.lineWidth = 1.5
      context.setLineDash([5, 5])
      context.beginPath()
      context.moveTo(padding.left, avgY)
      context.lineTo(padding.left + chartWidth, avgY)
      context.stroke()
      context.setLineDash([])

      context.fillStyle = 'rgba(108, 92, 231, 0.9)'
      context.textAlign = 'left'
      context.fillText(`平均: ${speedStats.avg.toFixed(1)}`, padding.left + 5, avgY - 5)
    }
  }, [points, showKeyPoints])

  useEffect(() => {
    drawSpeedChart()
  }, [drawSpeedChart])

  if (points.length === 0) {
    return null
  }

  return (
    <div className="analysis-card">
      <h3 className="analysis-card-title">速度变化曲线</h3>
      <canvas
        ref={canvasRef}
        width={SPEED_CHART_WIDTH}
        height={SPEED_CHART_HEIGHT}
        className="speed-chart-canvas"
      />
    </div>
  )
}
