import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, LinearProgress, Chip, List, ListItem, ListItemIcon, ListItemText, Alert, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  Psychology as ThinkingIcon,
  Build as ToolIcon,
  Token as TokenIcon,
  Security as PermissionIcon,
  ExpandMore as ExpandMoreIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Speed as SpeedIcon
} from '@mui/icons-material';

const StatusContainer = styled(Paper)(() => ({
  padding: 16,
  backgroundColor: '#1e1e1e',
  borderRadius: 8,
  marginBottom: 16,
  border: '1px solid #333',
}));

const StatusSection = styled(Box)(() => ({
  marginBottom: 16,
  '&:last-child': {
    marginBottom: 0,
  },
}));

const TokenBar = styled(LinearProgress)(() => ({
  height: 8,
  borderRadius: 4,
  backgroundColor: '#333',
  '& .MuiLinearProgress-bar': {
    backgroundColor: '#4CAF50',
  },
}));

const ActivityItem = styled(ListItem)(() => ({
  padding: '4px 8px',
  borderRadius: 4,
  marginBottom: 4,
  backgroundColor: '#2a2a2a',
  '&:hover': {
    backgroundColor: '#333',
  },
}));

const StyledAccordion = styled(Accordion)(() => ({
  backgroundColor: '#2a2a2a',
  marginBottom: 8,
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
  bypassPermissions = true
}) => {
  const [isThinking, _setIsThinking] = useState(false);
  const [_currentActivity, _setCurrentActivity] = useState<string>('');
  const [activities] = useState<ClaudeActivity[]>([]);
  const [tokenUsage] = useState({
    input: 0,
    output: 0,
    total: 0,
    limit: 100000,
    cost: 0
  });
  const [streamData, _setStreamData] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState({
    thinking: true,
    tools: true,
    permissions: false
  });

  useEffect(() => {
    // IPC 리스너 설정
    if (window.electronAPI) {
      // Stream and status listeners will be added when APIs are available
      // window.electronAPI.onClaudeStream((data: any) => {
      //   handleStreamData(data);
      // });
      // window.electronAPI.onClaudeStatus((status: any) => {
      //   handleStatusUpdate(status);
      // });
    }

    return () => {
      // Cleanup
      // Cleanup will be added when API is available
      // if (window.electronAPI) {
      //   window.electronAPI.removeClaudeListeners();
      // }
    };
  }, []);

  // Stream data handler - will be used when API is available
  // const _handleStreamData = (data: any) => {
  //   // Stream JSON parsing logic
  // };

  // Status update handler - will be used when API is available
  // const _handleStatusUpdate = (status: any) => {
  //   // Status update logic
  // };

  // Permission request handler - will be used when API is available
  // const _handlePermissionRequest = (request: any) => {
  //   // Permission handling logic
  // };

  // Permission approval - will be used when API is available
  // const approvePermission = (request: any) => {
  //   // Permission approval logic
  // };

  // Activity adder - will be used when API is available
  // const addActivity = (activity: ClaudeActivity) => {
  //   setActivities(prev => [activity, ...prev].slice(0, 50)); // Maximum 50 items
  // };

  // Tool activity updater - will be used when API is available
  // const _updateLastToolActivity = (status: 'completed' | 'error') => {
  //   // Tool activity update logic
  // };

  // Activity status updater - will be used when API is available
  // const updateActivityStatus = (id: string, status: string) => {
  //   setActivities(prev => prev.map(activity => 
  //     activity.details?.id === id 
  //       ? { ...activity, status: status as any }
  //       : activity
  //   ));
  // };

  // Token usage updater - will be used when API is available
  // const _updateTokenUsage = (usage: any) => {
  //   // Token usage update logic
  // };

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

  const toggleSection = (section: keyof typeof expandedSections) => {
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
              {_currentActivity}
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