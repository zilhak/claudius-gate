// PTY Manager Stub - No node-pty dependency
// This is a placeholder to prevent import errors

const { EventEmitter } = require('events');

class PTYManager extends EventEmitter {
  constructor() {
    super();
    console.warn('PTYManager: Using stub implementation without node-pty');
  }
  
  spawn() {
    throw new Error('PTYManager requires node-pty which is not installed');
  }
}

class WindowsPTYManager extends PTYManager {}
class UnixPTYManager extends PTYManager {}

function createPTYManager() {
  return new PTYManager();
}

module.exports = {
  PTYManager,
  WindowsPTYManager,
  UnixPTYManager,
  createPTYManager
};