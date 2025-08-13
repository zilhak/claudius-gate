const { spawn } = require('child_process');
const { createServer } = require('vite');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function copyElectronFiles() {
  const srcDir = path.join(__dirname, '../src');
  const distDir = path.join(__dirname, '../dist');
  
  // Create directories
  fs.mkdirSync(path.join(distDir, 'main'), { recursive: true });
  fs.mkdirSync(path.join(distDir, 'preload'), { recursive: true });
  
  // Copy main files
  const mainFiles = ['index.cjs', 'claudeService.cjs', 'settingsManager.cjs'];
  mainFiles.forEach(file => {
    const src = path.join(srcDir, 'main', file);
    const dest = path.join(distDir, 'main', file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied ${file}`);
    } else {
      console.warn(`Warning: ${file} not found at ${src}`);
    }
  });
  
  // Handle preload file
  const preloadTsSrc = path.join(srcDir, 'preload/index.ts');
  const preloadJsSrc = path.join(srcDir, 'preload/index.js');
  const preloadDest = path.join(distDir, 'preload/index.js');
  
  // Check if preload file exists (either .ts or .js)
  if (fs.existsSync(preloadJsSrc)) {
    // If .js version exists, copy it directly
    fs.copyFileSync(preloadJsSrc, preloadDest);
    console.log('Copied preload.js');
  } else if (fs.existsSync(preloadTsSrc)) {
    // If only .ts exists, try to compile it
    try {
      const tsconfigPath = path.join(__dirname, '../tsconfig.preload.json');
      if (fs.existsSync(tsconfigPath)) {
        execSync('npx tsc -p tsconfig.preload.json', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
        
        // Check various possible output locations
        const possibleOutputs = [
          path.join(distDir, 'preload/src/preload/index.js'),
          path.join(distDir, 'preload/index.js'),
          path.join(srcDir, 'preload/index.js')
        ];
        
        let found = false;
        for (const output of possibleOutputs) {
          if (fs.existsSync(output)) {
            fs.copyFileSync(output, preloadDest);
            console.log('Copied compiled preload script');
            found = true;
            break;
          }
        }
        
        if (!found) {
          console.warn('Warning: Could not find compiled preload script');
        }
      } else {
        console.warn('Warning: tsconfig.preload.json not found');
      }
    } catch (error) {
      console.error('TypeScript compilation error:', error);
      // Create a minimal preload script as fallback
      const minimalPreload = `
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveImageFromClipboard: (path) => ipcRenderer.invoke('save-image-from-clipboard', path),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // Claude API
  claude: {
    initialize: () => ipcRenderer.invoke('claude-initialize'),
    sendMessage: (message) => ipcRenderer.invoke('claude-send-message', message),
    stop: () => ipcRenderer.invoke('claude-stop'),
    getStatus: () => ipcRenderer.invoke('claude-status'),
    onMessage: (callback) => ipcRenderer.on('claude-message', (_, message) => callback(message)),
    onError: (callback) => ipcRenderer.on('claude-error', (_, error) => callback(error)),
    onReady: (callback) => ipcRenderer.on('claude-ready', () => callback())
  },
  
  // Settings API
  settings: {
    get: () => ipcRenderer.invoke('settings-get'),
    set: (settings) => ipcRenderer.invoke('settings-set', settings)
  }
});
`;
      fs.writeFileSync(preloadDest, minimalPreload);
      console.log('Created fallback preload script');
    }
  } else {
    console.warn('Warning: No preload file found');
  }
  
  console.log('Electron files copied');
}

async function startVite() {
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    mode: 'development'
  });
  
  await server.listen();
  server.printUrls();
  
  return server;
}

async function startElectron(viteServer) {
  const electronPath = require('electron');
  
  // On Windows, we need to use the .cmd wrapper if it exists
  const isWindows = process.platform === 'win32';
  const electronCmd = isWindows ? electronPath + '.cmd' : electronPath;
  
  const proc = spawn(isWindows ? electronPath : electronPath, ['.'], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    shell: isWindows, // Use shell on Windows
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: `http://localhost:${viteServer.config.server.port || 5173}`
    }
  });
  
  proc.on('close', (code) => {
    console.log(`Electron closed with code ${code}`);
    viteServer.close();
    process.exit(code);
  });
  
  return proc;
}

async function main() {
  try {
    // First copy electron files
    await copyElectronFiles();
    
    // Start Vite
    console.log('Starting Vite dev server...');
    const viteServer = await startVite();
    
    // Wait a bit for Vite to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start Electron
    console.log('Starting Electron...');
    const electronProc = await startElectron(viteServer);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();