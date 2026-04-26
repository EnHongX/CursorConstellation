import React, { RefObject } from 'react'
import { RecordingStatus, Session } from '../types'
import { formatDuration, formatTimeShort, formatTimestamp } from '../utils/format'
import './ReplayControlsPanel.css'

interface ReplayControlsPanelProps {
  loadedSession: Session
  playbackSpeed: number
  playbackSpeeds: number[]
  status: RecordingStatus
  timeRangeEnd: number
  timeRangeStart: number
  timelineRef: RefObject<HTMLDivElement | null>
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
  onPlay,
  onPlaybackSpeedChange,
  onStop,
  onTimelineMouseDown,
  onTimelineMouseMove,
}: ReplayControlsPanelProps) {
  return (
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
