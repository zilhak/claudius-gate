// IPC Bridge for Electron
// Main과 Renderer 프로세스 간 TTY 데이터 브리지

const { EventEmitter } = require('events');
const { ipcMain, ipcRenderer } = require('electron');

// IPC 채널 이름
const CHANNELS = {
  // Main -> Renderer
  TTY_DATA: 'tty:data',
  TTY_EXIT: 'tty:exit',
  TTY_ERROR: 'tty:error',
  TTY_STATE: 'tty:state',
  TTY_READY: 'tty:ready',
  
  // Renderer -> Main
  TTY_WRITE: 'tty:write',
  TTY_RESIZE: 'tty:resize',
  TTY_SPAWN: 'tty:spawn',
  TTY_KILL: 'tty:kill',
  TTY_CLEAR: 'tty:clear'
};

// Main 프로세스용 브리지
class MainProcessBridge extends EventEmitter {
  constructor() {
    super();
    this.windows = new Map();
    this.sessions = new Map();
    this.setupHandlers();
  }
  
  setupHandlers() {
    // Renderer에서 오는 요청 처리
    ipcMain.handle(CHANNELS.TTY_SPAWN, async (event, sessionId, command, args, options) => {
      return this.handleSpawn(event.sender, sessionId, command, args, options);
    });
    
    ipcMain.on(CHANNELS.TTY_WRITE, (event, sessionId, data) => {
      this.handleWrite(sessionId, data);
    });
    
    ipcMain.on(CHANNELS.TTY_RESIZE, (event, sessionId, cols, rows) => {
      this.handleResize(sessionId, cols, rows);
    });
    
    ipcMain.on(CHANNELS.TTY_KILL, (event, sessionId, signal) => {
      this.handleKill(sessionId, signal);
    });
    
    ipcMain.on(CHANNELS.TTY_CLEAR, (event, sessionId) => {
      this.handleClear(sessionId);
    });
  }
  
  // 세션 등록
  registerSession(sessionId, ptyManager, webContents) {
    this.sessions.set(sessionId, {
      ptyManager,
      webContents
    });
    
    // PTY 이벤트를 IPC로 전달
    ptyManager.on('data', (data) => {
      this.sendToRenderer(webContents, CHANNELS.TTY_DATA, sessionId, this.encodeData(data));
    });
    
    ptyManager.on('exit', (exitCode) => {
      this.sendToRenderer(webContents, CHANNELS.TTY_EXIT, sessionId, exitCode);
      this.sessions.delete(sessionId);
    });
    
    ptyManager.on('error', (error) => {
      this.sendToRenderer(webContents, CHANNELS.TTY_ERROR, sessionId, error.message);
    });
    
    ptyManager.on('stateChange', (state) => {
      this.sendToRenderer(webContents, CHANNELS.TTY_STATE, sessionId, state);
    });
  }
  
  // 데이터 인코딩 (바이너리 안전)
  encodeData(data) {
    if (typeof data === 'string') {
      return {
        type: 'text',
        data: data
      };
    } else if (Buffer.isBuffer(data)) {
      return {
        type: 'binary',
        data: Array.from(data)
      };
    } else {
      return {
        type: 'unknown',
        data: data
      };
    }
  }
  
  // Renderer로 데이터 전송
  sendToRenderer(webContents, channel, ...args) {
    if (webContents && !webContents.isDestroyed()) {
      webContents.send(channel, ...args);
    }
  }
  
  // 핸들러들
  async handleSpawn(webContents, sessionId, command, args, options) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      await session.ptyManager.spawn(command, args, options);
      this.sendToRenderer(webContents, CHANNELS.TTY_READY, sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  handleWrite(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (session && session.ptyManager) {
      // 데이터 디코딩
      if (data.type === 'binary') {
        session.ptyManager.write(Buffer.from(data.data));
      } else {
        session.ptyManager.write(data.data);
      }
    }
  }
  
  handleResize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (session && session.ptyManager) {
      session.ptyManager.resize(cols, rows);
    }
  }
  
  handleKill(sessionId, signal) {
    const session = this.sessions.get(sessionId);
    if (session && session.ptyManager) {
      session.ptyManager.kill(signal);
    }
  }
  
  handleClear(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.ptyManager) {
      session.ptyManager.clearBuffer();
    }
  }
  
  // 세션 정리
  cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.ptyManager) {
        session.ptyManager.kill();
      }
      this.sessions.delete(sessionId);
    }
  }
  
  // 모든 세션 정리
  cleanupAll() {
    for (const sessionId of this.sessions.keys()) {
      this.cleanupSession(sessionId);
    }
  }
}

// Renderer 프로세스용 브리지
class RendererProcessBridge extends EventEmitter {
  constructor() {
    super();
    this.sessionId = null;
    this.connected = false;
    this.setupHandlers();
  }
  
  setupHandlers() {
    // Main에서 오는 이벤트 처리
    ipcRenderer.on(CHANNELS.TTY_DATA, (event, sessionId, data) => {
      if (sessionId === this.sessionId) {
        this.emit('data', this.decodeData(data));
      }
    });
    
    ipcRenderer.on(CHANNELS.TTY_EXIT, (event, sessionId, exitCode) => {
      if (sessionId === this.sessionId) {
        this.connected = false;
        this.emit('exit', exitCode);
      }
    });
    
    ipcRenderer.on(CHANNELS.TTY_ERROR, (event, sessionId, error) => {
      if (sessionId === this.sessionId) {
        this.emit('error', new Error(error));
      }
    });
    
    ipcRenderer.on(CHANNELS.TTY_STATE, (event, sessionId, state) => {
      if (sessionId === this.sessionId) {
        this.emit('stateChange', state);
      }
    });
    
    ipcRenderer.on(CHANNELS.TTY_READY, (event, sessionId) => {
      if (sessionId === this.sessionId) {
        this.connected = true;
        this.emit('ready');
      }
    });
  }
  
  // 데이터 디코딩
  decodeData(data) {
    if (data.type === 'binary') {
      return Buffer.from(data.data);
    } else {
      return data.data;
    }
  }
  
  // 세션 연결
  connect(sessionId) {
    this.sessionId = sessionId;
    this.connected = false;
  }
  
  // PTY 프로세스 시작
  async spawn(command, args, options) {
    if (!this.sessionId) {
      throw new Error('Not connected to a session');
    }
    
    const result = await ipcRenderer.invoke(CHANNELS.TTY_SPAWN, this.sessionId, command, args, options);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result;
  }
  
  // 데이터 전송
  write(data) {
    if (!this.sessionId || !this.connected) {
      throw new Error('Not connected');
    }
    
    const encoded = typeof data === 'string' 
      ? { type: 'text', data }
      : { type: 'binary', data: Array.from(data) };
    
    ipcRenderer.send(CHANNELS.TTY_WRITE, this.sessionId, encoded);
  }
  
  // 크기 조정
  resize(cols, rows) {
    if (!this.sessionId) {
      return;
    }
    
    ipcRenderer.send(CHANNELS.TTY_RESIZE, this.sessionId, cols, rows);
  }
  
  // 프로세스 종료
  kill(signal) {
    if (!this.sessionId) {
      return;
    }
    
    ipcRenderer.send(CHANNELS.TTY_KILL, this.sessionId, signal);
  }
  
  // 버퍼 클리어
  clear() {
    if (!this.sessionId) {
      return;
    }
    
    ipcRenderer.send(CHANNELS.TTY_CLEAR, this.sessionId);
  }
  
  // 연결 해제
  disconnect() {
    if (this.connected) {
      this.kill();
    }
    this.sessionId = null;
    this.connected = false;
  }
}

// 헬퍼 함수: 프로세스 타입 자동 감지
function createIPCBridge() {
  if (typeof ipcMain !== 'undefined') {
    return new MainProcessBridge();
  } else if (typeof ipcRenderer !== 'undefined') {
    return new RendererProcessBridge();
  } else {
    throw new Error('Not running in Electron environment');
  }
}

module.exports = {
  CHANNELS,
  MainProcessBridge,
  RendererProcessBridge,
  createIPCBridge
};