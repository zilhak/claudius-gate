import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, LinearProgress, Chip, List, ListItem, ListItemIcon, ListItemText, Alert, Accordion, AccordionSummary, AccordionDetails, IconButton, Tooltip } from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  Psychology as ThinkingIcon,
  Build as ToolIcon,
  Token as TokenIcon,
  Security as PermissionIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as ApprovedIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Code as CodeIcon,
  Terminal as TerminalIcon,
  Speed as SpeedIcon
} from '@mui/icons-material';

const StatusContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: '#1e1e1e',
  borderRadius: 8,
  marginBottom: theme.spacing(2),
  border: '1px solid #333',
}));

const StatusSection = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  '&:last-child': {
    marginBottom: 0,
  },
}));

const TokenBar = styled(LinearProgress)(({ theme }) => ({
  height: 8,
  borderRadius: 4,
  backgroundColor: '#333',
  '& .MuiLinearProgress-bar': {
    backgroundColor: '#4CAF50',
  },
}));

const ActivityItem = styled(ListItem)(({ theme }) => ({
  padding: theme.spacing(0.5, 1),
  borderRadius: 4,
  marginBottom: theme.spacing(0.5),
  backgroundColor: '#2a2a2a',
  '&:hover': {
    backgroundColor: '#333',
  },
}));

const StyledAccordion = styled(Accordion)(({ theme }) => ({
  backgroundColor: '#2a2a2a',
  marginBottom: theme.spacing(1),
  '&:before': {
    display: 'none',
  },
  '& .MuiAccordionSummary-root': {
    minHeight: 48,
  },
}));

interface ClaudeActivity {
  type: 'thinking' | 'tool_use' | 'permission' | 'message' | 'error';
  content: string;
  timestamp: Date;
  details?: any;
  toolName?: string;
  status?: 'pending' | 'approved' | 'denied' | 'completed';
}

interface ClaudeStatusProps {
  sessionId?: string;
  bypassPermissions?: boolean;
  onPermissionRequest?: (request: any) => void;
}

const ClaudeStatus: React.FC<ClaudeStatusProps> = ({ 
  sessionId,
  bypassPermissions = true,
  onPermissionRequest 
}) => {
  const [isThinking, setIsThinking] = useState(false);
  const [currentActivity, setCurrentActivity] = useState<string>('');
  const [activities, setActivities] = useState<ClaudeActivity[]>([]);
  const [tokenUsage, setTokenUsage] = useState({
    input: 0,
    output: 0,
    total: 0,
    limit: 100000,
    cost: 0
  });
  const [streamData, setStreamData] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState({
    thinking: true,
    tools: true,
    permissions: false
  });

  useEffect(() => {
    // IPC 리스너 설정
    if (window.electronAPI) {
      window.electronAPI.onClaudeStream((data: any) => {
        handleStreamData(data);
      });

      window.electronAPI.onClaudeStatus((status: any) => {
        handleStatusUpdate(status);
      });
    }

    return () => {
      // Cleanup
      if (window.electronAPI) {
        window.electronAPI.removeClaudeListeners();
      }
    };
  }, []);

  const handleStreamData = (data: any) => {
    // Stream JSON 파싱
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      setStreamData(parsed);

      // 타입별 처리
      switch (parsed.type) {
        case 'thinking':
          setIsThinking(true);
          setCurrentActivity('Claude is thinking...');
          addActivity({
            type: 'thinking',
            content: parsed.content || 'Processing...',
            timestamp: new Date(),
            details: parsed
          });
          break;

        case 'tool_use':
          addActivity({
            type: 'tool_use',
            content: `Using tool: ${parsed.tool_name}`,
            timestamp: new Date(),
            toolName: parsed.tool_name,
            details: parsed.parameters,
            status: 'pending'
          });
          break;

        case 'tool_result':
          updateLastToolActivity('completed');
          break;

        case 'permission_request':
          handlePermissionRequest(parsed);
          break;

        case 'token_usage':
          updateTokenUsage(parsed);
          break;

        case 'message':
          setIsThinking(false);
          setCurrentActivity('');
          break;

        case 'error':
          addActivity({
            type: 'error',
            content: parsed.message || 'An error occurred',
            timestamp: new Date(),
            details: parsed
          });
          break;
      }
    } catch (error) {
      console.error('Failed to parse stream data:', error);
    }
  };

  const handleStatusUpdate = (status: any) => {
    if (status.tokens) {
      setTokenUsage(prev => ({
        ...prev,
        ...status.tokens
      }));
    }
  };

  const handlePermissionRequest = (request: any) => {
    const activity: ClaudeActivity = {
      type: 'permission',
      content: `Permission requested: ${request.permission}`,
      timestamp: new Date(),
      details: request,
      status: bypassPermissions ? 'approved' : 'pending'
    };

    addActivity(activity);

    if (bypassPermissions) {
      // 자동 승인
      setTimeout(() => {
        approvePermission(request);
      }, 100);
    } else if (onPermissionRequest) {
      onPermissionRequest(request);
    }
  };

  const approvePermission = (request: any) => {
    if (window.electronAPI) {
      window.electronAPI.approvePermission(request.id);
    }
    updateActivityStatus(request.id, 'approved');
  };

  const addActivity = (activity: ClaudeActivity) => {
    setActivities(prev => [activity, ...prev].slice(0, 50)); // 최대 50개 유지
  };

  const updateLastToolActivity = (status: 'completed' | 'error') => {
    setActivities(prev => {
      const updated = [...prev];
      const lastToolIndex = updated.findIndex(a => a.type === 'tool_use' && a.status === 'pending');
      if (lastToolIndex !== -1) {
        updated[lastToolIndex].status = status;
      }
      return updated;
    });
  };

  const updateActivityStatus = (id: string, status: string) => {
    setActivities(prev => prev.map(activity => 
      activity.details?.id === id 
        ? { ...activity, status: status as any }
        : activity
    ));
  };

  const updateTokenUsage = (usage: any) => {
    setTokenUsage(prev => ({
      input: usage.input_tokens || prev.input,
      output: usage.output_tokens || prev.output,
      total: (usage.input_tokens || 0) + (usage.output_tokens || 0),
      limit: usage.limit || prev.limit,
      cost: usage.cost || prev.cost
    }));
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'thinking': return <ThinkingIcon color="primary" />;
      case 'tool_use': return <ToolIcon color="secondary" />;
      case 'permission': return <PermissionIcon color="warning" />;
      case 'error': return <WarningIcon color="error" />;
      default: return <InfoIcon />;
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString();
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <StatusContainer elevation={0}>
      {/* 현재 상태 표시 */}
      {isThinking && (
        <StatusSection>
          <Box display="flex" alignItems="center" gap={1}>
            <ThinkingIcon color="primary" />
            <Typography variant="body2" color="primary">
              {currentActivity}
            </Typography>
            <Box flexGrow={1}>
              <LinearProgress variant="indeterminate" sx={{ height: 2 }} />
            </Box>
          </Box>
        </StatusSection>
      )}

      {/* 토큰 사용량 */}
      <StatusSection>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <TokenIcon fontSize="small" />
            <Typography variant="caption" color="textSecondary">
              Token Usage
            </Typography>
          </Box>
          <Typography variant="caption" color="textSecondary">
            {tokenUsage.total.toLocaleString()} / {tokenUsage.limit.toLocaleString()}
          </Typography>
        </Box>
        <TokenBar 
          variant="determinate" 
          value={(tokenUsage.total / tokenUsage.limit) * 100} 
        />
        <Box display="flex" justifyContent="space-between" mt={0.5}>
          <Typography variant="caption" color="textSecondary">
            Input: {tokenUsage.input.toLocaleString()}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Output: {tokenUsage.output.toLocaleString()}
          </Typography>
          {tokenUsage.cost > 0 && (
            <Typography variant="caption" color="textSecondary">
              Cost: ${tokenUsage.cost.toFixed(4)}
            </Typography>
          )}
        </Box>
      </StatusSection>

      {/* 권한 모드 표시 */}
      {bypassPermissions && (
        <Alert 
          severity="info" 
          icon={<SpeedIcon />}
          sx={{ mb: 2, py: 0.5 }}
        >
          <Typography variant="caption">
            Fast mode enabled - permissions auto-approved
          </Typography>
        </Alert>
      )}

      {/* 활동 로그 */}
      <StatusSection>
        <StyledAccordion 
          expanded={expandedSections.thinking}
          onChange={() => toggleSection('thinking')}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="caption" color="textSecondary">
              Recent Activities ({activities.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 1 }}>
            <List dense sx={{ p: 0 }}>
              {activities.slice(0, 10).map((activity, index) => (
                <ActivityItem key={index}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {getActivityIcon(activity.type)}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="caption" color="textPrimary">
                        {activity.content}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="textSecondary">
                        {formatTimestamp(activity.timestamp)}
                      </Typography>
                    }
                  />
                  {activity.status && (
                    <Chip
                      size="small"
                      label={activity.status}
                      color={
                        activity.status === 'completed' ? 'success' :
                        activity.status === 'approved' ? 'primary' :
                        activity.status === 'denied' ? 'error' :
                        'default'
                      }
                      sx={{ height: 20 }}
                    />
                  )}
                </ActivityItem>
              ))}
            </List>
          </AccordionDetails>
        </StyledAccordion>
      </StatusSection>

      {/* 디버그 정보 (개발 모드) */}
      {process.env.NODE_ENV === 'development' && streamData && (
        <StyledAccordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="caption" color="textSecondary">
              Debug Stream Data
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ 
              fontFamily: 'monospace', 
              fontSize: '10px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 200,
              overflow: 'auto'
            }}>
              {JSON.stringify(streamData, null, 2)}
            </Box>
          </AccordionDetails>
        </StyledAccordion>
      )}
    </StatusContainer>
  );
};

export default ClaudeStatus;