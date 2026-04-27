import React, { useState, useRef, useEffect } from 'react'
import { SessionInfo } from '../types'
import { formatDuration, formatTimestamp } from '../utils/format'
import './HistoryPanel.css'

type TimeFilter = 'all' | 'today' | 'last7days' | 'custom'

interface HistoryPanelProps {
  dbUnavailable: boolean
  loadedSessionId: string | null
  sessions: SessionInfo[]
  searchTerm: string
  timeFilter: TimeFilter
  customDateStart: string
  customDateEnd: string
  onDeleteSession: (sessionId: string, event: React.MouseEvent) => void
  onLoadSession: (sessionId: string) => void
  onSearchChange: (term: string) => void
  onTimeFilterChange: (filter: TimeFilter) => void
  onCustomDateStartChange: (date: string) => void
  onCustomDateEndChange: (date: string) => void
  onUpdateSessionName: (sessionId: string, name: string) => void
  onUpdateSessionNote: (sessionId: string, note: string) => void
}

export function HistoryPanel({
  dbUnavailable,
  loadedSessionId,
  sessions,
  searchTerm,
  timeFilter,
  customDateStart,
  customDateEnd,
  onDeleteSession,
  onLoadSession,
  onSearchChange,
  onTimeFilterChange,
  onCustomDateStartChange,
  onCustomDateEndChange,
  onUpdateSessionName,
  onUpdateSessionNote,
}: HistoryPanelProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string>('')
  const [editingNoteSessionId, setEditingNoteSessionId] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState<string>('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editingSessionId && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingSessionId])

  useEffect(() => {
    if (editingNoteSessionId && noteTextareaRef.current) {
      noteTextareaRef.current.focus()
    }
  }, [editingNoteSessionId])

  const handleStartEditName = (session: SessionInfo, event: React.MouseEvent) => {
    event.stopPropagation()
    setEditingSessionId(session.id)
    setEditingName(session.name || formatTimestamp(session.startTime))
  }

  const handleSaveName = (sessionId: string) => {
    if (editingName.trim()) {
      onUpdateSessionName(sessionId, editingName.trim())
    }
    setEditingSessionId(null)
    setEditingName('')
  }

  const handleCancelEditName = () => {
    setEditingSessionId(null)
    setEditingName('')
  }

  const handleStartEditNote = (session: SessionInfo, event: React.MouseEvent) => {
    event.stopPropagation()
    setEditingNoteSessionId(session.id)
    setEditingNote(session.note || '')
  }

  const handleSaveNote = (sessionId: string) => {
    onUpdateSessionNote(sessionId, editingNote)
    setEditingNoteSessionId(null)
    setEditingNote('')
  }

  const handleCancelEditNote = () => {
    setEditingNoteSessionId(null)
    setEditingNote('')
  }

  const handleNameKeyDown = (event: React.KeyboardEvent, sessionId: string) => {
    if (event.key === 'Enter') {
      handleSaveName(sessionId)
    } else if (event.key === 'Escape') {
      handleCancelEditName()
    }
  }

  const handleNoteKeyDown = (event: React.KeyboardEvent, sessionId: string) => {
    if (event.key === 'Escape') {
      handleCancelEditNote()
    }
  }

  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  const today = formatDateForInput(new Date())
  const sevenDaysAgo = formatDateForInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

  return (
    <div className="history-section">
      <h3>历史记录</h3>

      <div className="history-filters">
        <div className="search-container">
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder="搜索名称或备注..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchTerm && (
            <button
              className="clear-search-btn"
              onClick={() => onSearchChange('')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="time-filter-container">
          <div className="time-filter-buttons">
            <button
              className={`time-filter-btn ${timeFilter === 'all' ? 'active' : ''}`}
              onClick={() => onTimeFilterChange('all')}
            >
              全部
            </button>
            <button
              className={`time-filter-btn ${timeFilter === 'today' ? 'active' : ''}`}
              onClick={() => onTimeFilterChange('today')}
            >
              今天
            </button>
            <button
              className={`time-filter-btn ${timeFilter === 'last7days' ? 'active' : ''}`}
              onClick={() => onTimeFilterChange('last7days')}
            >
              最近7天
            </button>
            <button
              className={`time-filter-btn ${timeFilter === 'custom' ? 'active' : ''}`}
              onClick={() => onTimeFilterChange('custom')}
            >
              自定义
            </button>
          </div>

          {timeFilter === 'custom' && (
            <div className="custom-date-range">
              <div className="date-input-group">
                <label className="date-label">从:</label>
                <input
                  type="date"
                  className="date-input"
                  value={customDateStart || sevenDaysAgo}
                  onChange={(e) => onCustomDateStartChange(e.target.value)}
                  max={customDateEnd || today}
                />
              </div>
              <div className="date-input-group">
                <label className="date-label">到:</label>
                <input
                  type="date"
                  className="date-input"
                  value={customDateEnd || today}
                  onChange={(e) => onCustomDateEndChange(e.target.value)}
                  min={customDateStart || sevenDaysAgo}
                  max={today}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {dbUnavailable ? (
        <div className="empty-history">
          <p>数据库不可用</p>
          <p className="empty-hint">请尝试重新运行 npm run rebuild</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="empty-history">
          <p>{searchTerm || timeFilter !== 'all' ? '未找到匹配的记录' : '暂无历史记录'}</p>
          <p className="empty-hint">
            {searchTerm || timeFilter !== 'all'
              ? '请尝试调整搜索条件或时间筛选'
              : '开始记录后，点击停止即可保存'}
          </p>
        </div>
      ) : (
        <div className="session-list">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${loadedSessionId === session.id ? 'selected' : ''}`}
              onClick={() => !editingSessionId && !editingNoteSessionId && onLoadSession(session.id)}
            >
              <div className="session-info">
                {editingSessionId === session.id ? (
                  <div className="session-name-edit">
                    <input
                      ref={nameInputRef}
                      type="text"
                      className="session-name-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => handleNameKeyDown(e, session.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="name-edit-actions">
                      <button
                        className="name-edit-btn save"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSaveName(session.id)
                        }}
                      >
                        ✓
                      </button>
                      <button
                        className="name-edit-btn cancel"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCancelEditName()
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="session-name-row">
                    <div className="session-time" title={session.name || formatTimestamp(session.startTime)}>
                      {session.name || formatTimestamp(session.startTime)}
                    </div>
                    <button
                      className="edit-name-btn"
                      onClick={(e) => handleStartEditName(session, e)}
                      title="重命名"
                    >
                      ✏️
                    </button>
                  </div>
                )}

                <div className="session-meta">
                  <span>{session.pointCount} 个点</span>
                  <span>•</span>
                  <span>{formatDuration(session.duration)}</span>
                  <span>•</span>
                  <span>{session.pollInterval}ms</span>
                </div>

                {editingNoteSessionId === session.id ? (
                  <div className="session-note-edit" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      ref={noteTextareaRef}
                      className="session-note-textarea"
                      value={editingNote}
                      onChange={(e) => setEditingNote(e.target.value)}
                      onKeyDown={(e) => handleNoteKeyDown(e, session.id)}
                      placeholder="添加备注..."
                      rows={3}
                    />
                    <div className="note-edit-actions">
                      <button
                        className="note-edit-btn save"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSaveNote(session.id)
                        }}
                      >
                        保存
                      </button>
                      <button
                        className="note-edit-btn cancel"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCancelEditNote()
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : session.note ? (
                  <div className="session-note-row">
                    <div className="session-note" title={session.note}>
                      📝 {session.note}
                    </div>
                    <button
                      className="edit-note-btn"
                      onClick={(e) => handleStartEditNote(session, e)}
                      title="编辑备注"
                    >
                      ✏️
                    </button>
                  </div>
                ) : (
                  <button
                    className="add-note-btn"
                    onClick={(e) => handleStartEditNote(session, e)}
                    title="添加备注"
                  >
                    + 添加备注
                  </button>
                )}
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
