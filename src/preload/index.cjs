const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveImageFromClipboard: (targetPath) => 
    ipcRenderer.invoke('save-image-from-clipboard', targetPath),
  getAppVersion: () => 
    ipcRenderer.invoke('get-app-version')
});