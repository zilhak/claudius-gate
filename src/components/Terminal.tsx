import { forwardRef } from 'react';
import { Box, CircularProgress } from '@mui/material';
import styled from 'styled-components';
import { Message } from '../types';
import MessageRenderer from './MessageRenderer';

const TerminalContainer = styled(Box)`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background-color: #1e1e1e;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-size: 14px;
  
  &::-webkit-scrollbar {
    width: 10px;
  }
  
  &::-webkit-scrollbar-track {
    background: #1e1e1e;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #424242;
    border-radius: 5px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: #4f4f4f;
  }
`;

const MessageContainer = styled.div<{ $type: string }>`
  margin-bottom: 16px;
  
  &::before {
    content: ${props => {
      switch(props.$type) {
        case 'user': return '">"';
        case 'assistant': return '"$"';
        case 'thinking': return '"💭"';
        case 'tool_use': return '"🔧"';
        case 'system': return '"ℹ️"';
        case 'error': return '"❌"';
        default: return '""';
      }
    }};
    margin-right: 8px;
    color: ${props => {
      switch(props.$type) {
        case 'user': return '#569cd6';
        case 'assistant': return '#4ec9b0';
        case 'thinking': return '#808080';
        case 'tool_use': return '#d7ba7d';
        case 'system': return '#9cdcfe';
        case 'error': return '#f48771';
        default: return '#cccccc';
      }
    }};
    font-weight: bold;
    vertical-align: top;
    display: inline-block;
  }
`;

const MessageContentWrapper = styled.div`
  display: inline-block;
  width: calc(100% - 32px);
  vertical-align: top;
`;

const ImagePreview = styled.img`
  max-width: 300px;
  max-height: 200px;
  margin-top: 8px;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  display: block;
`;

const LoadingIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: #808080;
  font-style: italic;
  padding: 8px 0;
`;

interface TerminalProps {
  messages: Message[];
  isLoading?: boolean;
  currentStatus?: string;
}

const Terminal = forwardRef<HTMLDivElement, TerminalProps>(({ messages, isLoading, currentStatus }, ref) => {
  return (
    <TerminalContainer ref={ref}>
      {messages.map((message) => (
        <MessageContainer key={message.id} $type={message.type}>
          <MessageContentWrapper>
            <MessageRenderer 
              content={message.content} 
              type={message.type as any}
            />
            {message.images?.map((image, index) => (
              <ImagePreview key={index} src={image} alt={`Image ${index + 1}`} />
            ))}
          </MessageContentWrapper>
        </MessageContainer>
      ))}
      
      {isLoading && (
        <LoadingIndicator>
          <CircularProgress size={16} style={{ color: '#569cd6' }} />
          <span>{currentStatus || 'Claude is thinking...'}</span>
        </LoadingIndicator>
      )}
    </TerminalContainer>
  );
});

Terminal.displayName = 'Terminal';

export default Terminal;