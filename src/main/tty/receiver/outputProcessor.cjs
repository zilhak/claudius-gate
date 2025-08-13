// TTY Output Processor
// ANSI 파싱 결과를 처리하고 상태를 관리

const { EventEmitter } = require('events');
const { ANSIParser } = require('./ansiParser.cjs');

// 터미널 상태
class TerminalState {
  constructor(cols = 80, rows = 24) {
    this.cols = cols;
    this.rows = rows;
    this.cursorX = 0;
    this.cursorY = 0;
    this.savedCursor = { x: 0, y: 0 };
    this.scrollTop = 0;
    this.scrollBottom = rows - 1;
    
    // 스타일 상태
    this.currentStyle = {
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      blink: false,
      reverse: false,
      hidden: false,
      strikethrough: false,
      fgColor: null,
      bgColor: null
    };
    
    // 모드
    this.modes = {
      applicationKeypad: false,
      originMode: false,
      autowrap: true,
      insertMode: false,
      cursorVisible: true,
      alternateScreen: false,
      bracketedPaste: false,
      mouseTracking: false
    };
    
    // 버퍼 (메인/대체)
    this.mainBuffer = this.createBuffer();
    this.alternateBuffer = this.createBuffer();
    this.activeBuffer = this.mainBuffer;
    
    // 타이틀
    this.title = '';
  }
  
  createBuffer() {
    const buffer = [];
    for (let i = 0; i < this.rows; i++) {
      buffer.push(this.createLine());
    }
    return buffer;
  }
  
  createLine() {
    return {
      text: '',
      cells: []
    };
  }
  
  getActiveBuffer() {
    return this.modes.alternateScreen ? this.alternateBuffer : this.mainBuffer;
  }
  
  switchToAlternateScreen() {
    if (!this.modes.alternateScreen) {
      this.modes.alternateScreen = true;
      this.activeBuffer = this.alternateBuffer;
      this.savedCursor = { x: this.cursorX, y: this.cursorY };
      this.cursorX = 0;
      this.cursorY = 0;
    }
  }
  
  switchToMainScreen() {
    if (this.modes.alternateScreen) {
      this.modes.alternateScreen = false;
      this.activeBuffer = this.mainBuffer;
      this.cursorX = this.savedCursor.x;
      this.cursorY = this.savedCursor.y;
    }
  }
  
  writeText(text) {
    const buffer = this.getActiveBuffer();
    const line = buffer[this.cursorY];
    if (!line) return;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (this.cursorX >= this.cols) {
        if (this.modes.autowrap) {
          this.cursorX = 0;
          this.cursorY++;
          if (this.cursorY >= this.rows) {
            this.scroll();
            this.cursorY = this.rows - 1;
          }
        } else {
          this.cursorX = this.cols - 1;
        }
      }
      
      // 현재 위치에 문자 쓰기
      if (!line.cells[this.cursorX]) {
        line.cells[this.cursorX] = {};
      }
      
      line.cells[this.cursorX] = {
        char: char,
        style: { ...this.currentStyle }
      };
      
      this.cursorX++;
    }
    
    // 라인 텍스트 재구성
    this.updateLineText(line);
  }
  
  updateLineText(line) {
    line.text = line.cells.map(cell => cell ? cell.char : ' ').join('');
  }
  
  scroll() {
    const buffer = this.getActiveBuffer();
    buffer.shift();
    buffer.push(this.createLine());
  }
  
  clearScreen(mode = 0) {
    const buffer = this.getActiveBuffer();
    
    switch (mode) {
      case 0: // From cursor to end
        for (let y = this.cursorY; y < this.rows; y++) {
          if (y === this.cursorY) {
            // Clear from cursor to end of line
            for (let x = this.cursorX; x < this.cols; x++) {
              if (buffer[y].cells[x]) {
                buffer[y].cells[x] = null;
              }
            }
          } else {
            buffer[y] = this.createLine();
          }
        }
        break;
      case 1: // From start to cursor
        for (let y = 0; y <= this.cursorY; y++) {
          if (y === this.cursorY) {
            // Clear from start to cursor
            for (let x = 0; x <= this.cursorX; x++) {
              if (buffer[y].cells[x]) {
                buffer[y].cells[x] = null;
              }
            }
          } else {
            buffer[y] = this.createLine();
          }
        }
        break;
      case 2: // Entire screen
        for (let y = 0; y < this.rows; y++) {
          buffer[y] = this.createLine();
        }
        break;
    }
  }
  
  clearLine(mode = 0) {
    const buffer = this.getActiveBuffer();
    const line = buffer[this.cursorY];
    if (!line) return;
    
    switch (mode) {
      case 0: // From cursor to end
        for (let x = this.cursorX; x < this.cols; x++) {
          if (line.cells[x]) {
            line.cells[x] = null;
          }
        }
        break;
      case 1: // From start to cursor
        for (let x = 0; x <= this.cursorX; x++) {
          if (line.cells[x]) {
            line.cells[x] = null;
          }
        }
        break;
      case 2: // Entire line
        line.cells = [];
        break;
    }
    
    this.updateLineText(line);
  }
}

// 출력 프로세서
class OutputProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.cols = options.cols || 80;
    this.rows = options.rows || 24;
    this.state = new TerminalState(this.cols, this.rows);
    this.parser = new ANSIParser();
    
    this.setupParserHandlers();
  }
  
  setupParserHandlers() {
    // 텍스트
    this.parser.on('text', (text) => {
      this.state.writeText(text);
      this.emit('update', { type: 'text', text });
    });
    
    // 제어 문자
    this.parser.on('linefeed', () => {
      this.handleLineFeed();
    });
    
    this.parser.on('carriageReturn', () => {
      this.state.cursorX = 0;
      this.emit('update', { type: 'cursor' });
    });
    
    this.parser.on('backspace', () => {
      if (this.state.cursorX > 0) {
        this.state.cursorX--;
        this.emit('update', { type: 'cursor' });
      }
    });
    
    this.parser.on('tab', () => {
      const tabStop = 8;
      const nextTab = Math.ceil((this.state.cursorX + 1) / tabStop) * tabStop;
      this.state.cursorX = Math.min(nextTab, this.state.cols - 1);
      this.emit('update', { type: 'cursor' });
    });
    
    // 시퀀스
    this.parser.on('sequence', (seq) => {
      this.handleSequence(seq);
    });
    
    // 타이틀
    this.parser.on('title', (title) => {
      this.state.title = title;
      this.emit('title', title);
    });
    
    // 커서 저장/복원
    this.parser.on('saveCursor', () => {
      this.state.savedCursor = {
        x: this.state.cursorX,
        y: this.state.cursorY
      };
    });
    
    this.parser.on('restoreCursor', () => {
      this.state.cursorX = this.state.savedCursor.x;
      this.state.cursorY = this.state.savedCursor.y;
      this.emit('update', { type: 'cursor' });
    });
  }
  
  handleLineFeed() {
    this.state.cursorY++;
    if (this.state.cursorY >= this.state.rows) {
      this.state.scroll();
      this.state.cursorY = this.state.rows - 1;
    }
    this.emit('update', { type: 'cursor' });
  }
  
  handleSequence(seq) {
    switch (seq.type) {
      case 'cursor':
        this.handleCursorSequence(seq);
        break;
      case 'erase':
        this.handleEraseSequence(seq);
        break;
      case 'style':
        this.handleStyleSequence(seq);
        break;
      case 'mode':
        this.handleModeSequence(seq);
        break;
    }
  }
  
  handleCursorSequence(seq) {
    switch (seq.action) {
      case 'up':
        this.state.cursorY = Math.max(0, this.state.cursorY - seq.count);
        break;
      case 'down':
        this.state.cursorY = Math.min(this.state.rows - 1, this.state.cursorY + seq.count);
        break;
      case 'forward':
        this.state.cursorX = Math.min(this.state.cols - 1, this.state.cursorX + seq.count);
        break;
      case 'back':
        this.state.cursorX = Math.max(0, this.state.cursorX - seq.count);
        break;
      case 'position':
        this.state.cursorY = Math.min(this.state.rows - 1, Math.max(0, seq.row - 1));
        this.state.cursorX = Math.min(this.state.cols - 1, Math.max(0, seq.col - 1));
        break;
      case 'column':
        this.state.cursorX = Math.min(this.state.cols - 1, Math.max(0, seq.col - 1));
        break;
    }
    this.emit('update', { type: 'cursor' });
  }
  
  handleEraseSequence(seq) {
    if (seq.action === 'display') {
      this.state.clearScreen(seq.mode);
    } else if (seq.action === 'line') {
      this.state.clearLine(seq.mode);
    }
    this.emit('update', { type: 'erase' });
  }
  
  handleStyleSequence(seq) {
    for (const style of seq.styles) {
      switch (style.type) {
        case 'reset':
          this.state.currentStyle = {
            bold: false,
            dim: false,
            italic: false,
            underline: false,
            blink: false,
            reverse: false,
            hidden: false,
            strikethrough: false,
            fgColor: null,
            bgColor: null
          };
          break;
        case 'bold':
        case 'dim':
        case 'italic':
        case 'underline':
        case 'blink':
        case 'reverse':
        case 'hidden':
        case 'strikethrough':
          this.state.currentStyle[style.type] = style.value;
          break;
        case 'fg':
        case 'fg256':
        case 'fgRGB':
          this.state.currentStyle.fgColor = style;
          break;
        case 'bg':
        case 'bg256':
        case 'bgRGB':
          this.state.currentStyle.bgColor = style;
          break;
      }
    }
    this.emit('update', { type: 'style' });
  }
  
  handleModeSequence(seq) {
    if (seq.private) {
      const mode = seq.params[0];
      const enable = seq.action === 'set';
      
      switch (mode) {
        case 1049: // Alternate screen
          if (enable) {
            this.state.switchToAlternateScreen();
          } else {
            this.state.switchToMainScreen();
          }
          break;
        case 25: // Cursor visibility
          this.state.modes.cursorVisible = enable;
          break;
        case 1000: // Mouse tracking
          this.state.modes.mouseTracking = enable;
          break;
        case 2004: // Bracketed paste
          this.state.modes.bracketedPaste = enable;
          break;
      }
    }
    this.emit('update', { type: 'mode' });
  }
  
  process(data) {
    this.parser.parse(data);
  }
  
  getScreen() {
    const buffer = this.state.getActiveBuffer();
    return {
      lines: buffer.map(line => line.text),
      cursor: {
        x: this.state.cursorX,
        y: this.state.cursorY,
        visible: this.state.modes.cursorVisible
      },
      title: this.state.title
    };
  }
  
  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.state = new TerminalState(cols, rows);
    this.emit('resize', { cols, rows });
  }
  
  reset() {
    this.state = new TerminalState(this.cols, this.rows);
    this.parser.reset();
    this.emit('reset');
  }
}

module.exports = {
  TerminalState,
  OutputProcessor
};