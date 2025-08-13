const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow = null;
let claudeService = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1e1e1e',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  if (process.env.NODE_ENV === 'development' && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else if (process.env.NODE_ENV === 'development') {
    // Fallback for development
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Add error handling
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });
}

app.whenReady().then(async () => {
  createWindow();
  
  // Initialize Claude service with context simulation
  try {
    // Use final service with simulated context
    const { ClaudeFinalService } = require('./claudeFinalService.cjs');
    console.log('Using Claude Final Service with context simulation and permission bypass');
    claudeService = new ClaudeFinalService();
    
    // Set bypass permissions by default
    claudeService.setBypassPermissions(true);
    
    // Initialize the service
    await claudeService.initialize();
    
    // Forward all events to renderer
    claudeService.on('message', (message) => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-message', message);
      }
    });
    
    claudeService.on('stream', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-stream', data);
      }
    });
    
    claudeService.on('thinking', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-thinking', data);
      }
    });
    
    claudeService.on('tool_use', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-tool-use', data);
      }
    });
    
    claudeService.on('tool_result', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-tool-result', data);
      }
    });
    
    claudeService.on('permission_request', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-permission-request', data);
      }
    });
    
    claudeService.on('token_usage', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-token-usage', data);
      }
    });
    
    claudeService.on('final_token_usage', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-final-token-usage', data);
      }
    });
    
    claudeService.on('partial', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-partial', data);
      }
    });
    
    claudeService.on('error', (error) => {
      console.error('Claude service error:', error);
      if (mainWindow) {
        mainWindow.webContents.send('claude-error', error);
      }
    });
    
    claudeService.on('permission_error', (data) => {
      console.error('Claude permission error:', data);
      if (mainWindow) {
        mainWindow.webContents.send('claude-permission-error', data);
      }
    });
    
    claudeService.on('ready', () => {
      console.log('Claude service ready');
      if (mainWindow) {
        mainWindow.webContents.send('claude-ready');
      }
    });
    
    claudeService.on('done', () => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-done');
      }
    });
    
    claudeService.on('debug', (data) => {
      if (mainWindow && process.env.NODE_ENV === 'development') {
        mainWindow.webContents.send('claude-debug', data);
      }
    });
  } catch (error) {
    console.error('Failed to initialize Claude service:', error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('save-image-from-clipboard', async (_, targetPath) => {
  try {
    // Validate and create directory if needed
    try {
      await fs.access(targetPath);
    } catch {
      // Directory doesn't exist, try to create it
      await fs.mkdir(targetPath, { recursive: true });
    }
    
    const image = clipboard.readImage();
    if (image.isEmpty()) {
      throw new Error('No image in clipboard');
    }
    
    const buffer = image.toPNG();
    const timestamp = Date.now();
    const fileName = `clipboard-image-${timestamp}.png`;
    const fullPath = path.join(targetPath, fileName);
    
    await fs.writeFile(fullPath, buffer);
    return { success: true, path: fullPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

// Claude service IPC handlers
ipcMain.handle('claude-initialize', async () => {
  try {
    if (!claudeService) {
      const { ClaudeFinalService } = require('./claudeFinalService.cjs');
      claudeService = new ClaudeFinalService();
      claudeService.setBypassPermissions(true);
    }
    if (!claudeService.isRunning()) {
      await claudeService.initialize();
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('claude-send-message', async (_, message) => {
  try {
    if (!claudeService || !claudeService.isRunning()) {
      await claudeService?.initialize();
    }
    await claudeService?.sendMessage(message);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('claude-stop', async () => {
  try {
    await claudeService?.stop();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('claude-status', () => {
  return {
    isRunning: claudeService?.isRunning() || false
  };
});

// Settings IPC handlers
let settingsManager = null;

ipcMain.handle('settings-get', async () => {
  if (!settingsManager) {
    settingsManager = require('./settingsManager.cjs');
    if (settingsManager.initialize) {
      await settingsManager.initialize();
    }
  }
  return await settingsManager.getSettings();
});

ipcMain.handle('settings-set', async (_, settings) => {
  if (!settingsManager) {
    settingsManager = require('./settingsManager.cjs');
    if (settingsManager.initialize) {
      await settingsManager.initialize();
    }
  }
  await settingsManager.saveSettings(settings);
  return { success: true };
});