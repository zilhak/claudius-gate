const { EventEmitter } = require('events');
const pty = require('node-pty');
const os = require('os');
const path = require('path');

class ClaudeService extends EventEmitter {
  constructor() {
    super();
    this.isReady = false;
    this.messages = [];
    this.ptyProcess = null;
    this.outputBuffer = '';
    this.isWaitingForPrompt = false;
    this.currentResponseBuffer = '';
  }

  async initialize() {
    try {
      // Windows에서는 claude.cmd를 직접 실행
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      // ConPTY를 사용하여 진짜 TTY 환경 생성
      this.ptyProcess = pty.spawn(claudeCmd, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: process.cwd(),
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          TERM: 'xterm-256color'
        },
        useConpty: process.platform === 'win32', // Windows에서 ConPTY 사용
        conptyInheritCursor: false
      });

      // 출력 처리
      this.ptyProcess.onData((data) => {
        // 디버깅용 raw 데이터 출력
        console.log('Raw output:', JSON.stringify(data));
        
        this.outputBuffer += data;
        
        // ANSI 이스케이프 코드 제거하여 깨끗한 텍스트 추출
        const cleanData = this.stripAnsi(data);
        
        // 프롬프트 감지 패턴들
        const promptPatterns = [
          /Human:\s*$/,
          />\s*$/,
          /Assistant:\s*$/,
          /\n\s*$/
        ];
        
        // 응답 수집 중일 때
        if (this.isWaitingForPrompt) {
          this.currentResponseBuffer += cleanData;
          
          // 프롬프트가 다시 나타나면 응답 완료
          if (promptPatterns.some(pattern => pattern.test(this.outputBuffer))) {
            this.processResponse();
          }
        }
        
        // 스트리밍 출력 (부분 응답)
        if (this.isWaitingForPrompt && cleanData.trim()) {
          this.emit('partial', {
            role: 'assistant',
            content: cleanData,
            timestamp: new Date()
          });
        }
      });

      this.ptyProcess.onExit((exitCode) => {
        console.log(`Claude PTY process exited with code ${exitCode.exitCode}`);
        this.isReady = false;
        this.emit('error', `Claude process exited`);
      });

      // Claude가 완전히 시작될 때까지 대기
      await new Promise((resolve, reject) => {
        let initBuffer = '';
        const initHandler = (data) => {
          initBuffer += data;
          // Claude가 준비되었다는 신호 감지
          if (initBuffer.includes('Human:') || initBuffer.includes('>') || initBuffer.includes('Welcome')) {
            this.ptyProcess.onData((data) => {
              this.handleData(data);
            });
            this.isReady = true;
            this.outputBuffer = ''; // 초기 출력 클리어
            this.emit('ready');
            console.log('Claude service initialized with proper PTY');
            resolve();
          }
        };
        
        this.ptyProcess.onData(initHandler);
        
        // 타임아웃 설정
        setTimeout(() => {
          if (!this.isReady) {
            // 준비 안 되어도 강제로 진행
            this.isReady = true;
            this.outputBuffer = '';
            this.emit('ready');
            console.log('Claude service initialized (timeout)');
            resolve();
          }
        }, 3000);
      });
      
    } catch (error) {
      console.error('Failed to initialize Claude:', error);
      this.emit('error', `Failed to initialize: ${error.message}`);
      throw error;
    }
  }

  stripAnsi(str) {
    // ANSI 이스케이프 코드 제거
    return str.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
              .replace(/\x1b\]0;[^\x07]*\x07/g, '') // 타이틀 시퀀스
              .replace(/\r/g, ''); // 캐리지 리턴
  }

  handleData(data) {
    const cleanData = this.stripAnsi(data);
    
    if (this.isWaitingForPrompt) {
      this.currentResponseBuffer += cleanData;
      
      // 스트리밍 출력
      if (cleanData.trim()) {
        this.emit('partial', {
          role: 'assistant',
          content: cleanData,
          timestamp: new Date()
        });
      }
    }
  }

  processResponse() {
    if (this.currentResponseBuffer.trim()) {
      // 프롬프트와 불필요한 부분 제거
      let cleanOutput = this.currentResponseBuffer
        .replace(/Human:\s*$/m, '')
        .replace(/Assistant:\s*$/m, '')
        .replace(/>\s*$/m, '')
        .trim();
      
      if (cleanOutput) {
        const assistantMessage = {
          role: 'assistant',
          content: cleanOutput,
          timestamp: new Date()
        };
        this.messages.push(assistantMessage);
        this.emit('message', assistantMessage);
      }
    }
    
    this.currentResponseBuffer = '';
    this.outputBuffer = '';
    this.isWaitingForPrompt = false;
  }

  async sendMessage(message) {
    if (!this.isReady || !this.ptyProcess) {
      throw new Error('Claude service not initialized');
    }

    try {
      // 사용자 메시지 추가
      const userMessage = {
        role: 'user',
        content: message,
        timestamp: new Date()
      };
      this.messages.push(userMessage);
      this.emit('message', userMessage);

      // 응답 대기 상태 설정
      this.currentResponseBuffer = '';
      this.outputBuffer = '';
      this.isWaitingForPrompt = true;

      // 메시지 전송 (Windows에서는 \r\n 사용)
      const lineEnding = process.platform === 'win32' ? '\r\n' : '\n';
      this.ptyProcess.write(message + lineEnding);
      
      // 타임아웃 설정 (응답이 너무 오래 걸리는 경우)
      setTimeout(() => {
        if (this.isWaitingForPrompt) {
          this.processResponse();
        }
      }, 30000); // 30초 타임아웃
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error.message);
      this.isWaitingForPrompt = false;
      throw error;
    }
  }

  async stop() {
    this.isReady = false;
    this.messages = [];
    
    if (this.ptyProcess) {
      // 우아한 종료 시도
      if (process.platform === 'win32') {
        this.ptyProcess.kill();
      } else {
        this.ptyProcess.kill('SIGTERM');
      }
      this.ptyProcess = null;
    }
    
    console.log('Claude service stopped');
  }

  isRunning() {
    return this.isReady && this.ptyProcess && !this.ptyProcess.killed;
  }

  getHistory() {
    return this.messages;
  }

  // 프로세스 정리를 위한 이벤트 핸들러
  cleanup() {
    if (this.ptyProcess && !this.ptyProcess.killed) {
      this.ptyProcess.kill();
    }
  }
}

// 프로세스 종료 시 정리
process.on('exit', () => {
  if (global.claudeService) {
    global.claudeService.cleanup();
  }
});

process.on('SIGINT', () => {
  if (global.claudeService) {
    global.claudeService.cleanup();
  }
  process.exit();
});

module.exports = { ClaudeService };