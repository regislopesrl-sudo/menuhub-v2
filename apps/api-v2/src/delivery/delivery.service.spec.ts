import { DeliveryFeeConfigService } from './delivery-fee-config.service';
import { DeliveryService } from './delivery.service';

describe('DeliveryService', () => {
  function makeService() {
    const config = new DeliveryFeeConfigService();
    const service = new DeliveryService(config);
    return { service, config };
  }

  it('taxa por filial tem prioridade', () => {
    const { service, config } = makeService();
    config.setRules('company_x', undefined, [{ neighborhood: 'Centro', fee: 7, enabled: true }]);
    config.setRules('company_x', 'branch_a', [{ neighborhood: 'Centro', fee: 4, enabled: true }]);

    const fee = service.calculateFee({ companyId: 'company_x', branchId: 'branch_a', neighborhood: 'Centro' });
    expect(fee).toBe(4);
  });

  it('taxa por empresa funciona', () => {
    const { service, config } = makeService();
    config.setRules('company_x', undefined, [{ neighborhood: 'Bairro A', fee: 9, enabled: true }]);

    const fee = service.calculateFee({ companyId: 'company_x', neighborhood: 'Bairro A' });
    expect(fee).toBe(9);
  });

  it('bairro desativado bloqueia checkout', () => {
    const { service, config } = makeService();
    config.setRules('company_x', undefined, [{ neighborhood: 'Centro', fee: 5, enabled: false }]);

    expect(() =>
      service.calculateFee({ companyId: 'company_x', neighborhood: 'Centro' }),
    ).toThrow("Bairro 'Centro' está desativado para entrega.");
  });

  it('fallback default funciona', () => {
    const { service } = makeService();
    const fee = service.calculateFee({ companyId: 'company_x', neighborhood: 'Nao Mapeado' });
    expect(fee).toBe(12);
  });
});

