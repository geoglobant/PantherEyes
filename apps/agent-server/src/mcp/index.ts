import { createMcpLogger } from './logger';
import { PantherEyesMcpServer } from './server';

const logger = createMcpLogger({ service: 'panthereyes-agent-mcp' });
const server = new PantherEyesMcpServer(logger);

server.start();
