import { BadRequestException } from '@nestjs/common';

export function assertRequiredBillingEmail(value: unknown): string {
  const email = String(value ?? '').trim();
  if (!email) {
    throw new BadRequestException('billingEmail obrigatorio.');
  }
  return email;
}
