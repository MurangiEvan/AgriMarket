import { createApplication } from './app.js';

const { app, close } = createApplication();
const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => {
  console.info(`AgriMarket API listening on port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);