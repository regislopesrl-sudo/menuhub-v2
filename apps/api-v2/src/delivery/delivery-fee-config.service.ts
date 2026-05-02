import { Injectable } from '@nestjs/common';

export interface DeliveryFeeRule {
  neighborhood: string;
  fee: number;
  enabled: boolean;
}

@Injectable()
export class DeliveryFeeConfigService {
  private readonly fallbackFee = 12;
  private readonly byScope = new Map<string, DeliveryFeeRule[]>();

  constructor() {
    this.byScope.set(this.scopeKey('company-demo', undefined), [
      { neighborhood: 'Centro', fee: 5, enabled: true },
      { neighborhood: 'Bairro A', fee: 8, enabled: true },
      { neighborhood: 'Bairro B', fee: 10, enabled: true },
    ]);
  }

  getRules(companyId: string, branchId?: string): DeliveryFeeRule[] {
    return [...(this.byScope.get(this.scopeKey(companyId, branchId)) ?? [])];
  }

  setRules(companyId: string, branchId: string | undefined, rules: DeliveryFeeRule[]): DeliveryFeeRule[] {
    const normalized = rules.map((rule) => ({
      neighborhood: rule.neighborhood.trim(),
      fee: Number(rule.fee),
      enabled: Boolean(rule.enabled),
    }));
    this.byScope.set(this.scopeKey(companyId, branchId), normalized);
    return this.getRules(companyId, branchId);
  }

  resolveNeighborhoodRule(
    companyId: string,
    branchId: string | undefined,
    neighborhood: string,
  ): { rule?: DeliveryFeeRule; source: 'branch' | 'company' | 'default' } {
    const normalizedNeighborhood = neighborhood.trim().toLowerCase();
    const branchRule = this.getRules(companyId, branchId).find(
      (rule) => rule.neighborhood.trim().toLowerCase() === normalizedNeighborhood,
    );
    if (branchRule) {
      return { rule: branchRule, source: 'branch' };
    }

    const companyRule = this.getRules(companyId, undefined).find(
      (rule) => rule.neighborhood.trim().toLowerCase() === normalizedNeighborhood,
    );
    if (companyRule) {
      return { rule: companyRule, source: 'company' };
    }

    return { source: 'default' };
  }

  getFallbackFee(): number {
    return this.fallbackFee;
  }

  private scopeKey(companyId: string, branchId?: string): string {
    return `${companyId}:${branchId ?? '*'}`;
  }
}

