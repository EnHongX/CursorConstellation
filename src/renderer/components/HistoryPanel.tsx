import React from 'react'
import { SessionInfo } from '../types'
import { formatDuration, formatTimestamp } from '../utils/format'
import './HistoryPanel.css'

interface HistoryPanelProps {
  dbUnavailable: boolean
  loadedSessionId: string | null
  sessions: SessionInfo[]
  onDeleteSession: (sessionId: string, event: React.MouseEvent) => void
  onLoadSession: (sessionId: string) => void
}

export function HistoryPanel({
  dbUnavailable,
  loadedSessionId,
  sessions,
  onDeleteSession,
  onLoadSession,
}: HistoryPanelProps) {
  return (
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
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${loadedSessionId === session.id ? 'selected' : ''}`}
              onClick={() => onLoadSession(session.id)}
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
                onClick={(event) => onDeleteSession(session.id, event)}
                title="删除此记录"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
