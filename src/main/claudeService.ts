import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ClaudeServiceOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export class ClaudeService extends EventEmitter {
  private claudeProcess: ChildProcess | null = null;
  private isInitialized = false;
  private messageBuffer = '';
  
  constructor(private options: ClaudeServiceOptions = {}) {
    super();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const claudeCommand = process.platform === 'win32' ? 'claude.exe' : 'claude';
      
      this.claudeProcess = spawn(claudeCommand, ['chat'], {
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: this.options.apiKey || process.env.ANTHROPIC_API_KEY,
        },
        shell: true,
      });

      this.claudeProcess.stdout?.on('data', (data) => {
        const message = data.toString();
        this.messageBuffer += message;
        
        if (this.isCompleteMessage(message)) {
          this.emit('message', {
            role: 'assistant',
            content: this.messageBuffer.trim(),
            timestamp: new Date(),
          });
          this.messageBuffer = '';
        }
      });

      this.claudeProcess.stderr?.on('data', (data) => {
        this.emit('error', data.toString());
      });

      this.claudeProcess.on('close', (code) => {
        this.emit('close', code);
        this.isInitialized = false;
      });

      this.isInitialized = true;
      this.emit('ready');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.isInitialized || !this.claudeProcess) {
      throw new Error('Claude service not initialized');
    }

    this.claudeProcess.stdin?.write(message + '\n');
    
    this.emit('message', {
      role: 'user',
      content: message,
      timestamp: new Date(),
    });
  }

  private isCompleteMessage(message: string): boolean {
    return message.includes('\n\n') || message.includes('Human:') || message.includes('Assistant:');
  }

  async stop(): Promise<void> {
    if (this.claudeProcess) {
      this.claudeProcess.kill();
      this.claudeProcess = null;
      this.isInitialized = false;
    }
  }

  isRunning(): boolean {
    return this.isInitialized && this.claudeProcess !== null;
  }
}