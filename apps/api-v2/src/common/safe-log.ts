const SENSITIVE_KEY_PARTS = [
  'authorization',
  'token',
  'secret',
  'password',
  'senha',
  'cookie',
  'key',
  'access_token',
  'refresh_token',
] as const;

type JsonRecord = Record<string, unknown>;

export function sanitizeForLog<T>(input: T): T {
  return sanitizeValue(input) as T;
}

export function buildStructuredLog(input: {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  requestId?: string;
  module?: string;
  metadata?: JsonRecord;
}) {
  return {
    timestamp: new Date().toISOString(),
    level: input.level,
    module: input.module ?? 'api-v2',
    requestId: input.requestId ?? null,
    message: input.message,
    metadata: sanitizeForLog(input.metadata ?? {}),
  };
}

export function safeJsonStringify(input: unknown): string {
  return JSON.stringify(sanitizeForLog(input));
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: JsonRecord = {};
  for (const [key, nestedValue] of Object.entries(value as JsonRecord)) {
    result[key] = isSensitiveKey(key) ? '[redacted]' : sanitizeValue(nestedValue);
  }
  return result;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}
