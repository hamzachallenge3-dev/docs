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
    // Public endpoints for ChatGPT / Codex plugin directory domain verification
    app.get('/healthz', (_req, res) =>
      res.json({ ok: true, service: 'hamza-agent-hub', version: '1.1.0', chatgpt_plugin: true })
    );
    app.get('/.well-known/openai-apps-challenge', (_req, res) => {
      const token = process.env.HAH_OPENAI_APPS_CHALLENGE || '';
      if (!token) {
        res.status(404).type('text/plain').send('set HAH_OPENAI_APPS_CHALLENGE to the portal token');
        return;
      }
      res.type('text/plain').send(token);
    });
    app.use((req, res, next) => {
      if (req.path === '/healthz' || req.path === '/.well-known/openai-apps-challenge') {
        next();
        return;
      }
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
