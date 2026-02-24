import type { ToolName } from '../types';
import { createToolImplementations } from './implementations';
import type { ToolDefinition } from './types';

export class ToolRegistry {
  private readonly tools = new Map<ToolName, ToolDefinition>();

  constructor(toolDefinitions: ToolDefinition[] = createToolImplementations()) {
    for (const tool of toolDefinitions) {
      this.tools.set(tool.name, tool);
    }
  }

  get<TName extends ToolName>(name: TName): ToolDefinition<TName> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not registered: ${name}`);
    }
    return tool as unknown as ToolDefinition<TName>;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }
}
