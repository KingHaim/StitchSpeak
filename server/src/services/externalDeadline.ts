export class ExternalServiceTimeoutError extends Error {
  readonly status = 504;

  constructor(service: string) {
    super(`${service} took too long to respond. Please try again.`);
    this.name = 'ExternalServiceTimeoutError';
  }
}

export async function withExternalDeadline<T>(
  service: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await operation(signal);
  } catch (error) {
    if (signal.aborted || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))) {
      throw new ExternalServiceTimeoutError(service);
    }
    throw error;
  }
}

export function externalErrorStatus(error: unknown): number {
  return error instanceof ExternalServiceTimeoutError ? 504 : 500;
}
