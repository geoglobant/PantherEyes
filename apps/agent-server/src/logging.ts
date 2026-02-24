export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

class JsonLogger implements Logger {
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
    return new JsonLogger({ ...this.bindings, ...bindings });
  }

  private log(level: Level, event: string, data?: Record<string, unknown>): void {
    const payload = {
      ts: new Date().toISOString(),
      level,
      event,
      ...this.bindings,
      ...(data ?? {}),
    };

    const sink = level === 'error' ? console.error : console.log;
    sink(JSON.stringify(payload, (_key, value) => serializeValue(value)));
  }
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

export function createLogger(bindings?: Record<string, unknown>): Logger {
  return new JsonLogger(bindings);
}
