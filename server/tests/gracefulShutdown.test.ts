import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { installGracefulShutdown } from '../src/services/gracefulShutdown';

describe('graceful shutdown', () => {
  it('marks the instance draining and closes idle connections only once', () => {
    const processOnce = vi.spyOn(process, 'once').mockImplementation(() => process);
    const server = Object.assign(new EventEmitter(), {
      close: vi.fn((callback: (error?: Error) => void) => { callback(); return server; }),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
    });
    const markDraining = vi.fn();
    const exit = vi.fn();
    const log = { log: vi.fn(), error: vi.fn() };

    const shutdown = installGracefulShutdown(server as never, markDraining, {
      graceMs: 10_000, exit, log,
    });
    shutdown();
    shutdown();

    expect(markDraining).toHaveBeenCalledOnce();
    expect(server.close).toHaveBeenCalledOnce();
    expect(server.closeIdleConnections).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
    processOnce.mockRestore();
  });
});
