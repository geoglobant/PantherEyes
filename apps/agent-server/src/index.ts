import { createLogger } from './logging';
import { AgentRuntime } from './runtime';
import { createAgentHttpServer } from './server';

const logger = createLogger({ service: 'panthereyes-agent-server' });
const runtime = new AgentRuntime(logger);
const port = Number(process.env.PORT ?? 8787);

const server = createAgentHttpServer(runtime, logger);

server.listen(port, () => {
  logger.info('server.started', { port, baseUrl: `http://localhost:${port}` });
});
