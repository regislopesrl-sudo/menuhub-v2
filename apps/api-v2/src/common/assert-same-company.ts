import { ForbiddenException } from '@nestjs/common';

export function assertSameCompany(userCompanyId: string, resourceCompanyId: string): void {
  if (userCompanyId !== resourceCompanyId) {
    throw new ForbiddenException('Recurso pertence a outra empresa.');
  }
}
