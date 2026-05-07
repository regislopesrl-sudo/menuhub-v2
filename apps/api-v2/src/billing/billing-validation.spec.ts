import { BadRequestException } from '@nestjs/common';
import { assertRequiredBillingEmail } from './billing-validation';

describe('billing-validation', () => {
  it('valida billingEmail obrigatorio', () => {
    expect(assertRequiredBillingEmail(' owner@company.com ')).toBe('owner@company.com');
    expect(() => assertRequiredBillingEmail('')).toThrow(BadRequestException);
  });
});
