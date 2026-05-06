export function isProductionLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'prd';
}

export function allowHeaderContextFallback(): boolean {
  return !isProductionLike() && process.env.ALLOW_HEADER_CONTEXT_FALLBACK === 'true';
}
