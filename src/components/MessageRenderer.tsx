import React from 'react';
import styled from 'styled-components';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const MessageWrapper = styled.div`
  color: #cccccc;
  line-height: 1.6;
  
  h1, h2, h3, h4, h5, h6 {
    color: #569cd6;
    margin: 16px 0 8px 0;
  }
  
  p {
    margin: 8px 0;
  }
  
  ul, ol {
    margin: 8px 0;
    padding-left: 24px;
  }
  
  blockquote {
    border-left: 3px solid #569cd6;
    padding-left: 16px;
    margin: 8px 0;
    color: #9cdcfe;
    font-style: italic;
  }
  
  code {
    background-color: #2d2d30;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Cascadia Code', 'Consolas', monospace;
    color: #ce9178;
  }
  
  pre {
    margin: 8px 0;
  }
  
  a {
    color: #569cd6;
    text-decoration: none;
    
    &:hover {
      text-decoration: underline;
    }
  }
  
  table {
    border-collapse: collapse;
    margin: 16px 0;
  }
  
  th, td {
    border: 1px solid #3e3e42;
    padding: 8px;
  }
  
  th {
    background-color: #2d2d30;
    color: #569cd6;
  }
  
  hr {
    border: none;
    border-top: 1px solid #3e3e42;
    margin: 16px 0;
  }
`;

const ToolUseBlock = styled.div`
  background-color: #1e1e1e;
  border: 1px solid #007acc;
  border-radius: 4px;
  padding: 8px 12px;
  margin: 8px 0;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  
  &::before {
    content: '🔧 ';
    margin-right: 4px;
  }
`;

const ThinkingBlock = styled.div`
  color: #808080;
  font-style: italic;
  padding: 4px 0;
  
  &::before {
    content: '💭 ';
    margin-right: 4px;
  }
`;

const ErrorBlock = styled.div`
  background-color: #3c1e1e;
  border: 1px solid #f48771;
  border-radius: 4px;
  padding: 8px 12px;
  margin: 8px 0;
  color: #f48771;
`;

interface MessageRendererProps {
  content: string;
  type?: 'message' | 'tool_use' | 'thinking' | 'error';
}

const MessageRenderer: React.FC<MessageRendererProps> = ({ content, type = 'message' }) => {
  // Handle special message types
  if (type === 'tool_use') {
    return <ToolUseBlock>{content}</ToolUseBlock>;
  }
  
  if (type === 'thinking') {
    return <ThinkingBlock>{content}</ThinkingBlock>;
  }
  
  if (type === 'error') {
    return <ErrorBlock>{content}</ErrorBlock>;
  }
  
  // Parse content for tool usage indicators
  const hasToolUsage = content.includes('Using tool:') || 
                       content.includes('Tool:') || 
                       content.includes('[Tool:');
  
  if (hasToolUsage) {
    // Split content by tool usage patterns
    const parts = content.split(/(\[?(?:Using tool:|Tool:)[^\]]*\]?)/);
    
    return (
      <MessageWrapper>
        {parts.map((part, index) => {
          if (part.match(/\[?(?:Using tool:|Tool:)/)) {
            return <ToolUseBlock key={index}>{part}</ToolUseBlock>;
          }
          
          if (!part.trim()) return null;
          
          return (
            <ReactMarkdown
              key={index}
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            >
              {part}
            </ReactMarkdown>
          );
        })}
      </MessageWrapper>
    );
  }
  
  // Regular markdown rendering
  return (
    <MessageWrapper>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </MessageWrapper>
  );
};

export default MessageRenderer;