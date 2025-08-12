import { useState, useRef, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, IconButton } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import styled from 'styled-components';
import Terminal from './components/Terminal';
import InputArea from './components/InputArea';
import SettingsDialog from './components/SettingsDialog';
import { Message } from './types';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#007ACC',
    },
    background: {
      default: '#1e1e1e',
      paper: '#252526',
    },
    text: {
      primary: '#cccccc',
      secondary: '#858585',
    },
  },
  typography: {
    fontFamily: '"Cascadia Code", "Consolas", monospace',
    fontSize: 14,
  },
});

const AppContainer = styled(Box)`
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #1e1e1e;
`;

const Header = styled(Box)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background-color: #2d2d30;
  border-bottom: 1px solid #3e3e42;
`;

const Title = styled.h1`
  font-size: 14px;
  color: #cccccc;
  margin: 0;
  font-weight: normal;
`;

const MainContent = styled(Box)`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imageSavePath, setImageSavePath] = useState('');
  const [_isClaudeReady, setIsClaudeReady] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load settings
    if (window.electronAPI?.settingsGet) {
      window.electronAPI.settingsGet().then(settings => {
        if (settings?.imageSavePath) {
          setImageSavePath(settings.imageSavePath);
        }
      }).catch(error => {
        console.error('Failed to load settings:', error);
      });
    }

    // Initialize Claude service
    if (window.electronAPI?.claudeInitialize) {
      window.electronAPI.claudeInitialize().then(result => {
        if (!result.success) {
          console.error('Failed to initialize Claude:', result.error);
        }
      }).catch(error => {
        console.error('Failed to initialize Claude service:', error);
      });
    }

    // Set up Claude event listeners
    if (window.electronAPI?.onClaudeMessage) {
      window.electronAPI.onClaudeMessage((message) => {
      const claudeMessage: Message = {
        id: Date.now().toString(),
        content: message.content,
        type: 'assistant',
        timestamp: new Date(message.timestamp)
      };
      setMessages(prev => [...prev, claudeMessage]);
      });
    }

    if (window.electronAPI?.onClaudeError) {
      window.electronAPI.onClaudeError((error) => {
      console.error('Claude error:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: `Error: ${error}`,
        type: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      });
    }

    if (window.electronAPI?.onClaudeReady) {
      window.electronAPI.onClaudeReady(() => {
        setIsClaudeReady(true);
      });
    }

    // Check Claude status on mount
    if (window.electronAPI?.claudeStatus) {
      window.electronAPI.claudeStatus().then(status => {
        setIsClaudeReady(status.isRunning);
      }).catch(error => {
        console.error('Failed to check Claude status:', error);
      });
    }
  }, []);

  const handleSendMessage = async (content: string, images?: string[]) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      type: 'user',
      timestamp: new Date(),
      images
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    // Send message to Claude
    if (!window.electronAPI?.claudeSendMessage) {
      console.error('Claude API not available');
      return;
    }
    const result = await window.electronAPI.claudeSendMessage(content);
    if (!result.success) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Failed to send message: ${result.error}`,
        type: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleImagePaste = async (_file: File): Promise<string | null> => {
    if (!imageSavePath) {
      console.error('Image save path not configured');
      return null;
    }

    try {
      if (!window.electronAPI?.saveImageFromClipboard) {
        console.error('Image save API not available');
        return null;
      }
      const result = await window.electronAPI.saveImageFromClipboard(imageSavePath);
      if (result.success && result.path) {
        return result.path;
      } else {
        console.error('Failed to save image:', result.error);
        return null;
      }
    } catch (error) {
      console.error('Error saving image:', error);
      return null;
    }
  };

  const handleSettingsSave = async (settings: { imageSavePath: string }) => {
    setImageSavePath(settings.imageSavePath);
    if (window.electronAPI?.settingsSet) {
      await window.electronAPI.settingsSet(settings);
    }
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <AppContainer>
        <Header>
          <Title>Claudius Gate - Claude Code GUI</Title>
          <IconButton 
            size="small" 
            onClick={() => setSettingsOpen(true)}
            sx={{ color: '#cccccc' }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Header>
        <MainContent>
          <Terminal messages={messages} ref={terminalRef} />
          <InputArea 
            onSendMessage={handleSendMessage}
            onImagePaste={handleImagePaste}
            imageEnabled={!!imageSavePath}
          />
        </MainContent>
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSettingsSave}
          initialPath={imageSavePath}
        />
      </AppContainer>
    </ThemeProvider>
  );
}

export default App;