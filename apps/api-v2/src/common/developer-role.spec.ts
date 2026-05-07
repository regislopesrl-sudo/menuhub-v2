import { ForbiddenException } from '@nestjs/common';
import { isDeveloper, requireDeveloper, requireDeveloperOrAdmin } from './developer-role';

describe('developer-role', () => {
  it('isDeveloper retorna true para role developer', () => {
    expect(isDeveloper({ userRole: 'developer' })).toBe(true);
  });

  it('requireDeveloper bloqueia admin e master', () => {
    expect(() => requireDeveloper({ userRole: 'admin' })).toThrow(ForbiddenException);
    expect(() => requireDeveloper({ userRole: 'master' })).toThrow(ForbiddenException);
  });

  it('requireDeveloperOrAdmin permite contexto platform', () => {
    expect(() =>
      requireDeveloperOrAdmin({
        userRole: 'admin',
        permissions: ['platform:admin'],
      } as any),
    ).not.toThrow();
  });
});
