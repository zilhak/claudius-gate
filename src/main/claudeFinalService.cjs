// Claude Final Service - Simple but effective
const { EventEmitter } = require('events');
const { spawn } = require('child_process');

class ClaudeFinalService extends EventEmitter {
  constructor() {
    super();
    this.isReady = true;
    this.messages = [];
    this.currentProcess = null;
    this.bypassPermissions = true;
    this.conversationContext = '';
    this.currentTokens = {
      input: 0,
      output: 0,
      total: 0,
      session_total: 0
    };
  }

  async initialize() {
    this.isReady = true;
    this.emit('ready');
    console.log('Claude Final Service ready');
    return true;
  }

  async sendMessage(message) {
    if (!this.isReady) {
      await this.initialize();
    }

    try {
      // Log communication for debugging
      console.log('🔵 [CLAUDE-COMM] Sending message:', message);
      
      // Build context-aware message
      let fullMessage = message;
      
      // If we have previous messages, add context hint
      if (this.messages.length > 0) {
        // Get last few messages for context
        const recentMessages = this.messages.slice(-4); // Last 2 exchanges
        let contextHint = '';
        
        recentMessages.forEach(msg => {
          if (msg.role === 'user') {
            contextHint += `Previous user message: "${msg.content.substring(0, 100)}..."\n`;
          } else {
            contextHint += `Your previous response: "${msg.content.substring(0, 100)}..."\n`;
          }
        });
        
        // Add context to message
        fullMessage = `Context from our conversation:\n${contextHint}\n\nNow, ${message}`;
      }
      
      // Add user message to history
      const userMessage = {
        role: 'user',
        content: message,
        timestamp: new Date()
      };
      this.messages.push(userMessage);
      
      // Emit events
      this.emit('message', userMessage);
      this.emit('stream', { type: 'user_message', content: message });
      this.emit('thinking', { content: 'Processing...' });
      this.emit('stream', { type: 'thinking', content: 'Claude is thinking...' });

      // Execute Claude
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      const args = ['--print'];
      
      if (this.bypassPermissions) {
        args.push('--dangerously-skip-permissions');
      }
      
      console.log('🚀 [CLAUDE-COMM] Executing command:', `${claudeCmd} ${args.join(' ')}`);
      console.log('📝 [CLAUDE-COMM] Full message being sent:', fullMessage);
      
      this.currentProcess = spawn(claudeCmd, args, {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env },
        windowsHide: true
      });

      let responseBuffer = '';
      let errorBuffer = '';

      // Handle stdout
      this.currentProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        responseBuffer += chunk;
        
        console.log('🟢 [CLAUDE-COMM] Received chunk:', chunk.substring(0, 100) + '...');
        
        // Emit partial response
        this.emit('partial', {
          role: 'assistant',
          content: chunk,
          timestamp: new Date()
        });
        
        // Detect tool usage
        if (chunk.includes('Using tool') || chunk.includes('Tool:') || chunk.includes('Write') || chunk.includes('Edit')) {
          const toolMatch = chunk.match(/(?:Using tool:|Tool:|\b)(Write|Edit|Read|Bash|Search)\b/i);
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
        
        // Don't log verbose info as errors
        if (!error.includes('[INFO]') && !error.includes('tokens') && !error.includes('verbose')) {
          console.error('Claude stderr:', error);
        }
        
        // Parse token info
        if (error.includes('tokens')) {
          this.parseTokenInfo(error);
        }
        
        // Detect permissions
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
          // Success
          const assistantMessage = {
            role: 'assistant',
            content: responseBuffer.trim(),
            timestamp: new Date(),
            tokens: { ...this.currentTokens }
          };
          this.messages.push(assistantMessage);
          this.emit('message', assistantMessage);
          
          // Update session totals
          if (this.currentTokens.total > 0) {
            this.currentTokens.session_total += this.currentTokens.total;
            this.emit('final_token_usage', this.currentTokens);
          }
        } else if (code !== 0) {
          console.error('Claude error output:', errorBuffer);
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

      // Send the message
      this.currentProcess.stdin.write(fullMessage);
      this.currentProcess.stdin.end();
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error.message);
      throw error;
    }
  }

  parseTokenInfo(text) {
    const patterns = {
      input: /input[:\s]+(\d+)/i,
      output: /output[:\s]+(\d+)/i,
      total: /total[:\s]+(\d+)/i
    };
    
    let updated = false;
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        this.currentTokens[key] = parseInt(match[1]);
        updated = true;
      }
    }
    
    if (updated) {
      this.currentTokens.total = (this.currentTokens.input || 0) + (this.currentTokens.output || 0);
      this.emit('token_usage', this.currentTokens);
      this.emit('stream', { type: 'token_usage', ...this.currentTokens });
    }
  }

  setBypassPermissions(bypass) {
    this.bypassPermissions = bypass;
  }

  clearContext() {
    this.messages = [];
    this.conversationContext = '';
    this.currentTokens.session_total = 0;
    this.emit('context_cleared');
  }

  async stop() {
    this.isReady = false;
    
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    
    console.log('Claude Final Service stopped');
  }

  isRunning() {
    return this.isReady;
  }

  getHistory() {
    return this.messages;
  }

  getTokenUsage() {
    return this.currentTokens;
  }
}

module.exports = { ClaudeFinalService };