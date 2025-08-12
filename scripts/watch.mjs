import { spawn } from 'child_process';
import { createServer, build } from 'vite';
import electron from 'electron';

const mode = process.env.NODE_ENV || 'development';

async function startRenderer() {
  const server = await createServer({
    mode,
    configFile: 'vite.config.ts'
  });
  await server.listen();
  server.printUrls();
  return server;
}

async function startElectron(server) {
  const electronProcess = spawn(electron, ['.'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: mode,
      VITE_DEV_SERVER_URL: server ? `http://localhost:${server.config.server.port}` : undefined
    }
  });

  electronProcess.on('close', () => {
    server?.close();
    process.exit();
  });

  return electronProcess;
}

async function watchMain() {
  const compiler = await build({
    mode,
    build: {
      watch: {}
    },
    plugins: [{
      name: 'electron-main-watcher',
      writeBundle() {
        if (electronProcess) {
          electronProcess.kill();
          startElectron(server);
        }
      }
    }]
  });
  
  return compiler;
}

let electronProcess = null;
let server = null;

(async () => {
  try {
    server = await startRenderer();
    await watchMain();
    electronProcess = await startElectron(server);
  } catch (error) {
    console.error('Error starting development server:', error);
    process.exit(1);
  }
})();