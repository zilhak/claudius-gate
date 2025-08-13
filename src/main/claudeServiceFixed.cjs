// Fixed Claude Service - Interactive mode with proper stream support
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

class ClaudeServiceFixed extends EventEmitter {
  constructor() {
    super();
    this.isReady = false;
    this.messages = [];
    this.claudeProcess = null;
    this.outputBuffer = '';
    this.isWaitingForResponse = false;
    this.bypassPermissions = true;
    this.currentTokens = {
      input: 0,
      output: 0,
      total: 0
    };
  }

  async initialize() {
    try {
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      // Interactive mode (no --print flag)
      const args = [];
      
      // Add permissions bypass
      if (this.bypassPermissions) {
        args.push('--dangerously-skip-permissions');
      }
      
      // Try verbose mode for more info
      args.push('--verbose');
      
      console.log('Starting Claude with args:', args);
      
      this.claudeProcess = spawn(claudeCmd, args, {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env },
        windowsHide: true
      });

      // Handle stdout
      this.claudeProcess.stdout.on('data', (data) => {
        const output = data.toString();
        this.handleOutput(output);
      });

      // Handle stderr
      this.claudeProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error('Claude stderr:', error);
        
        // Parse some common patterns
        if (error.includes('tokens')) {
          this.parseTokenInfo(error);
        }
        
        // Don't emit as error if it's just info
        if (!error.includes('[INFO]') && !error.includes('tokens')) {
          this.emit('error', error);
        }
      });

      // Handle process exit
      this.claudeProcess.on('close', (code) => {
        console.log(`Claude process exited with code ${code}`);
        this.isReady = false;
        this.emit('exit', code);
      });

      this.claudeProcess.on('error', (error) => {
        console.error('Failed to start Claude:', error);
        this.emit('error', `Failed to start Claude: ${error.message}`);
      });

      // Wait for initialization
      await new Promise((resolve) => {
        setTimeout(() => {
          this.isReady = true;
          this.emit('ready');
          console.log('Claude service initialized in interactive mode');
          resolve();
        }, 2000);
      });
      
    } catch (error) {
      console.error('Failed to initialize Claude:', error);
      this.emit('error', 'Failed to initialize Claude service');
      throw error;
    }
  }

  handleOutput(output) {
    this.outputBuffer += output;
    
    // Emit raw output for debugging
    this.emit('raw', output);
    
    // Detect various states
    if (output.includes('Thinking') || output.includes('thinking')) {
      this.emit('thinking', { content: 'Claude is thinking...' });
      this.emit('stream', { type: 'thinking', content: 'Processing...' });
    }
    
    if (output.includes('Using tool:') || output.includes('Tool:')) {
      const toolMatch = output.match(/(?:Using tool:|Tool:)\s*(\w+)/);
      if (toolMatch) {
        this.emit('tool_use', { 
          tool_name: toolMatch[1],
          timestamp: new Date() 
        });
        this.emit('stream', { 
          type: 'tool_use', 
          tool_name: toolMatch[1] 
        });
      }
    }
    
    if (output.includes('Permission') || output.includes('permission')) {
      this.emit('permission_request', {
        permission: 'file_access',
        auto_approved: this.bypassPermissions
      });
      this.emit('stream', {
        type: 'permission_request',
        auto_approved: this.bypassPermissions
      });
    }
    
    // Token usage patterns
    if (output.includes('tokens') || output.includes('Tokens')) {
      this.parseTokenInfo(output);
    }
    
    // Detect prompts
    if (output.includes('Human:') || output.includes('>') || output.includes('Assistant:')) {
      if (this.isWaitingForResponse) {
        this.processResponse();
      }
    }
    
    // Stream partial content
    if (this.isWaitingForResponse) {
      this.emit('partial', {
        role: 'assistant',
        content: output,
        timestamp: new Date()
      });
    }
  }

  parseTokenInfo(text) {
    // Try to extract token counts
    const inputMatch = text.match(/input[:\s]+(\d+)/i);
    const outputMatch = text.match(/output[:\s]+(\d+)/i);
    const totalMatch = text.match(/total[:\s]+(\d+)/i);
    
    if (inputMatch) this.currentTokens.input = parseInt(inputMatch[1]);
    if (outputMatch) this.currentTokens.output = parseInt(outputMatch[1]);
    if (totalMatch) this.currentTokens.total = parseInt(totalMatch[1]);
    
    if (inputMatch || outputMatch || totalMatch) {
      this.emit('token_usage', this.currentTokens);
      this.emit('stream', {
        type: 'token_usage',
        ...this.currentTokens
      });
    }
  }

  processResponse() {
    if (this.outputBuffer.trim()) {
      // Clean the response
      let cleanResponse = this.outputBuffer
        .replace(/Human:\s*$/m, '')
        .replace(/Assistant:\s*$/m, '')
        .replace(/>\s*$/m, '')
        .trim();
      
      if (cleanResponse) {
        const assistantMessage = {
          role: 'assistant',
          content: cleanResponse,
          timestamp: new Date(),
          tokens: this.currentTokens
        };
        this.messages.push(assistantMessage);
        this.emit('message', assistantMessage);
      }
    }
    
    this.outputBuffer = '';
    this.isWaitingForResponse = false;
    this.emit('done');
  }

  async sendMessage(message) {
    if (!this.isReady || !this.claudeProcess) {
      // Try to initialize if not ready
      if (!this.claudeProcess) {
        await this.initialize();
      }
    }

    try {
      // Add user message
      const userMessage = {
        role: 'user',
        content: message,
        timestamp: new Date()
      };
      this.messages.push(userMessage);
      this.emit('message', userMessage);
      this.emit('stream', {
        type: 'user_message',
        content: message
      });

      // Reset state
      this.outputBuffer = '';
      this.isWaitingForResponse = true;
      
      // Send to Claude
      const lineEnding = process.platform === 'win32' ? '\r\n' : '\n';
      this.claudeProcess.stdin.write(message + lineEnding);
      
      // Set timeout for response processing
      setTimeout(() => {
        if (this.isWaitingForResponse) {
          this.processResponse();
        }
      }, 10000); // 10 second timeout
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error.message);
      throw error;
    }
  }

  setBypassPermissions(bypass) {
    this.bypassPermissions = bypass;
    
    // If already running, need to restart with new settings
    if (this.claudeProcess) {
      this.stop().then(() => {
        this.initialize();
      });
    }
  }

  async stop() {
    this.isReady = false;
    
    if (this.claudeProcess) {
      this.claudeProcess.kill();
      this.claudeProcess = null;
    }
    
    console.log('Claude service stopped');
  }

  isRunning() {
    return this.isReady && this.claudeProcess;
  }

  getHistory() {
    return this.messages;
  }

  getTokenUsage() {
    return this.currentTokens;
  }
}

// Alternative: Use print mode for each message (more stable but no persistence)
class ClaudePrintService extends EventEmitter {
  constructor() {
    super();
    this.isReady = true;
    this.messages = [];
    this.bypassPermissions = true;
  }

  async initialize() {
    this.isReady = true;
    this.emit('ready');
    return true;
  }

  async sendMessage(message) {
    try {
      // Emit user message
      const userMessage = {
        role: 'user',
        content: message,
        timestamp: new Date()
      };
      this.messages.push(userMessage);
      this.emit('message', userMessage);
      this.emit('stream', { type: 'user_message', content: message });

      // Start thinking indication
      this.emit('thinking', { content: 'Processing...' });
      this.emit('stream', { type: 'thinking', content: 'Claude is thinking...' });

      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      const args = ['--print'];
      
      if (this.bypassPermissions) {
        args.push('--dangerously-skip-permissions');
      }
      
      // Add verbose for more info
      args.push('--verbose');
      
      const claudeProcess = spawn(claudeCmd, args, {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env },
        windowsHide: true
      });

      let responseBuffer = '';
      let errorBuffer = '';
      let tokenInfo = {};

      claudeProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        responseBuffer += chunk;
        
        // Emit partial response
        this.emit('partial', {
          role: 'assistant',
          content: chunk,
          timestamp: new Date()
        });
      });

      claudeProcess.stderr.on('data', (data) => {
        const error = data.toString();
        errorBuffer += error;
        
        // Check for token info in stderr
        if (error.includes('tokens')) {
          const inputMatch = error.match(/input[:\s]+(\d+)/i);
          const outputMatch = error.match(/output[:\s]+(\d+)/i);
          
          if (inputMatch) tokenInfo.input = parseInt(inputMatch[1]);
          if (outputMatch) tokenInfo.output = parseInt(outputMatch[1]);
          
          if (inputMatch || outputMatch) {
            tokenInfo.total = (tokenInfo.input || 0) + (tokenInfo.output || 0);
            this.emit('token_usage', tokenInfo);
            this.emit('stream', { type: 'token_usage', ...tokenInfo });
          }
        }
        
        // Check for permission requests
        if (error.includes('Permission')) {
          this.emit('permission_request', {
            permission: 'file_access',
            auto_approved: this.bypassPermissions
          });
        }
        
        // Check for tool usage
        if (error.includes('Using tool') || error.includes('Tool:')) {
          const toolMatch = error.match(/(?:Using tool:|Tool:)\s*(\w+)/);
          if (toolMatch) {
            this.emit('tool_use', { tool_name: toolMatch[1] });
            this.emit('stream', { type: 'tool_use', tool_name: toolMatch[1] });
          }
        }
      });

      // Wait for process to complete
      await new Promise((resolve, reject) => {
        claudeProcess.on('close', (code) => {
          if (code === 0 && responseBuffer.trim()) {
            const assistantMessage = {
              role: 'assistant',
              content: responseBuffer.trim(),
              timestamp: new Date(),
              tokens: tokenInfo
            };
            this.messages.push(assistantMessage);
            this.emit('message', assistantMessage);
            
            if (Object.keys(tokenInfo).length > 0) {
              this.emit('final_token_usage', tokenInfo);
            }
            
            resolve();
          } else if (code !== 0) {
            console.error('Claude error:', errorBuffer);
            this.emit('error', `Process exited with code ${code}: ${errorBuffer}`);
            reject(new Error(`Claude exited with code ${code}`));
          } else {
            resolve();
          }
          
          this.emit('done');
        });

        claudeProcess.on('error', (error) => {
          console.error('Failed to execute Claude:', error);
          this.emit('error', `Failed to execute Claude: ${error.message}`);
          reject(error);
        });
      });

      // Send the message
      claudeProcess.stdin.write(message);
      claudeProcess.stdin.end();
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error.message);
      throw error;
    }
  }

  setBypassPermissions(bypass) {
    this.bypassPermissions = bypass;
  }

  async stop() {
    this.isReady = false;
    this.messages = [];
  }

  isRunning() {
    return this.isReady;
  }

  getHistory() {
    return this.messages;
  }
}

module.exports = { 
  ClaudeServiceFixed,
  ClaudePrintService
};