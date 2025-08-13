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
    this.currentProcess = null;
  }

  async initialize() {
    try {
      // Test Claude CLI availability
      const { spawn } = require('child_process');
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
            console.log('Claude service initialized (using print mode)');
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
      // Add user message to history
      this.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });
      
      // Emit user message
      this.emit('message', {
        role: 'user',
        content: message,
        timestamp: new Date()
      });

      // Use Claude in print mode for each message
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      // Create a new process for this message
      this.currentProcess = spawn(claudeCmd, ['--print'], {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env },
        windowsHide: true
      });

      let responseBuffer = '';
      let errorBuffer = '';
      
      this.currentProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        responseBuffer += chunk;
        
        // Emit partial response for streaming effect
        this.emit('partial', {
          role: 'assistant',
          content: chunk,
          timestamp: new Date()
        });
      });

      this.currentProcess.stderr.on('data', (data) => {
        errorBuffer += data.toString();
      });

      this.currentProcess.on('close', (code) => {
        if (code === 0 && responseBuffer.trim()) {
          const assistantMessage = {
            role: 'assistant',
            content: responseBuffer.trim(),
            timestamp: new Date()
          };
          this.messages.push(assistantMessage);
          this.emit('message', assistantMessage);
        } else if (code !== 0) {
          console.error('Claude error:', errorBuffer);
          this.emit('error', `Claude process exited with code ${code}: ${errorBuffer}`);
        }
        this.currentProcess = null;
      });

      this.currentProcess.on('error', (error) => {
        console.error('Failed to execute Claude:', error);
        this.emit('error', `Failed to execute Claude: ${error.message}`);
        this.currentProcess = null;
      });

      // Send the message
      this.currentProcess.stdin.write(message);
      this.currentProcess.stdin.end();
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error.message);
      throw error;
    }
  }

  async stop() {
    this.isReady = false;
    this.messages = [];
    
    // Kill current process if running
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

module.exports = { ClaudeService };