import { app, BrowserWindow, ipcMain, screen, systemPreferences } from 'electron'
import path from 'path'
import Database from 'better-sqlite3'
import { Point, Session, SessionInfo, PermissionStatus } from './types'

let mainWindow: BrowserWindow | null = null
let db: Database.Database | null = null
let recordingInterval: NodeJS.Timeout | null = null

let currentSession: {
  id: string
  points: Point[]
  startTime: number
  pausedTime: number | null
  totalPausedDuration: number
} | null = null

const DEFAULT_POLL_INTERVAL = 50
const POLL_INTERVAL_OPTIONS = [20, 50, 100, 200]
let currentPollInterval = DEFAULT_POLL_INTERVAL
let dbError: Error | null = null

interface DbErrorResponse {
  success: false
  error: string
}

interface DbSuccessResponse<T> {
  success: true
  data: T
}

type DbResponse<T> = DbSuccessResponse<T> | DbErrorResponse

function createDbErrorResponse(error: unknown): DbErrorResponse {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[Database Error]', message)
  return {
    success: false,
    error: message
  }
}

function sendErrorToRenderer(error: unknown, context: string) {
  if (mainWindow) {
    const message = error instanceof Error ? error.message : String(error)
    mainWindow.webContents.send('app:error', {
      context,
      message,
      timestamp: Date.now()
    })
  }
}

function initDatabase(): boolean {
  try {
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'cursor_constellation.db')
    
    console.log('[Database] Initializing database at:', dbPath)
    
    db = new Database(dbPath)
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        point_count INTEGER NOT NULL,
        poll_interval INTEGER NOT NULL DEFAULT 50,
        name TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `)
    
    const tableInfo = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
    const columns = tableInfo.map((col) => col.name)
    
    if (!columns.includes('poll_interval')) {
      db.exec('ALTER TABLE sessions ADD COLUMN poll_interval INTEGER NOT NULL DEFAULT 50')
    }
    if (!columns.includes('name')) {
      db.exec('ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT \'\'')
    }
    if (!columns.includes('note')) {
      db.exec('ALTER TABLE sessions ADD COLUMN note TEXT NOT NULL DEFAULT \'\'')
    }
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        speed REAL NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)
    
    db.exec('CREATE INDEX IF NOT EXISTS idx_points_session_id ON points(session_id)')
    
    dbError = null
    console.log('[Database] Initialized successfully')
    return true
  } catch (error) {
    dbError = error instanceof Error ? error : new Error(String(error))
    console.error('[Database] Initialization failed:', dbError.message)
    sendErrorToRenderer(error, 'database_init')
    return false
  }
}

function isDbReady(): boolean {
  return db !== null && dbError === null
}

function checkPermission(): PermissionStatus {
  if (process.platform !== 'darwin') {
    return {
      hasPermission: true,
      message: '当前平台不需要特殊权限'
    }
  }
  
  try {
    const hasAccessibility = systemPreferences.isTrustedAccessibilityClient(false)
    
    if (hasAccessibility) {
      return {
        hasPermission: true,
        message: '已获取可访问性权限'
      }
    }
    
    return {
      hasPermission: false,
      message: '需要可访问性权限才能采集全局鼠标轨迹，请在系统偏好设置中开启'
    }
  } catch (error) {
    console.error('[Permission] Check failed:', error)
    return {
      hasPermission: false,
      message: '权限检查失败，请确保应用在 macOS 系统中运行'
    }
  }
}

function requestPermission(): PermissionStatus {
  if (process.platform !== 'darwin') {
    return checkPermission()
  }
  
  try {
    const hasAccessibility = systemPreferences.isTrustedAccessibilityClient(true)
    
    if (hasAccessibility) {
      return {
        hasPermission: true,
        message: '已获取可访问性权限'
      }
    }
    
    return {
      hasPermission: false,
      message: '权限请求已发送，请在弹出的系统对话框中点击"打开系统偏好设置"并勾选本应用'
    }
  } catch (error) {
    console.error('[Permission] Request failed:', error)
    return {
      hasPermission: false,
      message: '权限请求失败，请手动在系统偏好设置中开启'
    }
  }
}

function calculateSpeed(currentPoint: Point, previousPoint: Point | null): number {
  if (!previousPoint) {
    return 0
  }
  
  const dx = currentPoint.x - previousPoint.x
  const dy = currentPoint.y - previousPoint.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const timeDiff = (currentPoint.timestamp - previousPoint.timestamp) / 1000
  
  if (timeDiff <= 0) {
    return 0
  }
  
  return distance / timeDiff
}

function startMouseTracking() {
  if (recordingInterval) {
    clearInterval(recordingInterval)
  }
  
  let lastPoint: Point | null = null
  
  recordingInterval = setInterval(() => {
    if (!mainWindow || !currentSession) return
    
    try {
      const cursorPoint = screen.getCursorScreenPoint()
      const now = Date.now()
      
      const point: Point = {
        x: cursorPoint.x,
        y: cursorPoint.y,
        timestamp: now,
        speed: 0
      }
      
      point.speed = calculateSpeed(point, lastPoint)
      
      lastPoint = point
      currentSession.points.push(point)
      
      mainWindow.webContents.send('recording:point', point)
    } catch (error) {
      console.error('[Mouse Tracking] Error:', error)
    }
  }, currentPollInterval)
}

function stopMouseTracking() {
  if (recordingInterval) {
    clearInterval(recordingInterval)
    recordingInterval = null
  }
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function saveSession(session: typeof currentSession): DbResponse<Session | null> {
  if (!isDbReady()) {
    return createDbErrorResponse(dbError || '数据库未初始化')
  }
  
  if (!session || session.points.length === 0) {
    return {
      success: true,
      data: null
    }
  }
  
  try {
    const now = Date.now()
    const duration = now - session.startTime - session.totalPausedDuration
    const sessionId = session.id
    const defaultName = `记录 ${new Date(session.startTime).toLocaleString('zh-CN')}`
    
    const insertSession = db!.prepare(`
      INSERT INTO sessions (id, start_time, end_time, duration, point_count, poll_interval, name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    
    insertSession.run(sessionId, session.startTime, now, duration, session.points.length, currentPollInterval, defaultName)
    
    const insertPoint = db!.prepare(`
      INSERT INTO points (session_id, x, y, timestamp, speed)
      VALUES (?, ?, ?, ?, ?)
    `)
    
    const transaction = db!.transaction(() => {
      for (const point of session.points) {
        insertPoint.run(sessionId, point.x, point.y, point.timestamp, point.speed)
      }
    })
    
    transaction()
    
    return {
      success: true,
      data: {
        id: sessionId,
        startTime: session.startTime,
        endTime: now,
        duration: duration,
        pointCount: session.points.length,
        pollInterval: currentPollInterval,
        name: defaultName,
        note: '',
        points: session.points
      }
    }
  } catch (error) {
    return createDbErrorResponse(error)
  }
}

function getSessions(): DbResponse<SessionInfo[]> {
  if (!isDbReady()) {
    return createDbErrorResponse(dbError || '数据库未初始化')
  }
  
  try {
    const rows = db!.prepare(`
      SELECT id, start_time as startTime, end_time as endTime, duration, point_count as pointCount, poll_interval as pollInterval, name, note
      FROM sessions
      ORDER BY created_at DESC
    `).all() as SessionInfo[]
    
    return {
      success: true,
      data: rows
    }
  } catch (error) {
    return createDbErrorResponse(error)
  }
}

function searchSessions(searchTerm: string): DbResponse<SessionInfo[]> {
  if (!isDbReady()) {
    return createDbErrorResponse(dbError || '数据库未初始化')
  }
  
  try {
    const rows = db!.prepare(`
      SELECT id, start_time as startTime, end_time as endTime, duration, point_count as pointCount, poll_interval as pollInterval, name, note
      FROM sessions
      WHERE name LIKE ? OR note LIKE ?
      ORDER BY created_at DESC
    `).all(`%${searchTerm}%`, `%${searchTerm}%`) as SessionInfo[]
    
    return {
      success: true,
      data: rows
    }
  } catch (error) {
    return createDbErrorResponse(error)
  }
}

function getSessionsByTimeRange(startTime: number, endTime: number): DbResponse<SessionInfo[]> {
  if (!isDbReady()) {
    return createDbErrorResponse(dbError || '数据库未初始化')
  }
  
  try {
    const rows = db!.prepare(`
      SELECT id, start_time as startTime, end_time as endTime, duration, point_count as pointCount, poll_interval as pollInterval, name, note
      FROM sessions
      WHERE start_time >= ? AND start_time <= ?
      ORDER BY created_at DESC
    `).all(startTime, endTime) as SessionInfo[]
    
    return {
      success: true,
      data: rows
    }
  } catch (error) {
    return createDbErrorResponse(error)
  }
}

function updateSessionName(id: string, name: string): DbResponse<boolean> {
  if (!isDbReady()) {
    return createDbErrorResponse(dbError || '数据库未初始化')
  }
  
  try {
    db!.prepare(`
      UPDATE sessions SET name = ? WHERE id = ?
    `).run(name, id)
    
    return {
      success: true,
      data: true
    }
  } catch (error) {
    return createDbErrorResponse(error)
  }
}

function updateSessionNote(id: string, note: string): DbResponse<boolean> {
  if (!isDbReady()) {
    return createDbErrorResponse(dbError || '数据库未初始化')
  }
  
  try {
    db!.prepare(`
      UPDATE sessions SET note = ? WHERE id = ?
    `).run(note, id)
    
    return {
      success: true,
      data: true
    }
  } catch (error) {
    return createDbErrorResponse(error)
  }
}

function getSession(id: string): DbResponse<Session | null> {
  if (!isDbReady()) {
    return createDbErrorResponse(dbError || '数据库未初始化')
  }
  
  try {
    const sessionRow = db!.prepare(`
      SELECT id, start_time as startTime, end_time as endTime, duration, point_count as pointCount, poll_interval as pollInterval, name, note
      FROM sessions
      WHERE id = ?
    `).get(id) as SessionInfo | undefined
    
    if (!sessionRow) {
      return {
        success: true,
        data: null
      }
    }
    
    const pointRows = db!.prepare(`
      SELECT x, y, timestamp, speed
      FROM points
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `).all(id) as Point[]
    
    return {
      success: true,
      data: {
        ...sessionRow,
        points: pointRows
      }
    }
  } catch (error) {
    return createDbErrorResponse(error)
  }
}

function deleteSession(id: string): DbResponse<boolean> {
  if (!isDbReady()) {
    return createDbErrorResponse(dbError || '数据库未初始化')
  }
  
  try {
    const deletePoints = db!.prepare('DELETE FROM points WHERE session_id = ?')
    const deleteSession = db!.prepare('DELETE FROM sessions WHERE id = ?')
    
    const transaction = db!.transaction(() => {
      deletePoints.run(id)
      deleteSession.run(id)
    })
    
    transaction()
    
    return {
      success: true,
      data: true
    }
  } catch (error) {
    return createDbErrorResponse(error)
  }
}

function createWindow() {
  try {
    mainWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 900,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#1a1a2e',
      show: false,
    })

    mainWindow.once('ready-to-show', () => {
      mainWindow?.show()
    })

    if (process.env.NODE_ENV === 'development') {
      const devServerUrl = 'http://localhost:5173'
      mainWindow.loadURL(devServerUrl)
      mainWindow.webContents.openDevTools()
    } else {
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    mainWindow.on('closed', () => {
      mainWindow = null
    })

    mainWindow.webContents.on('did-finish-load', () => {
      if (dbError) {
        sendErrorToRenderer(dbError, 'database_init')
      }
    })
  } catch (error) {
    console.error('[Window] Create failed:', error)
    sendErrorToRenderer(error, 'window_create')
  }
}

app.whenReady().then(() => {
  try {
    initDatabase()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  } catch (error) {
    console.error('[App] Initialization failed:', error)
  }
})

app.on('window-all-closed', () => {
  try {
    stopMouseTracking()
    if (db) {
      db.close()
      db = null
    }
  } catch (error) {
    console.error('[App] Cleanup error:', error)
  }
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('permission:check', () => {
  try {
    return checkPermission()
  } catch (error) {
    console.error('[IPC] permission:check error:', error)
    return {
      hasPermission: false,
      message: '权限检查过程中发生错误'
    }
  }
})

ipcMain.handle('permission:request', () => {
  try {
    return requestPermission()
  } catch (error) {
    console.error('[IPC] permission:request error:', error)
    return {
      hasPermission: false,
      message: '权限请求过程中发生错误'
    }
  }
})

ipcMain.on('recording:start', () => {
  try {
    const permissionStatus = checkPermission()
    
    if (!permissionStatus.hasPermission && process.platform === 'darwin') {
      if (mainWindow) {
        mainWindow.webContents.send('permission:status', permissionStatus)
      }
      return
    }
    
    currentSession = {
      id: generateSessionId(),
      points: [],
      startTime: Date.now(),
      pausedTime: null,
      totalPausedDuration: 0
    }
    
    startMouseTracking()
    
    if (mainWindow) {
      mainWindow.webContents.send('recording:started')
    }
  } catch (error) {
    console.error('[IPC] recording:start error:', error)
    sendErrorToRenderer(error, 'recording_start')
  }
})

ipcMain.on('recording:pause', () => {
  try {
    if (currentSession) {
      currentSession.pausedTime = Date.now()
      stopMouseTracking()
    }
    
    if (mainWindow) {
      mainWindow.webContents.send('recording:paused')
    }
  } catch (error) {
    console.error('[IPC] recording:pause error:', error)
    sendErrorToRenderer(error, 'recording_pause')
  }
})

ipcMain.on('recording:resume', () => {
  try {
    if (currentSession && currentSession.pausedTime) {
      currentSession.totalPausedDuration += Date.now() - currentSession.pausedTime
      currentSession.pausedTime = null
      startMouseTracking()
    }
    
    if (mainWindow) {
      mainWindow.webContents.send('recording:resumed')
    }
  } catch (error) {
    console.error('[IPC] recording:resume error:', error)
    sendErrorToRenderer(error, 'recording_resume')
  }
})

ipcMain.on('recording:stop', () => {
  try {
    stopMouseTracking()
    
    if (currentSession && mainWindow) {
      const result = saveSession(currentSession)
      
      if (result.success && result.data) {
        mainWindow.webContents.send('recording:stopped', result.data)
      } else if (!result.success) {
        sendErrorToRenderer(result.error, 'save_session')
      }
    }
    
    currentSession = null
  } catch (error) {
    console.error('[IPC] recording:stop error:', error)
    sendErrorToRenderer(error, 'recording_stop')
  }
})

ipcMain.handle('db:getSessions', () => {
  try {
    return getSessions()
  } catch (error) {
    console.error('[IPC] db:getSessions error:', error)
    return createDbErrorResponse(error)
  }
})

ipcMain.handle('db:getSession', (_event, id: string) => {
  try {
    return getSession(id)
  } catch (error) {
    console.error('[IPC] db:getSession error:', error)
    return createDbErrorResponse(error)
  }
})

ipcMain.handle('db:deleteSession', (_event, id: string) => {
  try {
    return deleteSession(id)
  } catch (error) {
    console.error('[IPC] db:deleteSession error:', error)
    return createDbErrorResponse(error)
  }
})

ipcMain.handle('db:searchSessions', (_event, searchTerm: string) => {
  try {
    return searchSessions(searchTerm)
  } catch (error) {
    console.error('[IPC] db:searchSessions error:', error)
    return createDbErrorResponse(error)
  }
})

ipcMain.handle('db:getSessionsByTimeRange', (_event, startTime: number, endTime: number) => {
  try {
    return getSessionsByTimeRange(startTime, endTime)
  } catch (error) {
    console.error('[IPC] db:getSessionsByTimeRange error:', error)
    return createDbErrorResponse(error)
  }
})

ipcMain.handle('db:updateSessionName', (_event, id: string, name: string) => {
  try {
    return updateSessionName(id, name)
  } catch (error) {
    console.error('[IPC] db:updateSessionName error:', error)
    return createDbErrorResponse(error)
  }
})

ipcMain.handle('db:updateSessionNote', (_event, id: string, note: string) => {
  try {
    return updateSessionNote(id, note)
  } catch (error) {
    console.error('[IPC] db:updateSessionNote error:', error)
    return createDbErrorResponse(error)
  }
})

ipcMain.handle('recording:setPollInterval', (_event, interval: number) => {
  try {
    if (POLL_INTERVAL_OPTIONS.includes(interval)) {
      currentPollInterval = interval
      return { success: true, interval: currentPollInterval }
    }
    return { success: false, error: 'Invalid poll interval' }
  } catch (error) {
    console.error('[IPC] recording:setPollInterval error:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('recording:getPollInterval', () => {
  try {
    return { success: true, interval: currentPollInterval, options: POLL_INTERVAL_OPTIONS }
  } catch (error) {
    console.error('[IPC] recording:getPollInterval error:', error)
    return { success: false, error: String(error) }
  }
})
