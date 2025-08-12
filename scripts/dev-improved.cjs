const { spawn, execSync } = require('child_process');
const { createServer } = require('vite');
const path = require('path');
const fs = require('fs');

async function buildElectronFiles() {
  try {
    // Build TypeScript files first
    console.log('Building TypeScript files...');
    execSync('npx tsc -p tsconfig.main.json', { stdio: 'inherit' });
    execSync('npx tsc -p tsconfig.preload.json', { stdio: 'inherit' });
    
    // Then copy cjs files
    const mainSrc = path.join(__dirname, '../src/main/index.cjs');
    const mainDest = path.join(__dirname, '../dist/main/index.cjs');
    const preloadSrc = path.join(__dirname, '../src/preload/index.cjs');
    const preloadDest = path.join(__dirname, '../dist/preload/index.cjs');
    
    // Create directories
    fs.mkdirSync(path.dirname(mainDest), { recursive: true });
    fs.mkdirSync(path.dirname(preloadDest), { recursive: true });
    
    // Copy files
    fs.copyFileSync(mainSrc, mainDest);
    fs.copyFileSync(preloadSrc, preloadDest);
    
    console.log('Electron files built and copied');
  } catch (error) {
    console.error('Build error:', error);
    throw error;
  }
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
  
  const proc = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
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
    // First build and copy electron files
    await buildElectronFiles();
    
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