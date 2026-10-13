import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Lazy config so tests can set env before each case. */
export const config = {
  get root() {
    return ROOT;
  },
  get dataDir() {
    return process.env.ECC68_DATA_DIR || path.join(ROOT, 'data');
  },
  get workspacesDir() {
    return process.env.ECC68_WORKSPACES_DIR || path.join(ROOT, 'workspaces');
  },
  get dbPath() {
    return process.env.ECC68_DB_PATH || path.join(ROOT, 'data', 'ecc68.sqlite');
  },
  get concurrency() {
    return envInt('ECC68_CONCURRENCY', 2);
  },
  get maxSteps() {
    return envInt('ECC68_MAX_STEPS', 12);
  },
  get taskTimeoutMs() {
    return envInt('ECC68_TASK_TIMEOUT_MS', 120_000);
  },
  get modelUrl() {
    return process.env.ECC68_MODEL_URL || '';
  },
  get modelName() {
    return process.env.ECC68_MODEL_NAME || 'free-local';
  },
  get modelApiKey() {
    return process.env.ECC68_MODEL_API_KEY || '';
  },
  get authToken() {
    return process.env.ECC68_AUTH_TOKEN || '';
  },
  get host() {
    return process.env.ECC68_HOST || '127.0.0.1';
  },
  get port() {
    return envInt('ECC68_PORT', 8787);
  },
  get transport() {
    return (process.env.ECC68_TRANSPORT || 'stdio') as 'stdio' | 'http';
  },
  get allowOrigins() {
    return (process.env.ECC68_ALLOW_ORIGINS || 'http://127.0.0.1,http://localhost')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
};

export function modelConfigured(): boolean {
  return Boolean(config.modelUrl && config.modelUrl.length > 0);
}
