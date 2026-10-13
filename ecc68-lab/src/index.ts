#!/usr/bin/env node
/**
 * ECC68 Lab — authenticated MCP plugin with 68 agents.
 * Transport: stdio (Cursor local) or Streamable HTTP (localhost / HTTPS reverse proxy).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { createEcc68Server } from './mcp/tools.js';
import { getDb } from './storage/db.js';
import { assertExactly68 } from './runtime/registry.js';

async function main(): Promise<void> {
  getDb();
  assertExactly68();
  const server = createEcc68Server();

  if (config.transport === 'http') {
    await startHttp(server);
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

async function startHttp(server: ReturnType<typeof createEcc68Server>): Promise<void> {
  const app = createMcpExpressApp({ host: config.host });

  app.use((req, res, next) => {
    if (!config.authToken) {
      res.status(503).json({
        error: 'ECC68_AUTH_TOKEN not configured — HTTP transport requires a bearer token',
      });
      return;
    }
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token !== config.authToken) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    // Origin check for non-null Origin
    const origin = req.headers.origin;
    if (origin && !config.allowOrigins.some((o) => origin.startsWith(o))) {
      res.status(403).json({ error: 'forbidden origin' });
      return;
    }
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'ecc68-lab' });
  });

  app.all('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(config.port, config.host, () => {
    console.error(
      `ECC68 MCP listening on http://${config.host}:${config.port}/mcp (Streamable HTTP, auth required)`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
