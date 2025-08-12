import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveImageFromClipboard: (targetPath: string) => 
    ipcRenderer.invoke('save-image-from-clipboard', targetPath),
  getAppVersion: () => 
    ipcRenderer.invoke('get-app-version'),
  getPlatform: () => 
    ipcRenderer.invoke('get-platform'),
  
  // Claude service methods
  claudeInitialize: () => 
    ipcRenderer.invoke('claude-initialize'),
  claudeSendMessage: (message: string) => 
    ipcRenderer.invoke('claude-send-message', message),
  claudeStop: () => 
    ipcRenderer.invoke('claude-stop'),
  claudeStatus: () => 
    ipcRenderer.invoke('claude-status'),
  
  // Claude event listeners
  onClaudeMessage: (callback: (message: any) => void) => {
    ipcRenderer.on('claude-message', (_, message) => callback(message));
  },
  onClaudeError: (callback: (error: string) => void) => {
    ipcRenderer.on('claude-error', (_, error) => callback(error));
  },
  onClaudeReady: (callback: () => void) => {
    ipcRenderer.on('claude-ready', () => callback());
  },
  
  // Settings methods
  settingsGet: () => 
    ipcRenderer.invoke('settings-get'),
  settingsSet: (settings: any) => 
    ipcRenderer.invoke('settings-set', settings)
});

export type ElectronAPI = {
  saveImageFromClipboard: (targetPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  claudeInitialize: () => Promise<{ success: boolean; error?: string }>;
  claudeSendMessage: (message: string) => Promise<{ success: boolean; error?: string }>;
  claudeStop: () => Promise<{ success: boolean; error?: string }>;
  claudeStatus: () => Promise<{ isRunning: boolean }>;
  onClaudeMessage: (callback: (message: any) => void) => void;
  onClaudeError: (callback: (error: string) => void) => void;
  onClaudeReady: (callback: () => void) => void;
  settingsGet: () => Promise<any>;
  settingsSet: (settings: any) => Promise<{ success: boolean }>;
};