import { buildApp } from './app.js';
import { config } from './config.js';
import { retryPendingEmails } from './lib/notify.js';
import { getDb, closeDb } from './db/index.js';

async function main(): Promise<void> {
  const app = await buildApp();
  await app.listen({ host: '0.0.0.0', port: config.port });
  app.log.info(`LCMP server listening on :${config.port} (${config.nodeEnv})`);

  // Background: retry failed emails every 5 minutes (idempotent via status checks).
  const timer = setInterval(() => {
    retryPendingEmails(getDb()).catch((e) => app.log.error({ err: e }, 'email retry failed'));
  }, 5 * 60 * 1000);
  timer.unref();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`${signal} received, shutting down`);
    clearInterval(timer);
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
