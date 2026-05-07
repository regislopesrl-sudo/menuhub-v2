import { BadRequestException } from '@nestjs/common';
import {
  assertNonEmptyPayload,
  assertRequiredModuleKey,
  assertRequiredString,
  assertValidCompanyStatus,
  assertValidDateString,
  assertValidSubscriptionStatus,
} from './developer-validation';

describe('developer-validation', () => {
  it('valida required string', () => {
    expect(assertRequiredString(' abc ', 'name')).toBe('abc');
    expect(() => assertRequiredString('   ', 'name')).toThrow(BadRequestException);
  });

  it('valida payload nao vazio por chaves', () => {
    expect(() => assertNonEmptyPayload({ name: 'x' }, ['name'], 'payload vazio')).not.toThrow();
    expect(() => assertNonEmptyPayload({}, ['name'], 'payload vazio')).toThrow(BadRequestException);
  });

  it('valida status de company e subscription', () => {
    expect(() => assertValidCompanyStatus('ACTIVE')).not.toThrow();
    expect(() => assertValidCompanyStatus('INVALID')).toThrow(BadRequestException);
    expect(() => assertValidSubscriptionStatus('TRIAL')).not.toThrow();
    expect(() => assertValidSubscriptionStatus('INVALID')).toThrow(BadRequestException);
  });

  it('valida data e moduleKey', () => {
    expect(() => assertValidDateString('2026-01-01T00:00:00.000Z', 'startsAt')).not.toThrow();
    expect(() => assertValidDateString('nope', 'startsAt')).toThrow(BadRequestException);
    expect(assertRequiredModuleKey('delivery')).toBe('delivery');
    expect(() => assertRequiredModuleKey('')).toThrow(BadRequestException);
  });
});
