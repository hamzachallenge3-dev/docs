const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^\s"',}]+/gi,
  /sk-[A-Za-z0-9]{10,}/g,
];

export function redactSecrets(input: unknown): string {
  let text = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
  for (const re of SECRET_PATTERNS) text = text.replace(re, '[REDACTED]');
  return text;
}
