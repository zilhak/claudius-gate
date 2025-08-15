import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography
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
  apiEndpoint: string;
  onSave: (settings: { apiEndpoint: string }) => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ 
  open, 
  onClose, 
  apiEndpoint,
  onSave 
}) => {
  const [localApiEndpoint, setLocalApiEndpoint] = useState(apiEndpoint);

  useEffect(() => {
    setLocalApiEndpoint(apiEndpoint);
  }, [apiEndpoint]);

  const handleSave = () => {
    onSave({ apiEndpoint: localApiEndpoint });
    onClose();
  };

  return (
    <StyledDialog open={open} onClose={onClose}>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Typography variant="body2" sx={{ mb: 2, color: '#858585' }}>
            Configure the API endpoint for Claude backend service
          </Typography>
          <StyledTextField
            fullWidth
            label="API Endpoint"
            value={localApiEndpoint}
            onChange={(e) => setLocalApiEndpoint(e.target.value)}
            placeholder="http://localhost:8000"
            helperText="Enter the URL where your Claude API server is running"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: '#858585' }}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </StyledDialog>
  );
};

export default SettingsDialog;