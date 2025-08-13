// Claude Context Service - Maintains context using --resume flag
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ClaudeContextService extends EventEmitter {
  constructor() {
    super();
    this.isReady = true;
    this.messages = [];
    this.currentProcess = null;
    this.bypassPermissions = true;
    this.conversationFile = null;
    this.contextInitialized = false;
    this.currentTokens = {
      input: 0,
      output: 0,
      total: 0,
      session_total: 0
    };
  }

  async initialize() {
    // Create a temporary file for conversation context
    const tmpDir = os.tmpdir();
    const sessionId = `claude_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.conversationFile = path.join(tmpDir, `${sessionId}.md`);
    
    // Initialize with empty context
    await fs.writeFile(this.conversationFile, '# Conversation Context\n\n', 'utf8');
    
    this.contextInitialized = true;
    this.emit('ready');
    console.log('Claude Context Service ready with context file:', this.conversationFile);
    
    return true;
  }

  async sendMessage(message) {
    if (!this.contextInitialized) {
      await this.initialize();
    }

    try {
      // Add user message to context
      const userMessage = {
        role: 'user',
        content: message,
        timestamp: new Date()
      };
      this.messages.push(userMessage);
      
      // Update context file
      await this.updateContextFile(userMessage);
      
      // Emit events
      this.emit('message', userMessage);
      this.emit('stream', { type: 'user_message', content: message });
      this.emit('thinking', { content: 'Processing...' });
      this.emit('stream', { type: 'thinking', content: 'Claude is thinking...' });

      // Build Claude command
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      
      const args = ['--print'];
      
      // Add context resume flag
      if (this.messages.length > 1) {
        args.push('--resume', this.conversationFile);
      }
      
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

      // Handle stdout
      this.currentProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        responseBuffer += chunk;
        
        // Emit partial response
        this.emit('partial', {
          role: 'assistant',
          content: chunk,
          timestamp: new Date()
        });
        
        // Check for tool usage
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
        
        // Parse token info
        if (error.includes('tokens')) {
          this.parseTokenInfo(error);
        }
        
        // Check for permissions
        if (error.includes('Permission')) {
          this.emit('permission_request', {
            permission: 'detected',
            auto_approved: this.bypassPermissions
          });
        }
      });

      // Wait for process to complete
      await new Promise((resolve, reject) => {
        this.currentProcess.on('close', async (code) => {
          if (code === 0 && responseBuffer.trim()) {
            // Success - save response
            const assistantMessage = {
              role: 'assistant',
              content: responseBuffer.trim(),
              timestamp: new Date(),
              tokens: { ...this.currentTokens }
            };
            this.messages.push(assistantMessage);
            
            // Update context file with response
            await this.updateContextFile(assistantMessage);
            
            this.emit('message', assistantMessage);
            
            if (this.currentTokens.total > 0) {
              this.currentTokens.session_total += this.currentTokens.total;
              this.emit('final_token_usage', this.currentTokens);
            }
            
            resolve();
          } else if (code !== 0) {
            console.error('Claude error:', errorBuffer);
            this.emit('error', `Process exited with code ${code}: ${errorBuffer}`);
            reject(new Error(`Claude exited with code ${code}`));
          } else {
            resolve();
          }
          
          this.currentProcess = null;
          this.emit('done');
        });

        this.currentProcess.on('error', (error) => {
          console.error('Failed to execute Claude:', error);
          this.emit('error', `Failed to execute Claude: ${error.message}`);
          reject(error);
        });
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

  async updateContextFile(message) {
    try {
      // Read current context
      let content = await fs.readFile(this.conversationFile, 'utf8');
      
      // Add new message
      const roleHeader = message.role === 'user' ? '## User' : '## Assistant';
      const timestamp = message.timestamp.toISOString();
      
      content += `\n${roleHeader} (${timestamp})\n\n${message.content}\n\n---\n`;
      
      // Write back
      await fs.writeFile(this.conversationFile, content, 'utf8');
    } catch (error) {
      console.error('Failed to update context file:', error);
    }
  }

  parseTokenInfo(text) {
    const patterns = {
      input: /input[:\s]+(\d+)/i,
      output: /output[:\s]+(\d+)/i,
      total: /total[:\s]+(\d+)/i
    };
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        this.currentTokens[key] = parseInt(match[1]);
      }
    }
    
    if (this.currentTokens.input || this.currentTokens.output) {
      this.currentTokens.total = (this.currentTokens.input || 0) + (this.currentTokens.output || 0);
      this.emit('token_usage', this.currentTokens);
      this.emit('stream', { type: 'token_usage', ...this.currentTokens });
    }
  }

  setBypassPermissions(bypass) {
    this.bypassPermissions = bypass;
  }

  async clearContext() {
    this.messages = [];
    this.currentTokens.session_total = 0;
    
    if (this.conversationFile) {
      await fs.writeFile(this.conversationFile, '# Conversation Context\n\n', 'utf8');
    }
    
    this.emit('context_cleared');
  }

  async stop() {
    this.isReady = false;
    
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    
    // Clean up conversation file
    if (this.conversationFile) {
      try {
        await fs.unlink(this.conversationFile);
      } catch (e) {
        // Ignore error
      }
      this.conversationFile = null;
    }
    
    this.messages = [];
    console.log('Claude Context Service stopped');
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

  getContextFile() {
    return this.conversationFile;
  }
}

module.exports = { ClaudeContextService };