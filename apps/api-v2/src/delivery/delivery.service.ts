import { Injectable } from '@nestjs/common';
import { DeliveryFeeConfigService, type DeliveryFeeRule } from './delivery-fee-config.service';

@Injectable()
export class DeliveryService {
  constructor(private readonly feeConfig: DeliveryFeeConfigService) {}

  calculateFee(input: { companyId: string; branchId?: string; neighborhood: string }): number {
    const { rule } = this.feeConfig.resolveNeighborhoodRule(
      input.companyId,
      input.branchId,
      input.neighborhood,
    );

    if (rule && !rule.enabled) {
      throw new Error(`Bairro '${rule.neighborhood}' está desativado para entrega.`);
    }

    if (rule) {
      return rule.fee;
    }

    return this.feeConfig.getFallbackFee();
  }

  listFees(companyId: string, branchId?: string): DeliveryFeeRule[] {
    return this.feeConfig.getRules(companyId, branchId);
  }

  updateFees(companyId: string, branchId: string | undefined, fees: DeliveryFeeRule[]): DeliveryFeeRule[] {
    return this.feeConfig.setRules(companyId, branchId, fees);
  }
}
