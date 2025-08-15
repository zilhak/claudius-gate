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
  font-weight: normal;
  color: #cccccc;
  margin: 0;
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
  const [apiEndpoint, setApiEndpoint] = useState('http://localhost:8000');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('');
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [apiEndpoint]);

  const connectWebSocket = () => {
    const wsUrl = apiEndpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
    
    try {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setCurrentStatus('Connected to Claude');
      };

      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'message') {
          const message: Message = {
            id: Date.now().toString(),
            content: data.content,
            type: data.role === 'user' ? 'user' : 'assistant',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, message]);
          setIsLoading(false);
        } else if (data.type === 'status') {
          setCurrentStatus(data.content);
        } else if (data.type === 'partial') {
          // Handle streaming responses
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage && lastMessage.type === 'assistant') {
              return prev.slice(0, -1).concat({
                ...lastMessage,
                content: lastMessage.content + data.content
              });
            } else {
              return [...prev, {
                id: Date.now().toString(),
                content: data.content,
                type: 'assistant',
                timestamp: new Date()
              }];
            }
          });
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setCurrentStatus('Connection error');
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setCurrentStatus('Disconnected');
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      setCurrentStatus('Failed to connect');
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    // Add user message to UI
    const userMessage: Message = {
      id: Date.now().toString(),
      content: message,
      type: 'user',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Send message through WebSocket
    wsRef.current.send(JSON.stringify({
      type: 'message',
      content: message
    }));
  };

  const handleClearChat = () => {
    setMessages([]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'clear'
      }));
    }
  };

  const handleSettingsSave = (settings: { apiEndpoint: string }) => {
    setApiEndpoint(settings.apiEndpoint);
    localStorage.setItem('apiEndpoint', settings.apiEndpoint);
  };

  // Load saved settings
  useEffect(() => {
    const savedEndpoint = localStorage.getItem('apiEndpoint');
    if (savedEndpoint) {
      setApiEndpoint(savedEndpoint);
    }
  }, []);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <AppContainer>
        <Header>
          <Title>Claude Web Interface</Title>
          <IconButton onClick={() => setSettingsOpen(true)} size="small">
            <SettingsIcon />
          </IconButton>
        </Header>
        <MainContent>
          <Terminal 
            ref={terminalRef}
            messages={messages} 
            isLoading={isLoading}
            currentStatus={currentStatus}
          />
          <InputArea 
            onSendMessage={handleSendMessage}
            onClearChat={handleClearChat}
            disabled={!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN}
          />
        </MainContent>
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          apiEndpoint={apiEndpoint}
          onSave={handleSettingsSave}
        />
      </AppContainer>
    </ThemeProvider>
  );
}

export default App;