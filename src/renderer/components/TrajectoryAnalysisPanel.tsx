import React from 'react'
import { KeyPoint, Point } from '../types'
import { calculateSpeedStats, detectKeyPoints, getTimeSegments } from '../utils/trajectory'
import './AnalysisPanels.css'

interface TrajectoryAnalysisPanelProps {
  hoveredTimeSegment: number | null
  points: Point[]
  selectedKeyPoint: KeyPoint | null
  onHoverTimeSegmentChange: (index: number | null) => void
  onSelectKeyPoint: (keyPoint: KeyPoint) => void
}

export function TrajectoryAnalysisPanel({
  hoveredTimeSegment,
  points,
  selectedKeyPoint,
  onHoverTimeSegmentChange,
  onSelectKeyPoint,
}: TrajectoryAnalysisPanelProps) {
  if (points.length === 0) {
    return null
  }

  const speedStats = calculateSpeedStats(points)
  const keyPoints = detectKeyPoints(points)
  const timeSegments = getTimeSegments(points, 5)
  const pausePoints = keyPoints.filter((keyPoint) => keyPoint.type === 'pause')
  const turnPoints = keyPoints.filter((keyPoint) => keyPoint.type === 'turn')
  const speedChangePoints = keyPoints.filter((keyPoint) => keyPoint.type === 'speed_change')

  return (
    <div className="analysis-card">
      <h3 className="analysis-card-title">轨迹分析</h3>
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
              {timeSegments.map((segment, index) => (
                <div
                  key={index}
                  className={`segment-item ${hoveredTimeSegment === index ? 'hovered' : ''}`}
                  onMouseEnter={() => onHoverTimeSegmentChange(index)}
                  onMouseLeave={() => onHoverTimeSegmentChange(null)}
                >
                  <div className="segment-info">
                    <span className="segment-index">第 {index + 1} 段</span>
                    <span className="segment-duration">{((segment.end - segment.start) / 1000).toFixed(1)}s</span>
                  </div>
                  <div className="segment-speed-bar">
                    <div
                      className="segment-speed-fill"
                      style={{
                        width: `${Math.min((segment.avgSpeed / (speedStats.max || 1)) * 100, 100)}%`,
                        background: segment.avgSpeed > speedStats.avg
                          ? 'linear-gradient(90deg, #e94560, #ff6b6b)'
                          : 'linear-gradient(90deg, #00b894, #00cec9)',
                      }}
                    ></div>
                  </div>
                  <span className="segment-avg-speed">{segment.avgSpeed.toFixed(1)} 平均</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {keyPoints.length > 0 && (
          <div className="key-points-list">
            <h4>关键点位</h4>
            <div className="points-list">
              {keyPoints.slice(0, 10).map((keyPoint, index) => (
                <div
                  key={index}
                  className={`point-list-item ${selectedKeyPoint?.index === keyPoint.index ? 'selected' : ''}`}
                  onClick={() => onSelectKeyPoint(keyPoint)}
                >
                  <div className={`point-marker ${keyPoint.type}-marker`}></div>
                  <div className="point-details">
                    <span className="point-type">{keyPoint.description}</span>
                    <span className="point-time">{((keyPoint.timestamp - (points[0]?.timestamp || 0)) / 1000).toFixed(2)}s</span>
                  </div>
                </div>
              ))}
              {keyPoints.length > 10 && (
                <div className="more-points-hint">... 还有 {keyPoints.length - 10} 个关键点</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
