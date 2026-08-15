import { env } from './shared/config/index.js';
import { logger } from './shared/logger/index.js';
import { buildApp } from './app.js';
import { startWorkers, stopWorkers } from './jobs/index.js';
import { initRealtime } from './realtime/index.js';

async function main(): Promise<void> {
  const app = await buildApp();
  const workers = startWorkers();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await stopWorkers(workers);
    await app.close();
    await app.redis.quit();
    await app.prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    initRealtime(app);
  } catch (err) {
    logger.error(err, 'failed to start server');
    process.exit(1);
  }
}

void main();
