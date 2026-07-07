import type { Server } from 'node:http';

const DEFAULT_GRACE_MS = 55_000;

interface ShutdownOptions {
  graceMs?: number;
  exit?: (code: number) => never | void;
  log?: Pick<Console, 'log' | 'error'>;
}

export function installGracefulShutdown(
  server: Server,
  markDraining: () => void,
  options: ShutdownOptions = {},
): () => void {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const log = options.log ?? console;
  let shuttingDown = false;

  const shutdown = (signal = 'manual') => {
    if (shuttingDown) return;
    shuttingDown = true;
    markDraining();
    log.log(`[shutdown] ${signal} received; draining active requests for up to ${graceMs}ms`);

    // Stop accepting new connections while allowing active translations and
    // database writes to finish. Idle keep-alive sockets do not hold shutdown.
    server.close((err) => {
      if (err) {
        log.error('[shutdown] HTTP server close failed:', err);
        exit(1);
        return;
      }
      log.log('[shutdown] active requests completed');
      exit(0);
    });
    server.closeIdleConnections();

    const forceTimer = setTimeout(() => {
      log.error(`[shutdown] grace period expired after ${graceMs}ms; forcing remaining connections closed`);
      server.closeAllConnections();
      exit(1);
    }, graceMs);
    forceTimer.unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return () => shutdown();
}
