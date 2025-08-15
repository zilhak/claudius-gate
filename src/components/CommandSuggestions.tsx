import React from 'react';
import { Paper, List, ListItem, ListItemText, Typography } from '@mui/material';
import styled from 'styled-components';

const SuggestionsContainer = styled(Paper)`
  position: absolute;
  bottom: 100%;
  left: 16px;
  right: 16px;
  max-height: 300px;
  overflow-y: auto;
  background-color: #252526;
  border: 1px solid #3e3e42;
  margin-bottom: 8px;
  z-index: 1000;
  
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

const CommandItem = styled(ListItem)<{ $selected: boolean }>`
  background-color: ${props => props.$selected ? '#094771' : 'transparent'};
  color: #cccccc;
  cursor: pointer;
  padding: 8px 16px;
  
  &:hover {
    background-color: ${props => props.$selected ? '#094771' : '#2a2d2e'};
  }
`;

const CommandText = styled.span`
  color: #569cd6;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-weight: 500;
`;

const DescriptionText = styled.span`
  color: #858585;
  margin-left: 12px;
  font-size: 0.9em;
`;

const PersonaText = styled.span`
  color: #608b4e;
  margin-left: 8px;
  font-size: 0.85em;
  opacity: 0.8;
`;

export interface Command {
  command: string;
  description: string;
  persona?: string;
}

interface CommandSuggestionsProps {
  commands: Command[];
  selectedIndex: number;
  onSelect: (command: string) => void;
  visible: boolean;
}

const CommandSuggestions: React.FC<CommandSuggestionsProps> = ({
  commands,
  selectedIndex,
  onSelect,
  visible
}) => {
  if (!visible || commands.length === 0) {
    return null;
  }

  return (
    <SuggestionsContainer elevation={3}>
      <List dense disablePadding>
        {commands.map((cmd, index) => (
          <CommandItem
            key={cmd.command}
            $selected={index === selectedIndex}
            onClick={() => onSelect(cmd.command)}
          >
            <ListItemText
              primary={
                <>
                  <CommandText>{cmd.command}</CommandText>
                  <DescriptionText>{cmd.description}</DescriptionText>
                  {cmd.persona && <PersonaText>({cmd.persona})</PersonaText>}
                </>
              }
              disableTypography
            />
          </CommandItem>
        ))}
      </List>
    </SuggestionsContainer>
  );
};

export default CommandSuggestions;