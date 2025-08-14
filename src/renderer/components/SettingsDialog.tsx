import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Alert
} from '@mui/material';
import styled from 'styled-components';

const StyledDialog = styled(Dialog)`
  .MuiDialog-paper {
    background-color: #252526;
    color: #cccccc;
    min-width: 500px;
  }
`;

const StyledTextField = styled(TextField)`
  .MuiInputBase-root {
    background-color: #1e1e1e;
    color: #cccccc;
  }
  
  .MuiOutlinedInput-notchedOutline {
    border-color: #3e3e42;
  }
  
  .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline {
    border-color: #007acc;
  }
  
  .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline {
    border-color: #007acc;
  }
  
  .MuiInputLabel-root {
    color: #858585;
  }
  
  .MuiInputLabel-root.Mui-focused {
    color: #007acc;
  }
`;

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (settings: { imageSavePath: string }) => void;
  initialPath?: string;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onClose,
  onSave,
  initialPath = ''
}) => {
  const [imageSavePath, setImageSavePath] = useState(initialPath);
  const [error, setError] = useState('');
  const [platform] = useState<string>('');

  useEffect(() => {
    setImageSavePath(initialPath);
  }, [initialPath]);

  const validatePath = (path: string): boolean => {
    if (!path) {
      setError('');
      return true;
    }

    try {
      // Basic path validation
      if (platform === 'win32') {
        // Windows path validation
        if (!/^[a-zA-Z]:\\/.test(path) && !/^\\\\/.test(path)) {
          setError('Invalid Windows path format');
          return false;
        }
      } else {
        // Unix-like path validation
        if (!path.startsWith('/') && !path.startsWith('~')) {
          setError('Path must be absolute');
          return false;
        }
      }
      
      setError('');
      return true;
    } catch {
      setError('Invalid path format');
      return false;
    }
  };

  const handleSave = () => {
    if (validatePath(imageSavePath)) {
      onSave({ imageSavePath });
      onClose();
    }
  };

  const handlePathChange = (value: string) => {
    setImageSavePath(value);
    validatePath(value);
  };

  return (
    <StyledDialog open={open} onClose={onClose}>
      <DialogTitle sx={{ borderBottom: '1px solid #3e3e42' }}>
        Settings
      </DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1, color: '#858585' }}>
            Image Storage
          </Typography>
          <StyledTextField
            fullWidth
            label="Image Save Path"
            value={imageSavePath}
            onChange={(e) => handlePathChange(e.target.value)}
            placeholder={platform === 'win32' ? 'C:\\Users\\...' : '/home/user/...'}
            helperText="Leave empty to disable image paste feature"
            error={!!error}
            sx={{ mb: 2 }}
          />
          {error && (
            <Alert severity="error" sx={{ mb: 2, backgroundColor: '#5a1e1e' }}>
              {error}
            </Alert>
          )}
          <Typography variant="caption" sx={{ color: '#858585' }}>
            Images pasted from clipboard will be saved to this directory
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ borderTop: '1px solid #3e3e42', p: 2 }}>
        <Button 
          onClick={onClose}
          sx={{ color: '#858585' }}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSave}
          variant="contained"
          sx={{ 
            backgroundColor: '#007acc',
            '&:hover': { backgroundColor: '#005a9e' }
          }}
          disabled={!!error}
        >
          Save
        </Button>
      </DialogActions>
    </StyledDialog>
  );
};

export default SettingsDialog;