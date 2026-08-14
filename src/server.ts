import { env } from './shared/config/index.js';
import { logger } from './shared/logger/index.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await app.redis.quit();
    await app.prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (err) {
    logger.error(err, 'failed to start server');
    process.exit(1);
  }
}

void main();
