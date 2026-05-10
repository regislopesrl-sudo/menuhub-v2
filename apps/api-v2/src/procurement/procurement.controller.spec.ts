import { ProcurementController } from './procurement.controller';

describe('ProcurementController', () => {
  const service = {
    listSuppliers: jest.fn(),
    createSupplier: jest.fn(),
    updateSupplier: jest.fn(),
    listPurchaseOrders: jest.fn(),
    createPurchaseOrder: jest.fn(),
    approvePurchaseOrder: jest.fn(),
    receivePurchaseOrder: jest.fn(),
    listReceipts: jest.fn(),
    conferenceReceipt: jest.fn(),
    listQuotations: jest.fn(),
    listPurchaseHistory: jest.fn(),
    getAverageCost: jest.fn(),
    listAccountsPayable: jest.fn(),
  };
  const controller = new ProcurementController(service as any);
  const ctx = { companyId: 'c1', branchId: 'b1', userId: 'u1' } as any;

  beforeEach(() => jest.clearAllMocks());

  it('lista fornecedores', async () => {
    service.listSuppliers.mockResolvedValue([{ id: 's1' }]);
    const result = await controller.listSuppliers(ctx);
    expect(result).toEqual([{ id: 's1' }]);
  });

  it('cria pedido de compra', async () => {
    const payload = { supplierId: 'sup1', items: [{ stockItemId: 'st1', quantity: 2, unitCost: 10 }] };
    service.createPurchaseOrder.mockResolvedValue({ id: 'po1' });
    const result = await controller.createPurchaseOrder(ctx, payload as any);
    expect(result).toEqual({ id: 'po1' });
    expect(service.createPurchaseOrder).toHaveBeenCalledWith(ctx, payload);
  });
});

