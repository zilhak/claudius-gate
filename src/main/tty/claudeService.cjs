// Integrated Claude Service with TTY Support
// 모든 TTY 모듈을 통합한 Claude 서비스

const { EventEmitter } = require('events');
const { createPTYManager } = require('./process/ptyManager.cjs');
const { MainProcessBridge } = require('./process/ipcBridge.cjs');
const { BinaryDecoder } = require('./receiver/binaryDecoder.cjs');
const { OutputProcessor } = require('./receiver/outputProcessor.cjs');
const { InputEncoder } = require('./sender/inputEncoder.cjs');
const os = require('os');
const path = require('path');

// Claude 서비스 상태
const ServiceState = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  READY: 'ready',
  PROCESSING: 'processing',
  ERROR: 'error',
  TERMINATED: 'terminated'
};

class ClaudeService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 기본 설정
    this.options = {
      cols: options.cols || 120,
      rows: options.rows || 40,
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      mode: options.mode || 'interactive', // 'interactive' or 'print'
      platform: os.platform(),
      ...options
    };
    
    // 상태
    this.state = ServiceState.IDLE;
    this.sessionId = this.generateSessionId();
    
    // 컴포넌트
    this.ptyManager = null;
    this.ipcBridge = null;
    this.decoder = null;
    this.outputProcessor = null;
    this.inputEncoder = null;
    
    // 대화 히스토리
    this.messages = [];
    this.currentResponse = '';
    this.isWaitingForResponse = false;
    
    // 프롬프트 패턴
    this.promptPatterns = [
      /Human:\s*$/,
      />\s*$/,
      /Assistant:\s*$/
    ];
  }
  
  // 세션 ID 생성
  generateSessionId() {
    return `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // 초기화
  async initialize() {
    if (this.state !== ServiceState.IDLE) {
      throw new Error('Service is already initialized');
    }
    
    this.state = ServiceState.INITIALIZING;
    this.emit('stateChange', this.state);
    
    try {
      // PTY 매니저 생성
      this.ptyManager = createPTYManager({
        cols: this.options.cols,
        rows: this.options.rows,
        cwd: this.options.cwd,
        env: this.options.env
      });
      
      // IPC 브리지 설정 (Electron 환경인 경우)
      if (this.options.useIPC) {
        this.ipcBridge = new MainProcessBridge();
        this.ipcBridge.registerSession(this.sessionId, this.ptyManager, this.options.webContents);
      }
      
      // 디코더 설정
      this.decoder = new BinaryDecoder({
        mode: 'utf8'
      });
      
      // 출력 프로세서 설정
      this.outputProcessor = new OutputProcessor({
        cols: this.options.cols,
        rows: this.options.rows
      });
      
      // 입력 인코더 설정
      this.inputEncoder = new InputEncoder({
        platform: this.options.platform,
        applicationMode: false,
        bracketedPaste: false
      });
      
      // 이벤트 핸들러 설정
      this.setupEventHandlers();
      
      // Claude 프로세스 시작
      await this.startClaude();
      
      this.state = ServiceState.READY;
      this.emit('stateChange', this.state);
      this.emit('ready');
      
      return true;
    } catch (error) {
      this.state = ServiceState.ERROR;
      this.emit('stateChange', this.state);
      this.emit('error', error);
      throw error;
    }
  }
  
  // Claude 프로세스 시작
  async startClaude() {
    const claudeCmd = this.options.platform === 'win32' ? 'claude.cmd' : 'claude';
    const args = [];
    
    // 모드에 따른 인자 설정
    if (this.options.mode === 'print') {
      args.push('--print');
    }
    
    // PTY 프로세스 생성
    await this.ptyManager.spawn(claudeCmd, args, {
      name: 'xterm-256color',
      cwd: this.options.cwd,
      env: {
        ...this.options.env,
        FORCE_COLOR: '1',
        TERM: 'xterm-256color'
      }
    });
    
    // 초기화 대기
    if (this.options.mode === 'interactive') {
      await this.waitForPrompt();
    }
  }
  
  // 이벤트 핸들러 설정
  setupEventHandlers() {
    // PTY 데이터 수신
    this.ptyManager.on('data', (data) => {
      this.handleRawData(data);
    });
    
    // PTY 종료
    this.ptyManager.on('exit', (exitCode) => {
      this.handleExit(exitCode);
    });
    
    // PTY 에러
    this.ptyManager.on('error', (error) => {
      this.handleError(error);
    });
    
    // 출력 프로세서 이벤트
    this.outputProcessor.on('update', (update) => {
      this.emit('terminalUpdate', update);
    });
    
    this.outputProcessor.on('title', (title) => {
      this.emit('title', title);
    });
  }
  
  // Raw 데이터 처리
  handleRawData(data) {
    // 바이너리 디코딩
    const decoded = this.decoder.decodeFromIPC(data);
    if (!decoded) return;
    
    // ANSI 파싱 및 처리
    this.outputProcessor.process(decoded.text);
    
    // 응답 수집
    if (this.isWaitingForResponse) {
      this.currentResponse += decoded.text;
      
      // 프롬프트 감지
      if (this.detectPrompt(decoded.text)) {
        this.processResponse();
      }
      
      // 스트리밍 이벤트
      this.emit('stream', decoded.text);
    }
    
    // Raw 데이터 이벤트
    this.emit('rawData', data);
  }
  
  // 프롬프트 감지
  detectPrompt(text) {
    return this.promptPatterns.some(pattern => pattern.test(text));
  }
  
  // 응답 처리
  processResponse() {
    if (this.currentResponse.trim()) {
      // 프롬프트 제거
      let cleanResponse = this.currentResponse;
      for (const pattern of this.promptPatterns) {
        cleanResponse = cleanResponse.replace(pattern, '');
      }
      cleanResponse = cleanResponse.trim();
      
      if (cleanResponse) {
        // 어시스턴트 메시지 추가
        const message = {
          role: 'assistant',
          content: cleanResponse,
          timestamp: new Date()
        };
        this.messages.push(message);
        this.emit('message', message);
      }
    }
    
    this.currentResponse = '';
    this.isWaitingForResponse = false;
    this.state = ServiceState.READY;
    this.emit('stateChange', this.state);
  }
  
  // 프롬프트 대기
  async waitForPrompt(timeout = 5000) {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let timeoutId;
      
      const dataHandler = (data) => {
        buffer += data;
        if (this.detectPrompt(buffer)) {
          clearTimeout(timeoutId);
          this.ptyManager.removeListener('data', dataHandler);
          resolve();
        }
      };
      
      this.ptyManager.on('data', dataHandler);
      
      timeoutId = setTimeout(() => {
        this.ptyManager.removeListener('data', dataHandler);
        resolve(); // 타임아웃되어도 계속 진행
      }, timeout);
    });
  }
  
  // 메시지 전송
  async sendMessage(message) {
    if (this.state !== ServiceState.READY) {
      throw new Error('Service is not ready');
    }
    
    this.state = ServiceState.PROCESSING;
    this.emit('stateChange', this.state);
    
    try {
      // 사용자 메시지 추가
      const userMessage = {
        role: 'user',
        content: message,
        timestamp: new Date()
      };
      this.messages.push(userMessage);
      this.emit('message', userMessage);
      
      // 응답 대기 설정
      this.currentResponse = '';
      this.isWaitingForResponse = true;
      
      // 메시지 인코딩 및 전송
      const encoded = this.inputEncoder.encode(message, 'text');
      const lineEnding = this.inputEncoder.encodeNewline(this.options.platform);
      
      this.ptyManager.write(encoded + lineEnding);
      
      // Print 모드에서는 즉시 종료
      if (this.options.mode === 'print') {
        // stdin 종료
        if (this.options.platform === 'win32') {
          this.ptyManager.write('\x1a'); // Ctrl+Z
        } else {
          this.ptyManager.write('\x04'); // Ctrl+D
        }
      }
      
      return true;
    } catch (error) {
      this.state = ServiceState.ERROR;
      this.emit('stateChange', this.state);
      this.emit('error', error);
      throw error;
    }
  }
  
  // 특수 키 전송
  sendKey(key) {
    if (!this.ptyManager || !this.ptyManager.isRunning()) {
      throw new Error('PTY is not running');
    }
    
    const encoded = this.inputEncoder.encodeKey(key);
    this.ptyManager.write(encoded);
  }
  
  // 터미널 크기 조정
  resize(cols, rows) {
    this.options.cols = cols;
    this.options.rows = rows;
    
    if (this.ptyManager) {
      this.ptyManager.resize(cols, rows);
    }
    
    if (this.outputProcessor) {
      this.outputProcessor.resize(cols, rows);
    }
    
    this.emit('resize', { cols, rows });
  }
  
  // 화면 가져오기
  getScreen() {
    if (this.outputProcessor) {
      return this.outputProcessor.getScreen();
    }
    return null;
  }
  
  // 히스토리 가져오기
  getHistory() {
    return this.messages;
  }
  
  // 버퍼 클리어
  clearBuffer() {
    if (this.ptyManager) {
      this.ptyManager.clearBuffer();
    }
    if (this.outputProcessor) {
      this.outputProcessor.reset();
    }
    this.currentResponse = '';
  }
  
  // 종료 처리
  handleExit(exitCode) {
    this.state = ServiceState.TERMINATED;
    this.emit('stateChange', this.state);
    this.emit('exit', exitCode);
    
    // Print 모드에서 마지막 응답 처리
    if (this.options.mode === 'print' && this.isWaitingForResponse) {
      this.processResponse();
    }
  }
  
  // 에러 처리
  handleError(error) {
    this.state = ServiceState.ERROR;
    this.emit('stateChange', this.state);
    this.emit('error', error);
  }
  
  // 서비스 중지
  async stop() {
    if (this.ptyManager) {
      await this.ptyManager.kill();
    }
    
    if (this.ipcBridge) {
      this.ipcBridge.cleanupSession(this.sessionId);
    }
    
    this.state = ServiceState.TERMINATED;
    this.emit('stateChange', this.state);
    this.emit('stopped');
  }
  
  // 상태 확인
  isRunning() {
    return this.ptyManager && this.ptyManager.isRunning();
  }
  
  getState() {
    return this.state;
  }
  
  getInfo() {
    return {
      sessionId: this.sessionId,
      state: this.state,
      mode: this.options.mode,
      platform: this.options.platform,
      cols: this.options.cols,
      rows: this.options.rows,
      messageCount: this.messages.length,
      isWaitingForResponse: this.isWaitingForResponse
    };
  }
}

// Print 모드 전용 서비스 (간단한 버전)
class ClaudePrintService extends ClaudeService {
  constructor(options = {}) {
    super({
      ...options,
      mode: 'print'
    });
  }
  
  async sendMessage(message) {
    // 매번 새 프로세스 생성
    await this.initialize();
    const result = await super.sendMessage(message);
    
    // 응답 대기
    await this.waitForExit();
    
    return result;
  }
  
  async waitForExit() {
    if (this.ptyManager) {
      await this.ptyManager.waitForExit(30000); // 30초 타임아웃
    }
  }
}

module.exports = {
  ServiceState,
  ClaudeService,
  ClaudePrintService
};