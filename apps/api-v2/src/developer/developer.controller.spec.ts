import { UnauthorizedException } from '@nestjs/common';
import { DeveloperController } from './developer.controller';
import { verifyTechnicalToken } from '../common/technical-auth';

describe('DeveloperController', () => {
  const OLD_ENV = process.env.DEVELOPER_ACCESS_CODE;
  const controller = new DeveloperController({} as never);

  beforeEach(() => {
    process.env.DEVELOPER_ACCESS_CODE = 'my-dev-code';
  });

  afterAll(() => {
    process.env.DEVELOPER_ACCESS_CODE = OLD_ENV;
  });

  it('login com codigo valido funciona', () => {
    const result = controller.login({ accessCode: 'my-dev-code' });
    expect(result.role).toBe('developer');
    expect(typeof result.expiresAt).toBe('string');
    expect(typeof result.sessionToken).toBe('string');
    expect(verifyTechnicalToken(result.sessionToken)?.role).toBe('DEVELOPER_SESSION');
  });

  it('login invalido bloqueia', () => {
    expect(() => controller.login({ accessCode: 'wrong-code' })).toThrow(UnauthorizedException);
  });
});
