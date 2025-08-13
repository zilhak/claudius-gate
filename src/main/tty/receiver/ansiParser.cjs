// ANSI Escape Sequence Parser
// TTY 출력 스트림을 파싱하여 의미있는 데이터로 변환

const { EventEmitter } = require('events');

// ANSI 파서 상태
const ParserState = {
  NORMAL: 'normal',
  ESCAPE: 'escape',
  CSI: 'csi',
  OSC: 'osc',
  DCS: 'dcs',
  SOS: 'sos',
  PM: 'pm',
  APC: 'apc'
};

// 파싱된 시퀀스 타입
const SequenceType = {
  TEXT: 'text',
  CURSOR: 'cursor',
  STYLE: 'style',
  ERASE: 'erase',
  MODE: 'mode',
  TITLE: 'title',
  HYPERLINK: 'hyperlink',
  UNKNOWN: 'unknown'
};

class ANSIParser extends EventEmitter {
  constructor() {
    super();
    this.state = ParserState.NORMAL;
    this.buffer = '';
    this.params = [];
    this.currentParam = '';
    this.intermediates = '';
    this.finalChar = '';
  }
  
  reset() {
    this.state = ParserState.NORMAL;
    this.buffer = '';
    this.params = [];
    this.currentParam = '';
    this.intermediates = '';
    this.finalChar = '';
  }
  
  parse(data) {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);
      
      switch (this.state) {
        case ParserState.NORMAL:
          this.handleNormal(char, code);
          break;
          
        case ParserState.ESCAPE:
          this.handleEscape(char, code);
          break;
          
        case ParserState.CSI:
          this.handleCSI(char, code);
          break;
          
        case ParserState.OSC:
          this.handleOSC(char, code);
          break;
          
        case ParserState.DCS:
          this.handleDCS(char, code);
          break;
          
        default:
          this.handleOther(char, code);
      }
    }
  }
  
  handleNormal(char, code) {
    if (code === 0x1b) { // ESC
      this.flushText();
      this.state = ParserState.ESCAPE;
    } else if (code < 0x20) { // Control characters
      this.handleControlChar(char, code);
    } else {
      this.buffer += char;
    }
  }
  
  handleEscape(char, code) {
    if (code === 0x5b) { // [
      this.state = ParserState.CSI;
      this.params = [];
      this.currentParam = '';
      this.intermediates = '';
    } else if (code === 0x5d) { // ]
      this.state = ParserState.OSC;
      this.buffer = '';
    } else if (code === 0x50) { // P
      this.state = ParserState.DCS;
      this.buffer = '';
    } else if (code >= 0x40 && code <= 0x5f) {
      // Single character sequence
      this.handleSingleEscape(char);
      this.state = ParserState.NORMAL;
    } else {
      // Invalid escape sequence
      this.state = ParserState.NORMAL;
    }
  }
  
  handleCSI(char, code) {
    if (code >= 0x30 && code <= 0x3f) { // Parameter bytes
      if (code === 0x3b) { // ;
        if (this.currentParam) {
          this.params.push(parseInt(this.currentParam, 10));
        } else {
          this.params.push(0);
        }
        this.currentParam = '';
      } else {
        this.currentParam += char;
      }
    } else if (code >= 0x20 && code <= 0x2f) { // Intermediate bytes
      this.intermediates += char;
    } else if (code >= 0x40 && code <= 0x7e) { // Final byte
      if (this.currentParam) {
        this.params.push(parseInt(this.currentParam, 10));
      }
      this.finalChar = char;
      this.handleCSISequence();
      this.state = ParserState.NORMAL;
    } else {
      // Invalid CSI sequence
      this.state = ParserState.NORMAL;
    }
  }
  
  handleOSC(char, code) {
    if (code === 0x07) { // BEL
      this.handleOSCSequence();
      this.state = ParserState.NORMAL;
    } else if (code === 0x1b) { // ESC
      // Check for ST (ESC \)
      this.state = ParserState.NORMAL; // Simplified
    } else {
      this.buffer += char;
    }
  }
  
  handleDCS(char, code) {
    // Simplified DCS handling
    if (code === 0x1b) {
      this.state = ParserState.NORMAL;
    } else {
      this.buffer += char;
    }
  }
  
  handleOther(char, code) {
    // Handle other states
    this.state = ParserState.NORMAL;
  }
  
  handleControlChar(char, code) {
    this.flushText();
    
    switch (code) {
      case 0x07: // BEL
        this.emit('bell');
        break;
      case 0x08: // BS
        this.emit('backspace');
        break;
      case 0x09: // TAB
        this.emit('tab');
        break;
      case 0x0a: // LF
        this.emit('linefeed');
        break;
      case 0x0d: // CR
        this.emit('carriageReturn');
        break;
      default:
        // Other control characters
        break;
    }
  }
  
  handleSingleEscape(char) {
    switch (char) {
      case 'D': // Index
        this.emit('index');
        break;
      case 'M': // Reverse Index
        this.emit('reverseIndex');
        break;
      case 'E': // Next Line
        this.emit('nextLine');
        break;
      case 'c': // Reset
        this.emit('reset');
        break;
      case '7': // Save cursor
        this.emit('saveCursor');
        break;
      case '8': // Restore cursor
        this.emit('restoreCursor');
        break;
      case '=': // Application keypad
        this.emit('applicationKeypad', true);
        break;
      case '>': // Normal keypad
        this.emit('applicationKeypad', false);
        break;
    }
  }
  
  handleCSISequence() {
    const sequence = {
      type: SequenceType.UNKNOWN,
      params: this.params,
      intermediates: this.intermediates,
      finalChar: this.finalChar
    };
    
    switch (this.finalChar) {
      // Cursor movement
      case 'A': // Cursor Up
        sequence.type = SequenceType.CURSOR;
        sequence.action = 'up';
        sequence.count = this.params[0] || 1;
        break;
      case 'B': // Cursor Down
        sequence.type = SequenceType.CURSOR;
        sequence.action = 'down';
        sequence.count = this.params[0] || 1;
        break;
      case 'C': // Cursor Forward
        sequence.type = SequenceType.CURSOR;
        sequence.action = 'forward';
        sequence.count = this.params[0] || 1;
        break;
      case 'D': // Cursor Back
        sequence.type = SequenceType.CURSOR;
        sequence.action = 'back';
        sequence.count = this.params[0] || 1;
        break;
      case 'H': // Cursor Position
      case 'f':
        sequence.type = SequenceType.CURSOR;
        sequence.action = 'position';
        sequence.row = this.params[0] || 1;
        sequence.col = this.params[1] || 1;
        break;
      case 'G': // Cursor Horizontal Absolute
        sequence.type = SequenceType.CURSOR;
        sequence.action = 'column';
        sequence.col = this.params[0] || 1;
        break;
        
      // Erase
      case 'J': // Erase Display
        sequence.type = SequenceType.ERASE;
        sequence.action = 'display';
        sequence.mode = this.params[0] || 0;
        break;
      case 'K': // Erase Line
        sequence.type = SequenceType.ERASE;
        sequence.action = 'line';
        sequence.mode = this.params[0] || 0;
        break;
        
      // Graphics
      case 'm': // Select Graphic Rendition
        sequence.type = SequenceType.STYLE;
        sequence.styles = this.parseGraphicsParams();
        break;
        
      // Mode
      case 'h': // Set Mode
        sequence.type = SequenceType.MODE;
        sequence.action = 'set';
        sequence.private = this.intermediates.includes('?');
        break;
      case 'l': // Reset Mode
        sequence.type = SequenceType.MODE;
        sequence.action = 'reset';
        sequence.private = this.intermediates.includes('?');
        break;
        
      // Scrolling
      case 'S': // Scroll Up
        sequence.type = SequenceType.CURSOR;
        sequence.action = 'scrollUp';
        sequence.count = this.params[0] || 1;
        break;
      case 'T': // Scroll Down
        sequence.type = SequenceType.CURSOR;
        sequence.action = 'scrollDown';
        sequence.count = this.params[0] || 1;
        break;
    }
    
    this.emit('sequence', sequence);
  }
  
  handleOSCSequence() {
    const parts = this.buffer.split(';');
    const command = parseInt(parts[0], 10);
    
    switch (command) {
      case 0: // Set window title and icon
      case 2: // Set window title
        this.emit('title', parts.slice(1).join(';'));
        break;
      case 8: // Hyperlink
        const [params, url] = parts.slice(1).join(';').split(';');
        this.emit('hyperlink', { params, url });
        break;
    }
    
    this.buffer = '';
  }
  
  parseGraphicsParams() {
    const styles = [];
    
    for (let i = 0; i < this.params.length; i++) {
      const param = this.params[i] || 0;
      
      if (param === 0) {
        styles.push({ type: 'reset' });
      } else if (param === 1) {
        styles.push({ type: 'bold', value: true });
      } else if (param === 2) {
        styles.push({ type: 'dim', value: true });
      } else if (param === 3) {
        styles.push({ type: 'italic', value: true });
      } else if (param === 4) {
        styles.push({ type: 'underline', value: true });
      } else if (param === 5) {
        styles.push({ type: 'blink', value: true });
      } else if (param === 7) {
        styles.push({ type: 'reverse', value: true });
      } else if (param === 8) {
        styles.push({ type: 'hidden', value: true });
      } else if (param === 9) {
        styles.push({ type: 'strikethrough', value: true });
      } else if (param >= 30 && param <= 37) {
        styles.push({ type: 'fg', color: param - 30 });
      } else if (param >= 40 && param <= 47) {
        styles.push({ type: 'bg', color: param - 40 });
      } else if (param === 38) {
        // 256 color or RGB
        if (this.params[i + 1] === 5) {
          styles.push({ type: 'fg256', color: this.params[i + 2] });
          i += 2;
        } else if (this.params[i + 1] === 2) {
          styles.push({
            type: 'fgRGB',
            r: this.params[i + 2],
            g: this.params[i + 3],
            b: this.params[i + 4]
          });
          i += 4;
        }
      } else if (param === 48) {
        // 256 color or RGB background
        if (this.params[i + 1] === 5) {
          styles.push({ type: 'bg256', color: this.params[i + 2] });
          i += 2;
        } else if (this.params[i + 1] === 2) {
          styles.push({
            type: 'bgRGB',
            r: this.params[i + 2],
            g: this.params[i + 3],
            b: this.params[i + 4]
          });
          i += 4;
        }
      }
    }
    
    return styles;
  }
  
  flushText() {
    if (this.buffer) {
      this.emit('text', this.buffer);
      this.buffer = '';
    }
  }
  
  end() {
    this.flushText();
    this.reset();
  }
}

module.exports = {
  ParserState,
  SequenceType,
  ANSIParser
};