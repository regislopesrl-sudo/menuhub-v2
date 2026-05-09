export function isProductionLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'prd';
}

export function allowHeaderContextFallback(): boolean {
  const env = String(process.env.APP_ENV ?? '').trim().toLowerCase();
  const isLocal = env === 'local' || env === 'dev' || env === 'development';
  return !isProductionLike() && isLocal && process.env.ALLOW_HEADER_CONTEXT_FALLBACK === 'true';
}
