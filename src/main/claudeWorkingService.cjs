// Working Claude Service - Without node-pty dependency
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

class ClaudeWorkingService extends EventEmitter {
  constructor() {
    super();
    this.isReady = true; // Always ready for print mode
    this.messages = [];
    this.currentProcess = null;
    this.bypassPermissions = true;
    this.currentTokens = {
      input: 0,
      output: 0,
      total: 0
    };
  }

  async initialize() {
    // Test Claude availability
    try {
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
            console.log('Claude service ready');
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
      // Emit user message
      const userMessage = {
        role: 'user',
        content: message,
        timestamp: new Date()
      };
      this.messages.push(userMessage);
      this.emit('message', userMessage);
      
      // Emit stream events for UI
      this.emit('stream', { type: 'user_message', content: message });
      this.emit('thinking', { content: 'Processing...' });
      this.emit('stream', { type: 'thinking', content: 'Claude is thinking...' });

      // Execute Claude with print mode
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      const args = ['--print'];
      
      // Add permission bypass
      if (this.bypassPermissions) {
        args.push('--dangerously-skip-permissions');
      }
      
      console.log('Running Claude with args:', args);
      
      this.currentProcess = spawn(claudeCmd, args, {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env },
        windowsHide: true
      });

      let responseBuffer = '';
      let errorBuffer = '';
      let hasError = false;

      // Handle stdout
      this.currentProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        responseBuffer += chunk;
        
        // Emit partial response for streaming effect
        this.emit('partial', {
          role: 'assistant',
          content: chunk,
          timestamp: new Date()
        });
        
        // Check for tool usage patterns in output
        if (chunk.includes('Using tool') || chunk.includes('Tool:')) {
          const toolMatch = chunk.match(/(?:Using tool:|Tool:)\s*(\w+)/);
          if (toolMatch) {
            this.emit('tool_use', { tool_name: toolMatch[1] });
            this.emit('stream', { type: 'tool_use', tool_name: toolMatch[1] });
          }
        }
      });

      // Handle stderr  
      this.currentProcess.stderr.on('data', (data) => {
        const error = data.toString();
        errorBuffer += error;
        
        // Don't treat everything as error - some is just info
        if (!error.includes('[INFO]') && !error.includes('tokens')) {
          console.error('Claude stderr:', error);
        }
        
        // Parse token information from stderr
        if (error.includes('tokens')) {
          const inputMatch = error.match(/input[:\s]+(\d+)/i);
          const outputMatch = error.match(/output[:\s]+(\d+)/i);
          
          if (inputMatch) this.currentTokens.input = parseInt(inputMatch[1]);
          if (outputMatch) this.currentTokens.output = parseInt(outputMatch[1]);
          
          if (inputMatch || outputMatch) {
            this.currentTokens.total = this.currentTokens.input + this.currentTokens.output;
            this.emit('token_usage', this.currentTokens);
            this.emit('stream', { type: 'token_usage', ...this.currentTokens });
          }
        }
        
        // Check for permission patterns
        if (error.includes('Permission') || error.includes('permission')) {
          this.emit('permission_request', {
            permission: 'detected',
            auto_approved: this.bypassPermissions
          });
          this.emit('stream', {
            type: 'permission_request',
            auto_approved: this.bypassPermissions
          });
        }
      });

      // Handle process exit
      this.currentProcess.on('close', (code) => {
        console.log(`Claude process exited with code ${code}`);
        
        if (code === 0 && responseBuffer.trim()) {
          // Success - emit the response
          const assistantMessage = {
            role: 'assistant',
            content: responseBuffer.trim(),
            timestamp: new Date(),
            tokens: this.currentTokens
          };
          this.messages.push(assistantMessage);
          this.emit('message', assistantMessage);
          
          // Final token usage
          if (this.currentTokens.total > 0) {
            this.emit('final_token_usage', this.currentTokens);
          }
        } else if (code !== 0) {
          // Error occurred
          hasError = true;
          console.error('Claude error output:', errorBuffer);
          this.emit('error', `Claude process exited with code ${code}: ${errorBuffer}`);
        }
        
        this.currentProcess = null;
        this.emit('done');
      });

      this.currentProcess.on('error', (error) => {
        console.error('Failed to execute Claude:', error);
        this.emit('error', `Failed to execute Claude: ${error.message}`);
        this.currentProcess = null;
      });

      // Send the message via stdin
      this.currentProcess.stdin.write(message);
      this.currentProcess.stdin.end();
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error.message);
      throw error;
    }
  }

  setBypassPermissions(bypass) {
    this.bypassPermissions = bypass;
    this.emit('settings_changed', {
      bypassPermissions: bypass
    });
  }

  getSettings() {
    return {
      bypassPermissions: this.bypassPermissions
    };
  }

  getTokenUsage() {
    return this.currentTokens;
  }

  async stop() {
    this.isReady = false;
    
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
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

module.exports = { ClaudeWorkingService };