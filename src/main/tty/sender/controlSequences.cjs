// TTY Control Sequences Encoder
// ANSI/VT100 제어 시퀀스 인코딩

const ESC = '\x1b';
const CSI = ESC + '[';

// 커서 제어
const cursor = {
  // 커서 위치 이동
  moveTo: (row, col) => `${CSI}${row};${col}H`,
  moveUp: (n = 1) => `${CSI}${n}A`,
  moveDown: (n = 1) => `${CSI}${n}B`,
  moveRight: (n = 1) => `${CSI}${n}C`,
  moveLeft: (n = 1) => `${CSI}${n}D`,
  
  // 커서 저장/복원
  save: () => ESC + '7',
  restore: () => ESC + '8',
  
  // 커서 표시/숨김
  show: () => `${CSI}?25h`,
  hide: () => `${CSI}?25l`,
  
  // 홈 위치로
  home: () => `${CSI}H`,
  
  // 다음/이전 줄
  nextLine: (n = 1) => `${CSI}${n}E`,
  prevLine: (n = 1) => `${CSI}${n}F`,
  
  // 절대 위치
  column: (n) => `${CSI}${n}G`
};

// 화면 제어
const screen = {
  // 화면 지우기
  clear: () => `${CSI}2J${CSI}H`,
  clearFromCursor: () => `${CSI}0J`,
  clearToCursor: () => `${CSI}1J`,
  
  // 줄 지우기
  clearLine: () => `${CSI}2K`,
  clearLineFromCursor: () => `${CSI}0K`,
  clearLineToCursor: () => `${CSI}1K`,
  
  // 스크롤
  scrollUp: (n = 1) => `${CSI}${n}S`,
  scrollDown: (n = 1) => `${CSI}${n}T`,
  
  // 스크롤 영역 설정
  setScrollRegion: (top, bottom) => `${CSI}${top};${bottom}r`,
  resetScrollRegion: () => `${CSI}r`
};

// 텍스트 속성
const text = {
  // 스타일
  reset: () => `${CSI}0m`,
  bold: () => `${CSI}1m`,
  dim: () => `${CSI}2m`,
  italic: () => `${CSI}3m`,
  underline: () => `${CSI}4m`,
  blink: () => `${CSI}5m`,
  reverse: () => `${CSI}7m`,
  hidden: () => `${CSI}8m`,
  strikethrough: () => `${CSI}9m`,
  
  // 스타일 해제
  noBold: () => `${CSI}22m`,
  noItalic: () => `${CSI}23m`,
  noUnderline: () => `${CSI}24m`,
  noBlink: () => `${CSI}25m`,
  noReverse: () => `${CSI}27m`,
  noHidden: () => `${CSI}28m`,
  noStrikethrough: () => `${CSI}29m`,
  
  // 색상 (3/4비트)
  fgColor: (code) => `${CSI}${30 + code}m`,
  bgColor: (code) => `${CSI}${40 + code}m`,
  
  // 256색
  fg256: (n) => `${CSI}38;5;${n}m`,
  bg256: (n) => `${CSI}48;5;${n}m`,
  
  // RGB 트루컬러
  fgRGB: (r, g, b) => `${CSI}38;2;${r};${g};${b}m`,
  bgRGB: (r, g, b) => `${CSI}48;2;${r};${g};${b}m`,
  
  // 기본 색상으로 리셋
  defaultFg: () => `${CSI}39m`,
  defaultBg: () => `${CSI}49m`
};

// 터미널 모드
const mode = {
  // 대체 스크린 버퍼
  alternateScreen: () => `${CSI}?1049h`,
  normalScreen: () => `${CSI}?1049l`,
  
  // 마우스 추적
  mouseTracking: () => `${CSI}?1000h`,
  noMouseTracking: () => `${CSI}?1000l`,
  
  // 자동 줄바꿈
  autowrap: () => `${CSI}?7h`,
  noAutowrap: () => `${CSI}?7l`,
  
  // 브래킷 붙여넣기 모드
  bracketedPaste: () => `${CSI}?2004h`,
  noBracketedPaste: () => `${CSI}?2004l`,
  
  // 애플리케이션 키패드
  applicationKeypad: () => ESC + '=',
  normalKeypad: () => ESC + '>',
  
  // 원시 모드 (raw mode) - node.js용
  setRawMode: (enable) => {
    if (enable) {
      return [
        mode.alternateScreen(),
        mode.mouseTracking(),
        cursor.hide(),
        mode.noBracketedPaste()
      ].join('');
    } else {
      return [
        mode.normalScreen(),
        mode.noMouseTracking(),
        cursor.show(),
        mode.bracketedPaste()
      ].join('');
    }
  }
};

// 벨/비프
const bell = () => '\x07';

// 제목 설정
const title = {
  set: (str) => `${ESC}]0;${str}\x07`,
  setWindow: (str) => `${ESC}]2;${str}\x07`,
  setTab: (str) => `${ESC}]1;${str}\x07`
};

// 하이퍼링크
const hyperlink = {
  start: (url, id = '') => `${ESC}]8;${id ? `id=${id}` : ''};${url}\x07`,
  end: () => `${ESC}]8;;\x07`
};

// 조합 함수
const compose = (...sequences) => sequences.join('');

// 텍스트 래핑
const wrapText = (text, ...styles) => {
  const styleSeq = styles.map(style => 
    typeof style === 'function' ? style() : style
  ).join('');
  return styleSeq + text + text.reset();
};

module.exports = {
  ESC,
  CSI,
  cursor,
  screen,
  text,
  mode,
  bell,
  title,
  hyperlink,
  compose,
  wrapText
};