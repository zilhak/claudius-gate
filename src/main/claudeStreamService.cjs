// Claude Stream Service with JSON streaming and permission bypass
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

class ClaudeStreamService extends EventEmitter {
  constructor() {
    super();
    this.isReady = false;
    this.messages = [];
    this.currentProcess = null;
    this.streamBuffer = '';
    this.bypassPermissions = true; // 기본적으로 권한 우회
    this.outputFormat = 'stream-json'; // stream-json 형식 사용
    this.currentTokenUsage = {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0
    };
  }

  async initialize() {
    try {
      // Claude CLI 테스트
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      const testProcess = spawn(claudeCmd, ['--version'], {
        shell: true,
        windowsHide: true
      });
      
      await new Promise((resolve, reject) => {
        testProcess.on('close', (code) => {
          if (code === 0) {
            this.isReady = true;
            this.emit('ready');
            console.log('Claude stream service initialized');
            resolve();
          } else {
            reject(new Error('Claude CLI not available'));
          }
        });
        
        testProcess.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error('Failed to initialize Claude:', error);
      this.emit('error', 'Failed to initialize Claude service');
      throw error;
    }
  }

  async sendMessage(message) {
    if (!this.isReady) {
      throw new Error('Claude service not initialized');
    }

    try {
      // 사용자 메시지 추가
      this.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });
      
      // 사용자 메시지 이벤트
      this.emit('message', {
        role: 'user',
        content: message,
        timestamp: new Date()
      });

      // Stream 데이터 이벤트
      this.emit('stream', {
        type: 'user_message',
        content: message
      });

      // Claude 실행 (print 모드는 stream-json과 호환 안됨, 일반 모드 사용)
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      const args = [
        '--print'
      ];
      
      // 권한 우회 옵션
      if (this.bypassPermissions) {
        args.push('--dangerously-skip-permissions');
      }
      
      this.currentProcess = spawn(claudeCmd, args, {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env },
        windowsHide: true
      });

      // stdout을 readline으로 처리 (JSON 라인별 파싱)
      const rl = readline.createInterface({
        input: this.currentProcess.stdout,
        crlfDelay: Infinity
      });

      let fullResponse = '';
      let isThinking = false;
      let currentTool = null;

      rl.on('line', (line) => {
        try {
          // JSON 파싱
          const data = JSON.parse(line);
          
          // 스트림 이벤트 발생
          this.emit('stream', data);
          
          // 타입별 처리
          switch (data.type) {
            case 'thinking':
              isThinking = true;
              this.emit('thinking', {
                content: data.content || 'Claude is thinking...',
                timestamp: new Date()
              });
              break;
              
            case 'tool_use':
              currentTool = data;
              this.emit('tool_use', {
                tool_name: data.tool_name,
                parameters: data.parameters,
                timestamp: new Date()
              });
              break;
              
            case 'tool_result':
              if (currentTool) {
                this.emit('tool_result', {
                  tool_name: currentTool.tool_name,
                  result: data.result,
                  timestamp: new Date()
                });
                currentTool = null;
              }
              break;
              
            case 'permission_request':
              // 권한 요청 (bypass 모드에서는 자동 승인)
              this.emit('permission_request', {
                permission: data.permission,
                tool: data.tool,
                auto_approved: this.bypassPermissions,
                timestamp: new Date()
              });
              break;
              
            case 'content':
              // 실제 응답 내용
              if (data.text) {
                fullResponse += data.text;
                this.emit('partial', {
                  role: 'assistant',
                  content: data.text,
                  timestamp: new Date()
                });
              }
              break;
              
            case 'token_usage':
              // 토큰 사용량 업데이트
              this.currentTokenUsage = {
                input_tokens: data.input_tokens || 0,
                output_tokens: data.output_tokens || 0,
                total_tokens: (data.input_tokens || 0) + (data.output_tokens || 0)
              };
              this.emit('token_usage', this.currentTokenUsage);
              break;
              
            case 'error':
              this.emit('error', data.message || 'Unknown error');
              break;
              
            case 'done':
              // 응답 완료
              isThinking = false;
              break;
              
            default:
              // 기타 이벤트
              this.emit('debug', data);
          }
        } catch (parseError) {
          // JSON이 아닌 일반 텍스트일 수 있음
          if (line.trim()) {
            fullResponse += line + '\n';
            this.emit('partial', {
              role: 'assistant',
              content: line + '\n',
              timestamp: new Date()
            });
          }
        }
      });

      // stderr 처리
      this.currentProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error('Claude stderr:', error);
        
        // 권한 관련 에러 체크
        if (error.includes('permission') || error.includes('denied')) {
          this.emit('permission_error', {
            message: error,
            hint: 'Consider enabling bypass permissions mode'
          });
        } else {
          this.emit('error', error);
        }
      });

      // 프로세스 종료 처리
      this.currentProcess.on('close', (code) => {
        if (code === 0 && fullResponse.trim()) {
          const assistantMessage = {
            role: 'assistant',
            content: fullResponse.trim(),
            timestamp: new Date(),
            tokens: this.currentTokenUsage
          };
          this.messages.push(assistantMessage);
          this.emit('message', assistantMessage);
          
          // 최종 토큰 사용량
          this.emit('final_token_usage', this.currentTokenUsage);
        } else if (code !== 0) {
          this.emit('error', `Claude process exited with code ${code}`);
        }
        
        this.currentProcess = null;
        this.emit('done');
      });

      this.currentProcess.on('error', (error) => {
        console.error('Failed to execute Claude:', error);
        this.emit('error', `Failed to execute Claude: ${error.message}`);
        this.currentProcess = null;
      });

      // 메시지 전송
      this.currentProcess.stdin.write(message);
      this.currentProcess.stdin.end();
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error.message);
      throw error;
    }
  }

  // 권한 우회 모드 설정
  setBypassPermissions(bypass) {
    this.bypassPermissions = bypass;
    this.emit('settings_changed', {
      bypassPermissions: bypass
    });
  }

  // 현재 설정 가져오기
  getSettings() {
    return {
      bypassPermissions: this.bypassPermissions,
      outputFormat: this.outputFormat
    };
  }

  // 토큰 사용량 가져오기
  getTokenUsage() {
    return this.currentTokenUsage;
  }

  async stop() {
    this.isReady = false;
    this.messages = [];
    
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    
    console.log('Claude stream service stopped');
  }

  isRunning() {
    return this.isReady;
  }

  getHistory() {
    return this.messages;
  }
}

// 인터랙티브 모드 서비스 (stream-json 지원)
class ClaudeInteractiveStreamService extends EventEmitter {
  constructor() {
    super();
    this.isReady = false;
    this.messages = [];
    this.claudeProcess = null;
    this.bypassPermissions = true;
    this.rl = null;
    this.tokenUsage = {
      session_total: 0,
      current_input: 0,
      current_output: 0
    };
  }

  async initialize() {
    try {
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      // 인터랙티브 모드로 실행 (stream output)
      const args = [
        '--output-format', 'stream-json',
        '--input-format', 'stream-json'
      ];
      
      if (this.bypassPermissions) {
        args.push('--dangerously-skip-permissions');
      }
      
      this.claudeProcess = spawn(claudeCmd, args, {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env },
        windowsHide: true
      });
      
      // readline 인터페이스 생성
      this.rl = readline.createInterface({
        input: this.claudeProcess.stdout,
        crlfDelay: Infinity
      });
      
      // 출력 처리
      this.rl.on('line', (line) => {
        this.handleStreamLine(line);
      });
      
      // stderr 처리
      this.claudeProcess.stderr.on('data', (data) => {
        console.error('Claude stderr:', data.toString());
      });
      
      // 프로세스 종료 처리
      this.claudeProcess.on('close', (code) => {
        console.log(`Claude process exited with code ${code}`);
        this.isReady = false;
        this.emit('closed', code);
      });
      
      this.claudeProcess.on('error', (error) => {
        console.error('Claude process error:', error);
        this.emit('error', error);
      });
      
      // 초기화 완료 대기
      await new Promise((resolve) => {
        setTimeout(() => {
          this.isReady = true;
          this.emit('ready');
          console.log('Claude interactive stream service initialized');
          resolve();
        }, 1000);
      });
      
    } catch (error) {
      console.error('Failed to initialize Claude:', error);
      this.emit('error', error);
      throw error;
    }
  }
  
  handleStreamLine(line) {
    try {
      const data = JSON.parse(line);
      
      // 모든 스트림 데이터 이벤트
      this.emit('stream', data);
      
      // 타입별 이벤트
      switch (data.type) {
        case 'thinking':
          this.emit('thinking', data);
          break;
        case 'tool_use':
          this.emit('tool_use', data);
          break;
        case 'content':
          this.emit('content', data);
          break;
        case 'token_usage':
          this.updateTokenUsage(data);
          break;
        case 'error':
          this.emit('error', data);
          break;
      }
    } catch (error) {
      // JSON이 아닌 경우 일반 텍스트로 처리
      if (line.trim()) {
        this.emit('text', line);
      }
    }
  }
  
  updateTokenUsage(data) {
    this.tokenUsage.current_input = data.input_tokens || 0;
    this.tokenUsage.current_output = data.output_tokens || 0;
    this.tokenUsage.session_total += (data.input_tokens || 0) + (data.output_tokens || 0);
    this.emit('token_usage', this.tokenUsage);
  }
  
  async sendMessage(message) {
    if (!this.isReady || !this.claudeProcess) {
      throw new Error('Claude service not ready');
    }
    
    try {
      // Stream JSON 형식으로 메시지 전송
      const input = JSON.stringify({
        type: 'user_message',
        content: message
      }) + '\n';
      
      this.claudeProcess.stdin.write(input);
      
      // 사용자 메시지 기록
      this.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });
      
      this.emit('message', {
        role: 'user',
        content: message
      });
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error);
      throw error;
    }
  }
  
  async stop() {
    if (this.claudeProcess) {
      this.claudeProcess.kill();
      this.claudeProcess = null;
    }
    
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    
    this.isReady = false;
    console.log('Claude interactive stream service stopped');
  }
}

module.exports = { 
  ClaudeStreamService,
  ClaudeInteractiveStreamService
};