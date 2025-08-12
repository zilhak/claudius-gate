const { spawn } = require('child_process');
const { createServer } = require('vite');
const path = require('path');

const mode = process.env.NODE_ENV || 'development';

async function startVite() {
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    mode
  });
  
  await server.listen();
  server.printUrls();
  
  return server;
}

async function startElectron() {
  return new Promise((resolve, reject) => {
    const electronPath = require('electron');
    const proc = spawn(electronPath, ['.'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development'
      }
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Electron exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  try {
    console.log('Starting Vite dev server...');
    const server = await startVite();
    
    console.log('Starting Electron...');
    await startElectron();
    
    server.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();