const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class ClaudeService extends EventEmitter {
  constructor() {
    super();
    this.isReady = false;
    this.messages = [];
    this.claudeProcess = null;
    this.outputBuffer = '';
    this.isProcessing = false;
  }

  async initialize() {
    try {
      // Windows에서 ConPTY를 사용하여 TTY 환경 생성
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      // Windows ConPTY를 활용한 인터랙티브 모드
      if (process.platform === 'win32') {
        // Windows에서 ConPTY 사용
        this.claudeProcess = spawn('cmd.exe', ['/c', claudeCmd], {
          shell: false,
          windowsHide: true,
          env: { ...process.env, FORCE_COLOR: '0' },
          stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
          windowsVerbatimArguments: true
        });
      } else {
        // Unix 계열에서는 pty 옵션 사용
        this.claudeProcess = spawn(claudeCmd, [], {
          shell: false,
          env: { ...process.env, TERM: 'xterm-256color' },
          stdio: ['pipe', 'pipe', 'pipe']
        });
      }

      this.claudeProcess.stdout.on('data', (data) => {
        const output = data.toString();
        this.outputBuffer += output;
        
        // ANSI 이스케이프 코드 제거
        const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
        
        // 줄 단위로 처리
        if (this.outputBuffer.includes('\n')) {
          const lines = this.outputBuffer.split('\n');
          this.outputBuffer = lines.pop(); // 불완전한 줄은 버퍼에 유지
          
          lines.forEach(line => {
            const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
            if (cleanLine && !cleanLine.includes('Human:') && !cleanLine.includes('Assistant:')) {
              const assistantMessage = {
                role: 'assistant',
                content: cleanLine,
                timestamp: new Date()
              };
              this.messages.push(assistantMessage);
              this.emit('message', assistantMessage);
            }
          });
        }
      });

      this.claudeProcess.stderr.on('data', (data) => {
        const error = data.toString();
        // Windows 인코딩 문제로 인한 깨진 문자 무시
        if (!error.includes('�')) {
          console.error('Claude stderr:', error);
          this.emit('error', error);
        }
      });

      this.claudeProcess.on('error', (error) => {
        console.error('Failed to start Claude:', error);
        this.emit('error', `Failed to start Claude: ${error.message}`);
      });

      this.claudeProcess.on('close', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`Claude process exited with code ${code}`);
          this.emit('error', `Claude process exited with code ${code}`);
        }
        this.isReady = false;
      });

      // 프로세스가 준비될 때까지 대기
      await new Promise((resolve) => {
        setTimeout(() => {
          this.isReady = true;
          this.emit('ready');
          console.log('Claude service initialized with TTY emulation');
          resolve();
        }, 1000);
      });
    } catch (error) {
      console.error('Failed to initialize Claude:', error);
      this.emit('error', 'Failed to initialize Claude service');
      throw error;
    }
  }

  async sendMessage(message) {
    if (!this.isReady || !this.claudeProcess) {
      throw new Error('Claude service not initialized');
    }

    try {
      this.isProcessing = true;
      
      // 사용자 메시지 히스토리에 추가
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

      // Claude 프로세스에 메시지 전송
      this.claudeProcess.stdin.write(message + '\r\n');
      
      // 응답 처리를 위한 지연
      setTimeout(() => {
        this.isProcessing = false;
        // 남은 버퍼 처리
        if (this.outputBuffer.trim()) {
          const cleanOutput = this.outputBuffer.replace(/\x1b\[[0-9;]*m/g, '').trim();
          if (cleanOutput) {
            const assistantMessage = {
              role: 'assistant',
              content: cleanOutput,
              timestamp: new Date()
            };
            this.messages.push(assistantMessage);
            this.emit('message', assistantMessage);
            this.outputBuffer = '';
          }
        }
      }, 3000);
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error.message);
      this.isProcessing = false;
      throw error;
    }
  }

  async stop() {
    this.isReady = false;
    this.messages = [];
    if (this.claudeProcess) {
      this.claudeProcess.kill();
      this.claudeProcess = null;
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