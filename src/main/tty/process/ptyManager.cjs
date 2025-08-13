// PTY Process Manager
// Windows ConPTY와 Unix PTY를 통합 관리

const { EventEmitter } = require('events');
const pty = require('node-pty');
const os = require('os');
const path = require('path');

// PTY 프로세스 상태
const ProcessState = {
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  ERROR: 'error'
};

// PTY 옵션 기본값
const DEFAULT_OPTIONS = {
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  handleFlowControl: true,
  flowControlPause: '\x13',  // XOFF
  flowControlResume: '\x11'  // XON
};

class PTYManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.ptyProcess = null;
    this.state = ProcessState.IDLE;
    this.platform = os.platform();
    this.exitCode = null;
    this.bufferData = true;
    this.dataBuffer = [];
    this.maxBufferSize = options.maxBufferSize || 1024 * 1024; // 1MB
    this.currentBufferSize = 0;
  }
  
  // PTY 프로세스 생성
  async spawn(command, args = [], spawnOptions = {}) {
    if (this.state === ProcessState.RUNNING) {
      throw new Error('PTY process is already running');
    }
    
    this.state = ProcessState.STARTING;
    this.emit('stateChange', this.state);
    
    try {
      const mergedOptions = { ...this.options, ...spawnOptions };
      
      // Windows 특별 처리
      if (this.platform === 'win32') {
        mergedOptions.useConpty = true;
        mergedOptions.conptyInheritCursor = false;
        
        // Windows에서 cmd 실행 파일 확장자 처리
        if (command.endsWith('.cmd') || command.endsWith('.bat')) {
          // cmd.exe를 통해 실행
          args = ['/c', command, ...args];
          command = 'cmd.exe';
        }
      }
      
      // PTY 프로세스 생성
      this.ptyProcess = pty.spawn(command, args, mergedOptions);
      
      // 이벤트 핸들러 설정
      this.setupEventHandlers();
      
      this.state = ProcessState.RUNNING;
      this.emit('stateChange', this.state);
      this.emit('spawned', {
        pid: this.ptyProcess.pid,
        command,
        args
      });
      
      return this.ptyProcess;
    } catch (error) {
      this.state = ProcessState.ERROR;
      this.emit('stateChange', this.state);
      this.emit('error', error);
      throw error;
    }
  }
  
  // 이벤트 핸들러 설정
  setupEventHandlers() {
    if (!this.ptyProcess) return;
    
    // 데이터 수신
    this.ptyProcess.onData((data) => {
      if (this.bufferData) {
        this.addToBuffer(data);
      }
      this.emit('data', data);
    });
    
    // 프로세스 종료
    this.ptyProcess.onExit((exitCode) => {
      this.exitCode = exitCode;
      this.state = ProcessState.STOPPED;
      this.emit('stateChange', this.state);
      this.emit('exit', exitCode);
      this.cleanup();
    });
  }
  
  // 데이터 버퍼링
  addToBuffer(data) {
    const dataSize = Buffer.byteLength(data);
    
    // 버퍼 크기 체크
    if (this.currentBufferSize + dataSize > this.maxBufferSize) {
      // 오래된 데이터 제거
      while (this.currentBufferSize + dataSize > this.maxBufferSize && this.dataBuffer.length > 0) {
        const removed = this.dataBuffer.shift();
        this.currentBufferSize -= Buffer.byteLength(removed);
      }
    }
    
    this.dataBuffer.push(data);
    this.currentBufferSize += dataSize;
  }
  
  // 버퍼 가져오기
  getBuffer() {
    return this.dataBuffer.join('');
  }
  
  // 버퍼 클리어
  clearBuffer() {
    this.dataBuffer = [];
    this.currentBufferSize = 0;
  }
  
  // 데이터 전송
  write(data) {
    if (!this.ptyProcess || this.state !== ProcessState.RUNNING) {
      throw new Error('PTY process is not running');
    }
    
    try {
      this.ptyProcess.write(data);
      this.emit('write', data);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  // 크기 조정
  resize(cols, rows) {
    if (!this.ptyProcess || this.state !== ProcessState.RUNNING) {
      // 실행 중이 아니어도 옵션은 업데이트
      this.options.cols = cols;
      this.options.rows = rows;
      return;
    }
    
    try {
      this.ptyProcess.resize(cols, rows);
      this.options.cols = cols;
      this.options.rows = rows;
      this.emit('resize', { cols, rows });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  // 프로세스 종료
  async kill(signal = 'SIGTERM') {
    if (!this.ptyProcess || this.state !== ProcessState.RUNNING) {
      return;
    }
    
    this.state = ProcessState.STOPPING;
    this.emit('stateChange', this.state);
    
    try {
      if (this.platform === 'win32') {
        // Windows는 signal을 지원하지 않음
        this.ptyProcess.kill();
      } else {
        this.ptyProcess.kill(signal);
      }
      
      // 종료 대기 (최대 5초)
      await this.waitForExit(5000);
    } catch (error) {
      // 강제 종료
      try {
        this.ptyProcess.kill();
      } catch (e) {
        // 이미 종료됨
      }
    }
  }
  
  // 종료 대기
  waitForExit(timeout = 0) {
    return new Promise((resolve, reject) => {
      if (this.state === ProcessState.STOPPED) {
        resolve(this.exitCode);
        return;
      }
      
      let timeoutId;
      
      const exitHandler = (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(code);
      };
      
      this.once('exit', exitHandler);
      
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          this.removeListener('exit', exitHandler);
          reject(new Error('Process exit timeout'));
        }, timeout);
      }
    });
  }
  
  // 정리
  cleanup() {
    if (this.ptyProcess) {
      try {
        if (!this.ptyProcess.killed) {
          this.ptyProcess.kill();
        }
      } catch (error) {
        // 무시
      }
      this.ptyProcess = null;
    }
    this.clearBuffer();
  }
  
  // 상태 확인
  isRunning() {
    return this.state === ProcessState.RUNNING && this.ptyProcess && !this.ptyProcess.killed;
  }
  
  // PID 가져오기
  getPid() {
    return this.ptyProcess ? this.ptyProcess.pid : null;
  }
  
  // 프로세스 정보
  getInfo() {
    return {
      state: this.state,
      pid: this.getPid(),
      exitCode: this.exitCode,
      cols: this.options.cols,
      rows: this.options.rows,
      platform: this.platform,
      bufferSize: this.currentBufferSize
    };
  }
}

// Windows ConPTY 특화 매니저
class WindowsPTYManager extends PTYManager {
  constructor(options = {}) {
    super({
      ...options,
      useConpty: true,
      conptyInheritCursor: false
    });
  }
  
  // Windows 전용 명령 처리
  async spawnPowerShell(script, options = {}) {
    return this.spawn('powershell.exe', ['-Command', script], options);
  }
  
  async spawnCmd(command, options = {}) {
    return this.spawn('cmd.exe', ['/c', command], options);
  }
  
  async spawnWSL(distribution = '', command = '', options = {}) {
    const args = [];
    if (distribution) {
      args.push('-d', distribution);
    }
    if (command) {
      args.push('-e', command);
    }
    return this.spawn('wsl.exe', args, options);
  }
}

// Unix PTY 특화 매니저
class UnixPTYManager extends PTYManager {
  constructor(options = {}) {
    super({
      ...options,
      term: options.term || 'xterm-256color'
    });
  }
  
  // Unix 전용 처리
  async spawnBash(script, options = {}) {
    return this.spawn('/bin/bash', script ? ['-c', script] : [], options);
  }
  
  async spawnSh(script, options = {}) {
    return this.spawn('/bin/sh', script ? ['-c', script] : [], options);
  }
  
  async spawnZsh(script, options = {}) {
    return this.spawn('/bin/zsh', script ? ['-c', script] : [], options);
  }
}

// 플랫폼별 매니저 팩토리
function createPTYManager(options = {}) {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return new WindowsPTYManager(options);
  } else {
    return new UnixPTYManager(options);
  }
}

module.exports = {
  ProcessState,
  PTYManager,
  WindowsPTYManager,
  UnixPTYManager,
  createPTYManager
};