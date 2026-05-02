import { UnauthorizedException } from '@nestjs/common';
import { DeveloperController } from './developer.controller';

describe('DeveloperController', () => {
  const OLD_ENV = process.env.DEVELOPER_ACCESS_CODE;
  const controller = new DeveloperController();

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
  });

  it('login invalido bloqueia', () => {
    expect(() => controller.login({ accessCode: 'wrong-code' })).toThrow(UnauthorizedException);
  });
});
