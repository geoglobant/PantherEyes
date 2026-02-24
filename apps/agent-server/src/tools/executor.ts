import type { ToolName } from '../types';
import type { Logger } from '../logging';
import { ToolRegistry } from './registry';
import type {
  AgentAdapters,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolInputMap,
  ToolOutputMap,
} from './types';

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly baseLogger: Logger,
    private readonly adapters: AgentAdapters,
  ) {}

  async run<TName extends ToolName>(
    requestId: string,
    toolName: TName,
    input: ToolInputMap[TName],
  ): Promise<ToolExecutionResult<TName>> {
    const tool = this.registry.get(toolName);
    const logger = this.baseLogger.child({ requestId, tool: toolName });
    const startedAt = new Date();
    const started = Date.now();

    logger.info('tool.run.start', { input });

    const context: ToolExecutionContext = {
      requestId,
      logger,
      adapters: this.adapters,
    };

    try {
      const output = (await tool.execute(input, context)) as ToolOutputMap[TName];
      const finishedAt = new Date();
      const durationMs = Date.now() - started;
      logger.info('tool.run.success', { durationMs });
      return {
        output,
        trace: {
          id: `${requestId}:${toolName}:${started}`,
          tool: toolName,
          status: 'success',
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs,
          input,
          output,
        },
      };
    } catch (error) {
      const finishedAt = new Date();
      const durationMs = Date.now() - started;
      logger.error('tool.run.error', { durationMs, error: error as Error });
      const err = error as Error;
      return Promise.reject({
        trace: {
          id: `${requestId}:${toolName}:${started}`,
          tool: toolName,
          status: 'error' as const,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs,
          input,
          error: {
            message: err.message,
            code: err.name,
          },
        },
        cause: error,
      });
    }
  }
}
