import { ForbiddenException } from '@nestjs/common';
import { isDeveloper, requireDeveloper } from './developer-role';

describe('developer-role', () => {
  it('isDeveloper retorna true para role developer', () => {
    expect(isDeveloper({ userRole: 'developer' })).toBe(true);
  });

  it('requireDeveloper bloqueia admin e master', () => {
    expect(() => requireDeveloper({ userRole: 'admin' })).toThrow(ForbiddenException);
    expect(() => requireDeveloper({ userRole: 'master' })).toThrow(ForbiddenException);
  });
});
