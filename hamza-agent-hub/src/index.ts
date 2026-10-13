#!/usr/bin/env node
/**
 * Hamza Agent Hub — unified MCP plugin
 * Packs: hub-boss + Automation Desk + ECC68 + Cross-Forge Intelligence
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { createHamzaHubServer } from './mcp/tools.js';
import { getDb } from './storage/db.js';
import { assertCatalog } from './runtime/registry.js';

async function main(): Promise<void> {
  getDb();
  assertCatalog();
  const server = createHamzaHubServer();

  if (config.transport === 'http') {
    if (!config.authToken) {
      console.error('HAH_AUTH_TOKEN required for HTTP transport');
      process.exit(1);
    }
    const app = createMcpExpressApp({ host: config.host });
    app.use((req, res, next) => {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (token !== config.authToken) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const origin = req.headers.origin;
      if (origin && !config.allowOrigins.some((o) => origin.startsWith(o))) {
        res.status(403).json({ error: 'forbidden origin' });
        return;
      }
      next();
    });
    app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'hamza-agent-hub' }));
    app.all('/mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
    app.listen(config.port, config.host, () => {
      console.error(`Hamza Agent Hub MCP on http://${config.host}:${config.port}/mcp`);
    });
  } else {
    await server.connect(new StdioServerTransport());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
