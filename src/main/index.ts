import { app, BrowserWindow, ipcMain, clipboard } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { ClaudeService } from './claudeService';
import settingsManager from './settingsManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let claudeService: ClaudeService | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createWindow();
  
  // Initialize Claude service
  claudeService = new ClaudeService();
  
  claudeService.on('message', (message) => {
    if (mainWindow) {
      mainWindow.webContents.send('claude-message', message);
    }
  });
  
  claudeService.on('error', (error) => {
    if (mainWindow) {
      mainWindow.webContents.send('claude-error', error);
    }
  });
  
  claudeService.on('ready', () => {
    if (mainWindow) {
      mainWindow.webContents.send('claude-ready');
    }
  });
});

app.on('window-all-closed', () => {
  if (claudeService) {
    claudeService.stop();
  }
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
ipcMain.handle('save-image-from-clipboard', async (_, targetPath: string) => {
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
    return { success: false, error: (error as Error).message };
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
      claudeService = new ClaudeService();
    }
    await claudeService.initialize();
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('claude-send-message', async (_, message: string) => {
  try {
    if (!claudeService || !claudeService.isRunning()) {
      await claudeService?.initialize();
    }
    await claudeService?.sendMessage(message);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('claude-stop', async () => {
  try {
    await claudeService?.stop();
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('claude-status', () => {
  return {
    isRunning: claudeService?.isRunning() || false
  };
});

// Settings IPC handlers
ipcMain.handle('settings-get', async () => {
  return settingsManager.getAll();
});

ipcMain.handle('settings-set', async (_, settings) => {
  await settingsManager.setAll(settings);
  return { success: true };
});