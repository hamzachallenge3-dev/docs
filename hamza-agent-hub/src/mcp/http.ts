import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { localhostHostValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { config } from '../config.js';
import { createHamzaHubServer } from './tools.js';

/** Stateless MCP: a fresh server per request, no leaking or orphaned sessions. */
export function createHttpApp() {
  if (config.authToken.length < 24) throw new Error('HAH_AUTH_TOKEN must contain at least 24 characters / يلزم رمز مصادقة قوي');
  const app = express();
  app.disable('x-powered-by');
  if (['127.0.0.1','localhost','::1'].includes(config.host)) app.use(localhostHostValidation());
  app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'hamza-agent-hub' }));
  app.get('/.well-known/openai-apps-challenge', (_req, res) => {
    const challenge = process.env.HAH_OPENAI_APPS_CHALLENGE;
    res.set('Cache-Control', 'no-store');
    if (!challenge) { res.sendStatus(404); return; }
    res.type('text/plain').send(challenge);
  });
  // Authentication precedes parsing. Never log request paths, headers or bodies.
  app.use('/mcp', (req, res, next) => {
    const expected = Buffer.from(`Bearer ${config.authToken}`);
    const supplied = Buffer.from(req.headers.authorization || '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      res.status(401).json({ error: 'unauthorized / غير مصرح' }); return;
    }
    if (req.headers.origin && !config.allowOrigins.includes(req.headers.origin)) {
      res.status(403).json({ error: 'forbidden origin / مصدر غير مسموح' }); return;
    }
    next();
  });
  // Bounded, global per-process limit; deploy edge per-client limiting as well.
  let windowStart = Date.now(), count = 0;
  app.use('/mcp', (_req, res, next) => {
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); count = 0; }
    if (++count > config.rateLimit) {
      res.set('Retry-After', '60').status(429).json({ error: 'rate limited / تجاوز حد الطلبات' }); return;
    }
    next();
  });
  app.post('/mcp', express.json({ limit: '1mb' }), async (req, res) => {
    const server = createHamzaHubServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const deadline = setTimeout(() => { res.destroy(); }, config.taskTimeoutMs);
    res.on('close', () => { clearTimeout(deadline); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed / فشل الطلب' });
    }
  });
  app.all('/mcp', (_req, res) => res.set('Allow', 'POST').sendStatus(405));
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = (err as {type?:string})?.type === 'entity.too.large' ? 413 : 400;
    res.status(status).json({error:status === 413 ? 'request too large' : 'invalid request / طلب غير صالح'});
  });
  return app;
}
