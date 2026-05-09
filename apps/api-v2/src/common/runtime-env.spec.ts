import { allowHeaderContextFallback } from './runtime-env';

describe('runtime-env', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...snapshot };
  });

  it('permite fallback somente em APP_ENV local/dev com flag ativa', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'local';
    process.env.ALLOW_HEADER_CONTEXT_FALLBACK = 'true';
    expect(allowHeaderContextFallback()).toBe(true);

    process.env.APP_ENV = 'hml';
    expect(allowHeaderContextFallback()).toBe(false);
  });

  it('bloqueia fallback em ambiente production-like', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'prd';
    process.env.ALLOW_HEADER_CONTEXT_FALLBACK = 'true';
    expect(allowHeaderContextFallback()).toBe(false);
  });
});
