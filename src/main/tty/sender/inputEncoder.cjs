// TTY Input Encoder
// 키보드 입력과 특수 키를 TTY 시퀀스로 변환

const os = require('os');

// 특수 키 코드
const KEY_CODES = {
  NULL: '\x00',
  SOH: '\x01',  // Ctrl+A
  STX: '\x02',  // Ctrl+B
  ETX: '\x03',  // Ctrl+C (interrupt)
  EOT: '\x04',  // Ctrl+D (EOF)
  ENQ: '\x05',  // Ctrl+E
  ACK: '\x06',  // Ctrl+F
  BEL: '\x07',  // Bell
  BS: '\x08',   // Backspace
  TAB: '\x09',  // Tab
  LF: '\x0a',   // Line Feed (Unix newline)
  VT: '\x0b',   // Vertical Tab
  FF: '\x0c',   // Form Feed
  CR: '\x0d',   // Carriage Return
  SO: '\x0e',   // Shift Out
  SI: '\x0f',   // Shift In
  DLE: '\x10',  // Ctrl+P
  DC1: '\x11',  // Ctrl+Q (XON)
  DC2: '\x12',  // Ctrl+R
  DC3: '\x13',  // Ctrl+S (XOFF)
  DC4: '\x14',  // Ctrl+T
  NAK: '\x15',  // Ctrl+U
  SYN: '\x16',  // Ctrl+V
  ETB: '\x17',  // Ctrl+W
  CAN: '\x18',  // Ctrl+X
  EM: '\x19',   // Ctrl+Y
  SUB: '\x1a',  // Ctrl+Z (suspend)
  ESC: '\x1b',  // Escape
  FS: '\x1c',   // Ctrl+\
  GS: '\x1d',   // Ctrl+]
  RS: '\x1e',   // Ctrl+^
  US: '\x1f',   // Ctrl+_
  DEL: '\x7f'   // Delete
};

// 화살표 키
const ARROW_KEYS = {
  UP: '\x1b[A',
  DOWN: '\x1b[B',
  RIGHT: '\x1b[C',
  LEFT: '\x1b[D',
  
  // 애플리케이션 모드
  APP_UP: '\x1bOA',
  APP_DOWN: '\x1bOB',
  APP_RIGHT: '\x1bOC',
  APP_LEFT: '\x1bOD'
};

// 기능 키
const FUNCTION_KEYS = {
  F1: '\x1bOP',
  F2: '\x1bOQ',
  F3: '\x1bOR',
  F4: '\x1bOS',
  F5: '\x1b[15~',
  F6: '\x1b[17~',
  F7: '\x1b[18~',
  F8: '\x1b[19~',
  F9: '\x1b[20~',
  F10: '\x1b[21~',
  F11: '\x1b[23~',
  F12: '\x1b[24~'
};

// 편집 키
const EDIT_KEYS = {
  INSERT: '\x1b[2~',
  DELETE: '\x1b[3~',
  HOME: '\x1b[1~',
  END: '\x1b[4~',
  PAGE_UP: '\x1b[5~',
  PAGE_DOWN: '\x1b[6~',
  
  // 대체 시퀀스
  ALT_HOME: '\x1b[H',
  ALT_END: '\x1b[F'
};

// 수정자 키 조합
const withModifiers = (baseSeq, shift = false, alt = false, ctrl = false) => {
  let modifier = 1;
  if (shift) modifier += 1;
  if (alt) modifier += 2;
  if (ctrl) modifier += 4;
  
  if (modifier === 1) return baseSeq;
  
  // CSI 시퀀스 수정
  if (baseSeq.startsWith('\x1b[')) {
    const parts = baseSeq.slice(2).split(/([A-Za-z~])/);
    const letter = parts[1];
    const prefix = parts[0] || '';
    return `\x1b[${prefix}${modifier}${letter}`;
  }
  
  return baseSeq;
};

// 텍스트 입력 인코딩
const encodeText = (text, encoding = 'utf8') => {
  const buffer = Buffer.from(text, encoding);
  return buffer.toString('binary');
};

// 줄바꿈 처리
const encodeNewline = (platform = os.platform()) => {
  switch (platform) {
    case 'win32':
      return '\r\n';
    case 'darwin':
    case 'linux':
    default:
      return '\n';
  }
};

// 붙여넣기 브래킷 모드
const encodePaste = (text) => {
  return '\x1b[200~' + text + '\x1b[201~';
};

// Ctrl 키 조합
const encodeCtrl = (char) => {
  const upperChar = char.toUpperCase();
  const charCode = upperChar.charCodeAt(0);
  
  if (charCode >= 64 && charCode <= 95) {
    return String.fromCharCode(charCode - 64);
  }
  
  return null;
};

// Alt 키 조합 (Meta)
const encodeAlt = (char) => {
  return '\x1b' + char;
};

// 마우스 이벤트 인코딩 (X10 프로토콜)
const encodeMouse = (button, x, y, pressed = true) => {
  let code = button;
  if (!pressed) code += 3;
  
  // 좌표는 1-based
  x = Math.min(Math.max(x + 1, 1), 223);
  y = Math.min(Math.max(y + 1, 1), 223);
  
  return `\x1b[M${String.fromCharCode(32 + code)}${String.fromCharCode(32 + x)}${String.fromCharCode(32 + y)}`;
};

// SGR 마우스 모드 (확장 좌표)
const encodeSGRMouse = (button, x, y, pressed = true) => {
  const action = pressed ? 'M' : 'm';
  return `\x1b[<${button};${x + 1};${y + 1}${action}`;
};

// 특수 시퀀스 탐지
const isSpecialSequence = (input) => {
  if (input.length === 0) return false;
  
  // ESC 시퀀스
  if (input[0] === '\x1b') return true;
  
  // 제어 문자
  const charCode = input.charCodeAt(0);
  if (charCode < 32 || charCode === 127) return true;
  
  return false;
};

// 입력 스트림 인코딩
class InputEncoder {
  constructor(options = {}) {
    this.platform = options.platform || os.platform();
    this.applicationMode = options.applicationMode || false;
    this.mouseTracking = options.mouseTracking || false;
    this.bracketedPaste = options.bracketedPaste || false;
  }
  
  encode(input, type = 'text') {
    switch (type) {
      case 'text':
        return this.encodeText(input);
      case 'key':
        return this.encodeKey(input);
      case 'paste':
        return this.encodePaste(input);
      case 'mouse':
        return this.encodeMouse(input);
      default:
        return input;
    }
  }
  
  encodeText(text) {
    // 줄바꿈 변환
    const newline = encodeNewline(this.platform);
    return text.replace(/\n/g, newline);
  }
  
  encodeKey(key) {
    // 특수 키 매핑
    if (KEY_CODES[key]) return KEY_CODES[key];
    if (ARROW_KEYS[key]) {
      return this.applicationMode ? 
        ARROW_KEYS[`APP_${key}`] : 
        ARROW_KEYS[key];
    }
    if (FUNCTION_KEYS[key]) return FUNCTION_KEYS[key];
    if (EDIT_KEYS[key]) return EDIT_KEYS[key];
    
    // Ctrl/Alt 조합
    if (key.startsWith('Ctrl+')) {
      const char = key.slice(5);
      return encodeCtrl(char);
    }
    if (key.startsWith('Alt+')) {
      const char = key.slice(4);
      return encodeAlt(char);
    }
    
    return key;
  }
  
  encodePaste(text) {
    if (this.bracketedPaste) {
      return encodePaste(text);
    }
    return this.encodeText(text);
  }
  
  encodeMouse(event) {
    if (!this.mouseTracking) return '';
    
    const { button, x, y, pressed, sgr } = event;
    
    if (sgr) {
      return encodeSGRMouse(button, x, y, pressed);
    }
    return encodeMouse(button, x, y, pressed);
  }
  
  setApplicationMode(enabled) {
    this.applicationMode = enabled;
  }
  
  setMouseTracking(enabled) {
    this.mouseTracking = enabled;
  }
  
  setBracketedPaste(enabled) {
    this.bracketedPaste = enabled;
  }
}

module.exports = {
  KEY_CODES,
  ARROW_KEYS,
  FUNCTION_KEYS,
  EDIT_KEYS,
  withModifiers,
  encodeText,
  encodeNewline,
  encodePaste,
  encodeCtrl,
  encodeAlt,
  encodeMouse,
  encodeSGRMouse,
  isSpecialSequence,
  InputEncoder
};