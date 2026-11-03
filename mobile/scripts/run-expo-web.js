const net = require('net');
const { spawn } = require('child_process');

function getFreePort(startPort = 8081, endPort = 8199) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > endPort) {
        reject(new Error(`No free Expo web port found between ${startPort} and ${endPort}.`));
        return;
      }

      const server = net.createServer();
      server.unref();

      server.on('error', () => {
        tryPort(port + 1);
      });

      server.listen(port, '127.0.0.1', () => {
        const assignedPort = server.address().port;
        server.close(() => resolve(assignedPort));
      });
    };

    tryPort(startPort);
  });
}

async function main() {
  const port = await getFreePort();

  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'cmd.exe' : 'npx';
  const args = isWindows
    ? ['/c', 'npx', 'expo', 'start', '--web', '--port', String(port)]
    : ['expo', 'start', '--web', '--port', String(port)];

  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(error.message);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
