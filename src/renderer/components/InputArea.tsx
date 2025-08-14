import React, { useState, useRef, KeyboardEvent, ClipboardEvent } from 'react';
import { Box, IconButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import styled from 'styled-components';

const InputContainer = styled(Box)`
  display: flex;
  padding: 16px;
  background-color: #252526;
  border-top: 1px solid #3e3e42;
  gap: 8px;
  align-items: flex-end;
`;

const TextArea = styled.textarea`
  flex: 1;
  background-color: #1e1e1e;
  color: #cccccc;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 8px 12px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-size: 14px;
  resize: none;
  min-height: 40px;
  max-height: 200px;
  outline: none;
  
  &:focus {
    border-color: #007acc;
  }
  
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: #1e1e1e;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #424242;
    border-radius: 4px;
  }
`;

const ImagePreviewContainer = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
`;

const ImagePreview = styled.div`
  position: relative;
  display: inline-block;
  
  img {
    max-width: 100px;
    max-height: 100px;
    border: 1px solid #3e3e42;
    border-radius: 4px;
  }
  
  button {
    position: absolute;
    top: -8px;
    right: -8px;
    background: #f44336;
    color: white;
    border: none;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

interface InputAreaProps {
  onSendMessage: (message: string, images?: string[]) => void;
  onImagePaste?: (file: File) => Promise<string | null>;
  imageEnabled?: boolean;
}

const InputArea: React.FC<InputAreaProps> = ({ 
  onSendMessage, 
  onImagePaste,
  imageEnabled = false 
}) => {
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextAreaHeight = () => {
    const textArea = textAreaRef.current;
    if (textArea) {
      textArea.style.height = 'auto';
      textArea.style.height = `${Math.min(textArea.scrollHeight, 200)}px`;
    }
  };

  const handleSend = () => {
    if (input.trim() || attachedImages.length > 0) {
      onSendMessage(input.trim(), attachedImages.length > 0 ? attachedImages : undefined);
      setInput('');
      setAttachedImages([]);
      if (textAreaRef.current) {
        textAreaRef.current.style.height = '40px';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 입력 중에는 엔터 키 처리하지 않음
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!imageEnabled || !onImagePaste) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const path = await onImagePaste(file);
          if (path) {
            setAttachedImages(prev => [...prev, path]);
          }
        }
      }
    }
  };

  const removeImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileSelect = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && onImagePaste) {
        for (const file of Array.from(files)) {
          const path = await onImagePaste(file);
          if (path) {
            setAttachedImages(prev => [...prev, path]);
          }
        }
      }
    };
    
    input.click();
  };

  return (
    <Box>
      {attachedImages.length > 0 && (
        <ImagePreviewContainer style={{ padding: '8px 16px 0' }}>
          {attachedImages.map((image, index) => (
            <ImagePreview key={index}>
              <img src={image} alt={`Attached ${index + 1}`} />
              <button onClick={() => removeImage(index)}>×</button>
            </ImagePreview>
          ))}
        </ImagePreviewContainer>
      )}
      <InputContainer>
        <TextArea
          ref={textAreaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            adjustTextAreaHeight();
          }}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onPaste={handlePaste}
          placeholder="Type a message... (Shift+Enter for new line)"
        />
        {imageEnabled && (
          <IconButton 
            onClick={handleFileSelect}
            size="small"
            sx={{ color: '#858585' }}
          >
            <AttachFileIcon />
          </IconButton>
        )}
        <IconButton 
          onClick={handleSend}
          size="small"
          sx={{ color: '#007acc' }}
          disabled={!input.trim() && attachedImages.length === 0}
        >
          <SendIcon />
        </IconButton>
      </InputContainer>
    </Box>
  );
};

export default InputArea;