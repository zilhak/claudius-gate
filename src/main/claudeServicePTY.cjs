const { EventEmitter } = require('events');
const pty = require('node-pty');
const os = require('os');

class ClaudeService extends EventEmitter {
  constructor() {
    super();
    this.isReady = false;
    this.messages = [];
    this.ptyProcess = null;
    this.outputBuffer = '';
    this.isWaitingForResponse = false;
  }

  async initialize() {
    try {
      // Windows에서는 powershell 또는 cmd를 통해 실행
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
      const shellArgs = process.platform === 'win32' ? [] : ['-l'];
      
      // PTY 프로세스 생성
      this.ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: process.env
      });

      // 출력 처리
      this.ptyProcess.onData((data) => {
        // ANSI 이스케이프 코드 제거
        const cleanData = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
        this.outputBuffer += cleanData;
        
        // 응답이 완료되었는지 확인
        if (this.isWaitingForResponse) {
          // 프롬프트가 다시 나타나면 응답 완료
          if (cleanData.includes('Human:') || cleanData.includes('Assistant:') || cleanData.includes('>')) {
            this.processResponse();
          }
        }
      });

      this.ptyProcess.onExit((exitCode) => {
        console.log(`PTY process exited with code ${exitCode.exitCode}`);
        this.isReady = false;
        this.emit('error', `PTY process exited with code ${exitCode.exitCode}`);
      });

      // Claude 실행
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          this.ptyProcess.write('claude\r');
          setTimeout(() => {
            this.isReady = true;
            this.outputBuffer = ''; // 초기 출력 버퍼 클리어
            this.emit('ready');
            console.log('Claude service initialized with PTY');
            resolve();
          }, 2000);
        }, 500);
      });
    } catch (error) {
      console.error('Failed to initialize Claude:', error);
      this.emit('error', 'Failed to initialize Claude service');
      throw error;
    }
  }

  processResponse() {
    if (this.outputBuffer.trim()) {
      // 프롬프트와 명령어 제거
      let cleanOutput = this.outputBuffer
        .replace(/Human:.*$/m, '')
        .replace(/Assistant:.*$/m, '')
        .replace(/^.*claude.*$/m, '')
        .replace(/PS.*>.*$/gm, '')
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
    this.outputBuffer = '';
    this.isWaitingForResponse = false;
  }

  async sendMessage(message) {
    if (!this.isReady || !this.ptyProcess) {
      throw new Error('Claude service not initialized');
    }

    try {
      // 사용자 메시지 추가
      this.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });
      
      // 사용자 메시지 이벤트 발생
      this.emit('message', {
        role: 'user',
        content: message,
        timestamp: new Date()
      });

      // Claude에 메시지 전송
      this.outputBuffer = '';
      this.isWaitingForResponse = true;
      this.ptyProcess.write(message + '\r');
      
      // 타임아웃 설정
      setTimeout(() => {
        if (this.isWaitingForResponse) {
          this.processResponse();
        }
      }, 5000);
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error.message);
      this.isWaitingForResponse = false;
      throw error;
    }
  }

  async stop() {
    this.isReady = false;
    this.messages = [];
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
    console.log('Claude service stopped');
  }

  isRunning() {
    return this.isReady;
  }

  getHistory() {
    return this.messages;
  }
}

module.exports = { ClaudeService };