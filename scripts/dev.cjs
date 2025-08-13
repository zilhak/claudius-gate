const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if we have necessary files
function checkFiles() {
  const mainFile = path.join(__dirname, '../src/main/index.cjs');
  const preloadFile = path.join(__dirname, '../src/preload/index.ts');
  
  if (!fs.existsSync(mainFile)) {
    console.error('Main file not found:', mainFile);
    process.exit(1);
  }
  
  console.log('✓ Main file found');
  console.log('✓ Preload file:', fs.existsSync(preloadFile) ? 'found' : 'not found (will use fallback)');
}

// Create preload file for development
function createDevPreload() {
  const preloadDir = path.join(__dirname, '../dist/preload');
  const preloadFile = path.join(preloadDir, 'index.js');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(preloadDir)) {
    fs.mkdirSync(preloadDir, { recursive: true });
  }
  
  // Create a simple preload file that requires the TypeScript source
  const preloadContent = `
// Development preload wrapper
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveImageFromClipboard: (targetPath) => 
    ipcRenderer.invoke('save-image-from-clipboard', targetPath),
  getAppVersion: () => 
    ipcRenderer.invoke('get-app-version'),
  getPlatform: () => 
    ipcRenderer.invoke('get-platform'),
  
  // Claude service methods
  claudeInitialize: () => 
    ipcRenderer.invoke('claude-initialize'),
  claudeSendMessage: (message) => 
    ipcRenderer.invoke('claude-send-message', message),
  claudeStop: () => 
    ipcRenderer.invoke('claude-stop'),
  claudeStatus: () => 
    ipcRenderer.invoke('claude-status'),
  
  // Claude event listeners
  onClaudeMessage: (callback) => {
    ipcRenderer.on('claude-message', (_, message) => callback(message));
  },
  onClaudeError: (callback) => {
    ipcRenderer.on('claude-error', (_, error) => callback(error));
  },
  onClaudeReady: (callback) => {
    ipcRenderer.on('claude-ready', () => callback());
  },
  
  // Settings methods
  settingsGet: () => 
    ipcRenderer.invoke('settings-get'),
  settingsSet: (settings) => 
    ipcRenderer.invoke('settings-set', settings)
});
`;
  
  fs.writeFileSync(preloadFile, preloadContent);
  console.log('✓ Development preload file created');
}

// Start Vite for renderer process
function startVite() {
  return new Promise((resolve, reject) => {
    const vite = spawn('npx', ['vite', '--config', 'vite-simple.config.ts'], {
      stdio: 'pipe',
      shell: true,
      cwd: path.resolve(__dirname, '..')
    });
    
    let viteReady = false;
    let viteUrl = 'http://localhost:5173';
    
    vite.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(output);
      
      // Extract the actual URL from Vite output
      const urlMatch = output.match(/http:\/\/localhost:(\d+)\//);
      if (urlMatch) {
        viteUrl = `http://localhost:${urlMatch[1]}`;
      }
      
      if (!viteReady && output.includes('Local:')) {
        viteReady = true;
        console.log('\n✓ Vite server ready');
        resolve({ process: vite, url: viteUrl });
      }
    });
    
    vite.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    vite.on('error', reject);
    vite.on('close', (code) => {
      if (!viteReady) {
        reject(new Error(`Vite exited with code ${code}`));
      }
    });
  });
}

// Start Electron
function startElectron(viteUrl) {
  const electronPath = require('electron');
  
  console.log('Starting Electron...');
  console.log('Using Vite URL:', viteUrl);
  
  const electron = spawn(electronPath, ['src/main/index.cjs'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: viteUrl
    }
  });
  
  electron.on('close', (code) => {
    console.log(`Electron closed with code ${code}`);
    process.exit(code);
  });
  
  return electron;
}

// Main function
async function main() {
  try {
    console.log('Starting development server...\n');
    
    // Check files
    checkFiles();
    
    // Create development preload file
    createDevPreload();
    
    // Start Vite
    console.log('\nStarting Vite server...');
    const viteResult = await startVite();
    const viteProcess = viteResult.process;
    const viteUrl = viteResult.url;
    
    // Wait a bit for Vite to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start Electron
    const electronProcess = startElectron(viteUrl);
    
    // Handle cleanup on exit
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      electronProcess.kill();
      viteProcess.kill();
      process.exit();
    });
    
  } catch (error) {
    console.error('Error starting dev server:', error);
    process.exit(1);
  }
}

main();