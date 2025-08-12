/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    saveImageFromClipboard: (targetPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    getAppVersion: () => Promise<string>;
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
}