// Claude Session Service - Maintains conversation context
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const os = require('os');

class ClaudeSessionService extends EventEmitter {
  constructor() {
    super();
    this.isReady = false;
    this.messages = [];
    this.claudeProcess = null;
    this.bypassPermissions = true;
    this.outputBuffer = '';
    this.isWaitingForResponse = false;
    this.currentResponseBuffer = '';
    this.tokenUsage = {
      input: 0,
      output: 0,
      total: 0,
      session_total: 0
    };
    this.promptReady = false;
    this.readlineInterface = null;
  }

  async initialize() {
    try {
      console.log('Initializing Claude Session Service...');
      
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      // Build arguments
      const args = [];
      
      // Add permission bypass
      if (this.bypassPermissions) {
        args.push('--dangerously-skip-permissions');
      }
      
      // Add verbose for more info
      args.push('--verbose');
      
      console.log('Starting Claude with args:', args);
      
      // Start Claude in interactive mode (no --print flag)
      this.claudeProcess = spawn(claudeCmd, args, {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env },
        windowsHide: true,
        // Ensure pipes for stdin/stdout/stderr
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Create readline interface for line-by-line reading
      this.readlineInterface = readline.createInterface({
        input: this.claudeProcess.stdout,
        crlfDelay: Infinity
      });

      // Handle stdout line by line
      this.readlineInterface.on('line', (line) => {
        this.handleOutputLine(line);
      });

      // Handle stderr
      this.claudeProcess.stderr.on('data', (data) => {
        const error = data.toString();
        this.handleStderr(error);
      });

      // Handle process exit
      this.claudeProcess.on('close', (code) => {
        console.log(`Claude process exited with code ${code}`);
        this.isReady = false;
        this.promptReady = false;
        this.emit('exit', code);
      });

      this.claudeProcess.on('error', (error) => {
        console.error('Failed to start Claude:', error);
        this.emit('error', `Failed to start Claude: ${error.message}`);
      });

      // Wait for initial prompt
      await this.waitForPrompt();
      
      this.isReady = true;
      this.emit('ready');
      console.log('Claude Session Service initialized successfully');
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Claude:', error);
      this.emit('error', `Failed to initialize: ${error.message}`);
      throw error;
    }
  }

  handleOutputLine(line) {
    // Store output
    this.outputBuffer += line + '\n';
    
    // Emit raw output for debugging
    this.emit('raw', line);
    
    // Clean line for analysis
    const cleanLine = this.stripAnsi(line);
    
    // Detect various states
    this.detectStates(cleanLine);
    
    // If waiting for response, collect it
    if (this.isWaitingForResponse) {
      // Skip prompt lines
      if (!this.isPromptLine(cleanLine)) {
        this.currentResponseBuffer += cleanLine + '\n';
        
        // Emit partial response
        this.emit('partial', {
          role: 'assistant',
          content: cleanLine,
          timestamp: new Date()
        });
      }
      
      // Check if response is complete (prompt appeared)
      if (this.isPromptLine(cleanLine)) {
        this.processResponse();
        this.promptReady = true;
      }
    } else if (this.isPromptLine(cleanLine)) {
      this.promptReady = true;
    }
    
    // Emit stream data
    this.emit('stream', {
      type: 'output',
      content: line,
      clean: cleanLine
    });
  }

  handleStderr(error) {
    // Don't treat everything as error - some is just info
    if (!error.includes('[INFO]') && !error.includes('tokens') && !error.includes('verbose')) {
      console.error('Claude stderr:', error);
    }
    
    // Parse token information
    if (error.includes('tokens')) {
      this.parseTokenInfo(error);
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
    
    // Check for tool usage
    if (error.includes('Using tool') || error.includes('Tool:')) {
      const toolMatch = error.match(/(?:Using tool:|Tool:)\s*(\w+)/);
      if (toolMatch) {
        this.emit('tool_use', { tool_name: toolMatch[1] });
        this.emit('stream', { type: 'tool_use', tool_name: toolMatch[1] });
      }
    }
  }

  detectStates(text) {
    // Detect thinking
    if (text.includes('Thinking') || text.includes('thinking') || text.includes('Processing')) {
      this.emit('thinking', { content: 'Claude is thinking...' });
      this.emit('stream', { type: 'thinking', content: 'Processing...' });
    }
    
    // Detect tool usage in output
    const toolPatterns = [
      /Using tool:\s*(\w+)/i,
      /Tool:\s*(\w+)/i,
      /Calling\s+(\w+)/i,
      /Executing\s+(\w+)/i
    ];
    
    for (const pattern of toolPatterns) {
      const match = text.match(pattern);
      if (match) {
        this.emit('tool_use', {
          tool_name: match[1],
          timestamp: new Date()
        });
        this.emit('stream', {
          type: 'tool_use',
          tool_name: match[1]
        });
        break;
      }
    }
  }

  parseTokenInfo(text) {
    const patterns = {
      input: /input[:\s]+(\d+)/i,
      output: /output[:\s]+(\d+)/i,
      total: /total[:\s]+(\d+)/i,
      cost: /cost[:\s]+\$?([\d.]+)/i
    };
    
    let updated = false;
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        if (key === 'cost') {
          this.tokenUsage.cost = parseFloat(match[1]);
        } else {
          this.tokenUsage[key] = parseInt(match[1]);
        }
        updated = true;
      }
    }
    
    if (updated) {
      this.tokenUsage.session_total += this.tokenUsage.total || 0;
      this.emit('token_usage', this.tokenUsage);
      this.emit('stream', {
        type: 'token_usage',
        ...this.tokenUsage
      });
    }
  }

  isPromptLine(text) {
    // Common prompt patterns
    const promptPatterns = [
      /^Human:\s*$/,
      /^>\s*$/,
      /^Assistant:\s*$/,
      /^claude>\s*$/i,
      /^\$ $/,
      /^You:\s*$/,
      /^User:\s*$/
    ];
    
    return promptPatterns.some(pattern => pattern.test(text.trim()));
  }

  stripAnsi(str) {
    // Remove ANSI escape codes
    return str
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1b\]0;[^\x07]*\x07/g, '')
      .replace(/\r/g, '');
  }

  processResponse() {
    if (this.currentResponseBuffer.trim()) {
      // Clean the response
      let cleanResponse = this.currentResponseBuffer.trim();
      
      if (cleanResponse) {
        const assistantMessage = {
          role: 'assistant',
          content: cleanResponse,
          timestamp: new Date(),
          tokens: { ...this.tokenUsage }
        };
        this.messages.push(assistantMessage);
        this.emit('message', assistantMessage);
        
        // Emit final token usage if available
        if (this.tokenUsage.total > 0) {
          this.emit('final_token_usage', this.tokenUsage);
        }
      }
    }
    
    // Reset state
    this.currentResponseBuffer = '';
    this.outputBuffer = '';
    this.isWaitingForResponse = false;
    
    this.emit('done');
    this.emit('stream', { type: 'done' });
  }

  async waitForPrompt(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkPrompt = () => {
        if (this.promptReady) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          // Timeout, but continue anyway
          console.log('Prompt wait timeout, continuing...');
          resolve();
        } else {
          setTimeout(checkPrompt, 100);
        }
      };
      
      checkPrompt();
    });
  }

  async sendMessage(message) {
    if (!this.isReady || !this.claudeProcess) {
      // Try to initialize if not ready
      if (!this.claudeProcess) {
        await this.initialize();
      }
    }

    // Wait for prompt if needed
    if (!this.promptReady) {
      console.log('Waiting for prompt...');
      await this.waitForPrompt();
    }

    try {
      console.log('Sending message to Claude:', message);
      
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
      this.currentResponseBuffer = '';
      this.outputBuffer = '';
      this.isWaitingForResponse = true;
      this.promptReady = false;

      // Send message to Claude
      const lineEnding = process.platform === 'win32' ? '\r\n' : '\n';
      this.claudeProcess.stdin.write(message + lineEnding);
      
      // Start thinking indication
      this.emit('thinking', { content: 'Processing...' });
      this.emit('stream', { type: 'thinking', content: 'Claude is thinking...' });
      
      // Set timeout for response
      setTimeout(() => {
        if (this.isWaitingForResponse) {
          console.log('Response timeout, processing what we have...');
          this.processResponse();
          this.promptReady = true;
        }
      }, 30000); // 30 second timeout
      
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error.message);
      throw error;
    }
  }

  setBypassPermissions(bypass) {
    this.bypassPermissions = bypass;
    
    // If running, need to restart
    if (this.claudeProcess) {
      console.log('Restarting Claude with new permission settings...');
      this.stop().then(() => {
        this.initialize();
      });
    }
  }

  async stop() {
    this.isReady = false;
    this.promptReady = false;
    
    if (this.readlineInterface) {
      this.readlineInterface.close();
      this.readlineInterface = null;
    }
    
    if (this.claudeProcess) {
      // Send exit command first
      try {
        this.claudeProcess.stdin.write('exit\n');
      } catch (e) {
        // Ignore error
      }
      
      // Then kill process
      setTimeout(() => {
        if (this.claudeProcess) {
          this.claudeProcess.kill();
          this.claudeProcess = null;
        }
      }, 100);
    }
    
    this.messages = [];
    this.outputBuffer = '';
    this.currentResponseBuffer = '';
    this.isWaitingForResponse = false;
    
    console.log('Claude Session Service stopped');
  }

  isRunning() {
    return this.isReady && this.claudeProcess;
  }

  getHistory() {
    return this.messages;
  }

  getTokenUsage() {
    return this.tokenUsage;
  }

  getInfo() {
    return {
      isReady: this.isReady,
      promptReady: this.promptReady,
      isWaitingForResponse: this.isWaitingForResponse,
      messageCount: this.messages.length,
      sessionTokens: this.tokenUsage.session_total,
      pid: this.claudeProcess?.pid
    };
  }
}

module.exports = { ClaudeSessionService };