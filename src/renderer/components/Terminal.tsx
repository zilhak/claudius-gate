import { forwardRef } from 'react';
import { Box } from '@mui/material';
import styled from 'styled-components';
import { Message } from '../types';

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
  color: ${props => props.$type === 'user' ? '#569cd6' : '#cccccc'};
  
  &::before {
    content: ${props => props.$type === 'user' ? '">"' : '"$"'};
    margin-right: 8px;
    color: ${props => props.$type === 'user' ? '#569cd6' : '#4ec9b0'};
    font-weight: bold;
  }
`;

const MessageContent = styled.pre`
  display: inline;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  font-family: inherit;
`;

const ImagePreview = styled.img`
  max-width: 300px;
  max-height: 200px;
  margin-top: 8px;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  display: block;
`;

interface TerminalProps {
  messages: Message[];
}

const Terminal = forwardRef<HTMLDivElement, TerminalProps>(({ messages }, ref) => {
  return (
    <TerminalContainer ref={ref}>
      {messages.map((message) => (
        <MessageContainer key={message.id} $type={message.type}>
          <MessageContent>{message.content}</MessageContent>
          {message.images?.map((image, index) => (
            <ImagePreview key={index} src={image} alt={`Image ${index + 1}`} />
          ))}
        </MessageContainer>
      ))}
    </TerminalContainer>
  );
});

Terminal.displayName = 'Terminal';

export default Terminal;