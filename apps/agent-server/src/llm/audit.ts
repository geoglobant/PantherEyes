import type { Logger } from '../logging';
import type { LlmAuditEvent, LlmAuditSink } from './types';

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/key|secret|token/i.test(key)) {
      next[key] = '[REDACTED]';
      continue;
    }
    next[key] = value;
  }
  return next;
}

export class LoggerLlmAuditSink implements LlmAuditSink {
  constructor(private readonly logger: Logger) {}

  emit(event: LlmAuditEvent): void {
    this.logger.info(event.event, {
      requestId: event.requestId,
      provider: event.provider,
      model: event.model,
      ...(event.metadata ? { metadata: sanitizeMetadata(event.metadata) } : {}),
    });
  }
}

export class InMemoryLlmAuditSink implements LlmAuditSink {
  readonly events: LlmAuditEvent[] = [];

  emit(event: LlmAuditEvent): void {
    this.events.push(event);
  }
}
