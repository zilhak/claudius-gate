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
  
  // Initialize Claude service
  try {
    // Use print mode directly for now
    const { ClaudeService } = require('./claudeService.cjs');
    console.log('Using print-mode Claude service');
    claudeService = new ClaudeService();
    
    claudeService.on('message', (message) => {
      if (mainWindow) {
        mainWindow.webContents.send('claude-message', message);
      }
    });
    
    claudeService.on('error', (error) => {
      console.error('Claude service error:', error);
      if (mainWindow) {
        mainWindow.webContents.send('claude-error', error);
      }
    });
    
    claudeService.on('ready', () => {
      console.log('Claude service ready');
      if (mainWindow) {
        mainWindow.webContents.send('claude-ready');
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
      const { ClaudeService } = require('./claudeService.cjs');
      claudeService = new ClaudeService();
    }
    await claudeService.initialize();
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