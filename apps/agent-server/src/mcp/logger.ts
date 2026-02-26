import type { Logger } from '../logging';

type Level = 'debug' | 'info' | 'warn' | 'error';

class StderrJsonLogger implements Logger {
  constructor(private readonly bindings: Record<string, unknown> = {}) {}

  debug(event: string, data?: Record<string, unknown>): void {
    this.log('debug', event, data);
  }

  info(event: string, data?: Record<string, unknown>): void {
    this.log('info', event, data);
  }

  warn(event: string, data?: Record<string, unknown>): void {
    this.log('warn', event, data);
  }

  error(event: string, data?: Record<string, unknown>): void {
    this.log('error', event, data);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new StderrJsonLogger({ ...this.bindings, ...bindings });
  }

  private log(level: Level, event: string, data?: Record<string, unknown>): void {
    const payload = {
      ts: new Date().toISOString(),
      level,
      event,
      ...this.bindings,
      ...(data ?? {}),
    };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
  }
}

export function createMcpLogger(bindings?: Record<string, unknown>): Logger {
  return new StderrJsonLogger(bindings);
}
