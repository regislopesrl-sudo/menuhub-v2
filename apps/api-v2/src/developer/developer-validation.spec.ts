import { BadRequestException } from '@nestjs/common';
import {
  assertNonEmptyPayload,
  assertRequiredModuleKey,
  assertRequiredString,
  assertSubscriptionDateRange,
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

  it('valida consistencia de datas da assinatura', () => {
    expect(() =>
      assertSubscriptionDateRange(
        '2026-01-01T00:00:00.000Z',
        '2026-02-01T00:00:00.000Z',
        '2026-01-15T00:00:00.000Z',
      ),
    ).not.toThrow();

    expect(() =>
      assertSubscriptionDateRange(
        '2026-01-10T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        null,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      assertSubscriptionDateRange(
        '2026-01-10T00:00:00.000Z',
        null,
        '2026-01-01T00:00:00.000Z',
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      assertSubscriptionDateRange(
        '2026-01-01T00:00:00.000Z',
        '2026-01-10T00:00:00.000Z',
        '2026-01-15T00:00:00.000Z',
      ),
    ).toThrow(BadRequestException);
  });
});
