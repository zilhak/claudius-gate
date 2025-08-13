// Binary Data Decoder for Electron/Browser Environment
// 바이너리 데이터와 특수 문자를 안전하게 처리

const { EventEmitter } = require('events');

// 바이너리 데이터 처리 모드
const DecoderMode = {
  UTF8: 'utf8',
  BINARY: 'binary',
  BASE64: 'base64',
  HEX: 'hex',
  RAW: 'raw'
};

class BinaryDecoder extends EventEmitter {
  constructor(options = {}) {
    super();
    this.mode = options.mode || DecoderMode.UTF8;
    this.bufferSize = options.bufferSize || 65536; // 64KB
    this.incompleteSequence = null;
    this.buffer = Buffer.alloc(0);
  }
  
  // Electron IPC에서 안전하게 바이너리 데이터 수신
  decodeFromIPC(data) {
    // Electron IPC는 바이너리를 Uint8Array로 전송
    if (data instanceof Uint8Array) {
      return this.decodeUint8Array(data);
    }
    
    // Base64로 인코딩된 경우
    if (typeof data === 'string' && this.isBase64(data)) {
      return this.decodeBase64(data);
    }
    
    // 일반 문자열
    if (typeof data === 'string') {
      return this.decodeString(data);
    }
    
    // Buffer 객체
    if (Buffer.isBuffer(data)) {
      return this.decodeBuffer(data);
    }
    
    throw new Error('Unsupported data type');
  }
  
  // Uint8Array 디코딩 (Electron에서 주로 사용)
  decodeUint8Array(uint8Array) {
    const buffer = Buffer.from(uint8Array);
    return this.processBuffer(buffer);
  }
  
  // Base64 디코딩
  decodeBase64(base64String) {
    try {
      const buffer = Buffer.from(base64String, 'base64');
      return this.processBuffer(buffer);
    } catch (error) {
      this.emit('error', `Base64 decode error: ${error.message}`);
      return null;
    }
  }
  
  // 문자열 디코딩
  decodeString(str) {
    // 특수 문자와 제어 문자 보존
    const buffer = Buffer.from(str, 'binary');
    return this.processBuffer(buffer);
  }
  
  // Buffer 디코딩
  decodeBuffer(buffer) {
    return this.processBuffer(buffer);
  }
  
  // 버퍼 처리 (UTF-8 시퀀스 처리 포함)
  processBuffer(buffer) {
    // 이전 불완전 시퀀스와 합치기
    if (this.incompleteSequence) {
      buffer = Buffer.concat([this.incompleteSequence, buffer]);
      this.incompleteSequence = null;
    }
    
    const result = {
      text: '',
      binary: [],
      control: [],
      errors: []
    };
    
    let i = 0;
    while (i < buffer.length) {
      const byte = buffer[i];
      
      // 제어 문자 (0x00-0x1F, 0x7F)
      if (byte < 0x20 || byte === 0x7F) {
        result.control.push({
          position: i,
          byte: byte,
          char: String.fromCharCode(byte)
        });
        result.text += String.fromCharCode(byte);
        i++;
        continue;
      }
      
      // ASCII (0x20-0x7E)
      if (byte < 0x80) {
        result.text += String.fromCharCode(byte);
        i++;
        continue;
      }
      
      // UTF-8 멀티바이트 시퀀스
      const sequenceLength = this.getUTF8SequenceLength(byte);
      if (sequenceLength > 0) {
        if (i + sequenceLength <= buffer.length) {
          const sequence = buffer.slice(i, i + sequenceLength);
          const decoded = this.decodeUTF8Sequence(sequence);
          if (decoded) {
            result.text += decoded;
            i += sequenceLength;
          } else {
            // 잘못된 UTF-8 시퀀스
            result.binary.push({
              position: i,
              bytes: Array.from(sequence)
            });
            result.errors.push({
              position: i,
              type: 'invalid_utf8',
              bytes: Array.from(sequence)
            });
            i++;
          }
        } else {
          // 불완전한 시퀀스 - 다음 청크를 기다림
          this.incompleteSequence = buffer.slice(i);
          break;
        }
      } else {
        // 바이너리 데이터
        result.binary.push({
          position: i,
          byte: byte
        });
        i++;
      }
    }
    
    this.emit('decoded', result);
    return result;
  }
  
  // UTF-8 시퀀스 길이 계산
  getUTF8SequenceLength(firstByte) {
    if ((firstByte & 0x80) === 0) return 1;      // 0xxxxxxx
    if ((firstByte & 0xE0) === 0xC0) return 2;   // 110xxxxx
    if ((firstByte & 0xF0) === 0xE0) return 3;   // 1110xxxx
    if ((firstByte & 0xF8) === 0xF0) return 4;   // 11110xxx
    return 0; // Invalid
  }
  
  // UTF-8 시퀀스 디코딩
  decodeUTF8Sequence(bytes) {
    try {
      return bytes.toString('utf8');
    } catch (error) {
      return null;
    }
  }
  
  // Base64 검증
  isBase64(str) {
    if (str.length % 4 !== 0) return false;
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
  }
  
  // 특수 문자 이스케이프 (렌더링용)
  escapeForDisplay(text) {
    const escapeMap = {
      '\x00': '\\0',
      '\x01': '\\x01',
      '\x02': '\\x02',
      '\x03': '\\x03',
      '\x04': '\\x04',
      '\x05': '\\x05',
      '\x06': '\\x06',
      '\x07': '\\a',
      '\x08': '\\b',
      '\x09': '\\t',
      '\x0A': '\\n',
      '\x0B': '\\v',
      '\x0C': '\\f',
      '\x0D': '\\r',
      '\x1B': '\\e',
      '\x7F': '\\x7F'
    };
    
    return text.replace(/[\x00-\x1F\x7F]/g, (char) => {
      return escapeMap[char] || `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`;
    });
  }
  
  // 바이너리 데이터를 안전한 형식으로 변환
  toSafeFormat(buffer) {
    switch (this.mode) {
      case DecoderMode.BASE64:
        return buffer.toString('base64');
      case DecoderMode.HEX:
        return buffer.toString('hex');
      case DecoderMode.UTF8:
        return buffer.toString('utf8', 0, buffer.length);
      case DecoderMode.BINARY:
        return Array.from(buffer);
      case DecoderMode.RAW:
      default:
        return buffer;
    }
  }
  
  // Electron IPC를 위한 안전한 인코딩
  encodeForIPC(data) {
    if (typeof data === 'string') {
      // 문자열은 그대로 전송 가능
      return data;
    }
    
    if (Buffer.isBuffer(data)) {
      // Buffer는 Uint8Array로 변환
      return new Uint8Array(data);
    }
    
    if (data instanceof Uint8Array) {
      return data;
    }
    
    // 기타 데이터는 Base64로 인코딩
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }
  
  reset() {
    this.incompleteSequence = null;
    this.buffer = Buffer.alloc(0);
  }
}

// Electron 렌더러 프로세스용 헬퍼
class ElectronTTYReceiver {
  constructor() {
    this.decoder = new BinaryDecoder();
    this.chunks = [];
  }
  
  // IPC에서 청크 수신
  receiveChunk(chunk) {
    // Electron IPC는 자동으로 직렬화/역직렬화
    if (chunk.type === 'binary') {
      // 바이너리 데이터
      const buffer = Buffer.from(chunk.data);
      return this.decoder.decodeBuffer(buffer);
    } else if (chunk.type === 'text') {
      // 텍스트 데이터
      return this.decoder.decodeString(chunk.data);
    } else if (chunk.type === 'base64') {
      // Base64 인코딩된 데이터
      return this.decoder.decodeBase64(chunk.data);
    }
  }
  
  // 스트림 종료
  end() {
    this.decoder.reset();
    this.chunks = [];
  }
}

module.exports = {
  DecoderMode,
  BinaryDecoder,
  ElectronTTYReceiver
};