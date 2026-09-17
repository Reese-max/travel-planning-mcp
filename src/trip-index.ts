import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp/server.js';
import { registerTripReadTools, tripClientFromEnv } from './mcp/trip-tools.js';

async function main(): Promise<void> {
  const client = tripClientFromEnv();
  const server = createServer();
  if (client) registerTripReadTools(server, client);
  await server.connect(new StdioServerTransport());
}
main().catch(() => {
  // Configuration can contain credentials. Do not print errors or stack traces here.
  process.stderr.write('TRIP-connected MCP startup failed. Check the operator configuration.\n');
  process.exitCode = 1;
});
