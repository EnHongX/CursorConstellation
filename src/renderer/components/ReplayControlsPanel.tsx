import React, { RefObject, useState } from 'react'
import { RecordingStatus, Session } from '../types'
import { formatDuration, formatTimeShort, formatTimestamp } from '../utils/format'
import './ReplayControlsPanel.css'

export type ExportFormat = 'json' | 'png'
export type ExportView = 'track' | 'projection' | 'both'

interface ReplayControlsPanelProps {
  loadedSession: Session
  playbackSpeed: number
  playbackSpeeds: number[]
  status: RecordingStatus
  timeRangeEnd: number
  timeRangeStart: number
  timelineRef: RefObject<HTMLDivElement | null>
  onExport: (format: ExportFormat, view?: ExportView) => void
  onPlay: () => void
  onPlaybackSpeedChange: (speed: number) => void
  onStop: () => void
  onTimelineMouseDown: (event: React.MouseEvent, type: 'left' | 'right' | 'range') => void
  onTimelineMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void
}

export function ReplayControlsPanel({
  loadedSession,
  playbackSpeed,
  playbackSpeeds,
  status,
  timeRangeEnd,
  timeRangeStart,
  timelineRef,
  onExport,
  onPlay,
  onPlaybackSpeedChange,
  onStop,
  onTimelineMouseDown,
  onTimelineMouseMove,
}: ReplayControlsPanelProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showPNGSubmenu, setShowPNGSubmenu] = useState(false)

  const handleExportJSON = () => {
    onExport('json')
    setShowExportMenu(false)
  }

  const handleExportPNG = (view: ExportView) => {
    onExport('png', view)
    setShowExportMenu(false)
    setShowPNGSubmenu(false)
  }

  const toggleExportMenu = () => {
    setShowExportMenu(!showExportMenu)
    setShowPNGSubmenu(false)
  }

  const closeMenus = () => {
    setShowExportMenu(false)
    setShowPNGSubmenu(false)
  }

  return (
    <div className="replay-controls">
      <div className="replay-header">
        <span className="replay-title">回放控制</span>
        <div className="replay-header-right">
          <span className="replay-session-info">
            {formatTimestamp(loadedSession.startTime)} · {formatDuration(loadedSession.duration)}
          </span>
          <div className="export-menu-container">
            <button
              className={`export-btn ${status === 'replaying' ? 'disabled' : ''}`}
              onClick={toggleExportMenu}
              disabled={status === 'replaying'}
            >
              <span className="btn-icon">📥</span>
              导出
            </button>
            {showExportMenu && (
              <div className="export-menu" onMouseLeave={closeMenus}>
                <div
                  className={`export-menu-item ${status === 'replaying' ? 'disabled' : ''}`}
                  onClick={status !== 'replaying' ? handleExportJSON : undefined}
                >
                  <span className="menu-icon">📄</span>
                  导出 JSON
                </div>
                <div
                  className={`export-menu-item has-submenu ${status === 'replaying' ? 'disabled' : ''}`}
                  onMouseEnter={() => status !== 'replaying' && setShowPNGSubmenu(true)}
                  onMouseLeave={() => setShowPNGSubmenu(false)}
                >
                  <span className="menu-icon">🖼️</span>
                  导出 PNG
                  <span className="submenu-arrow">▶</span>
                  {showPNGSubmenu && (
                    <div className="export-submenu">
                      <div
                        className="export-menu-item"
                        onClick={() => handleExportPNG('track')}
                      >
                        <span className="menu-icon">📍</span>
                        主轨迹图
                      </div>
                      <div
                        className="export-menu-item"
                        onClick={() => handleExportPNG('projection')}
                      >
                        <span className="menu-icon">📊</span>
                        时空投影视图
                      </div>
                      <div
                        className="export-menu-item"
                        onClick={() => handleExportPNG('both')}
                      >
                        <span className="menu-icon">🗂️</span>
                        全部导出
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="speed-controls">
        <span className="speed-label">播放速度:</span>
        <div className="speed-buttons">
          {playbackSpeeds.map((speed) => (
            <button
              key={speed}
              className={`speed-btn ${playbackSpeed === speed ? 'active' : ''} ${status === 'replaying' ? 'disabled' : ''}`}
              onClick={() => {
                if (status !== 'replaying') {
                  onPlaybackSpeedChange(speed)
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
        onMouseMove={onTimelineMouseMove}
      >
        <div className="timeline-track">
          <div
            className="timeline-range"
            style={{
              left: `${(timeRangeStart / loadedSession.duration) * 100}%`,
              width: `${((timeRangeEnd - timeRangeStart) / loadedSession.duration) * 100}%`,
            }}
            onMouseDown={(event) => onTimelineMouseDown(event, 'range')}
          />
          <div
            className="timeline-handle timeline-handle-left"
            style={{
              left: `${(timeRangeStart / loadedSession.duration) * 100}%`,
            }}
            onMouseDown={(event) => onTimelineMouseDown(event, 'left')}
          >
            <div className="handle-icon">◀</div>
          </div>
          <div
            className="timeline-handle timeline-handle-right"
            style={{
              left: `${(timeRangeEnd / loadedSession.duration) * 100}%`,
            }}
            onMouseDown={(event) => onTimelineMouseDown(event, 'right')}
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
          onClick={onPlay}
          disabled={status === 'replaying'}
        >
          <span className="btn-icon">▶</span>
          回放
        </button>
        <button
          className={`control-btn stop-btn ${status !== 'replaying' ? 'disabled' : ''}`}
          onClick={onStop}
          disabled={status !== 'replaying'}
        >
          <span className="btn-icon">⏹</span>
          停止
        </button>
      </div>
    </div>
  )
}
