import { ProcurementController } from './procurement.controller';

describe('ProcurementController', () => {
  const service = {
    listSuppliers: jest.fn(),
    createSupplier: jest.fn(),
    updateSupplier: jest.fn(),
    listPurchaseOrders: jest.fn(),
    createPurchaseOrder: jest.fn(),
    approvePurchaseOrder: jest.fn(),
    cancelPurchaseOrder: jest.fn(),
    receivePurchaseOrder: jest.fn(),
    listReceipts: jest.fn(),
    conferenceReceipt: jest.fn(),
    listQuotations: jest.fn(),
    listPurchaseHistory: jest.fn(),
    getAverageCost: jest.fn(),
    listAccountsPayable: jest.fn(),
    listPurchaseDocuments: jest.fn(),
    importFiscalDocumentByAccessKey: jest.fn(),
    getPurchaseDocument: jest.fn(),
    mapPurchaseDocumentItem: jest.fn(),
    ignorePurchaseDocumentItem: jest.fn(),
    confirmPurchaseDocumentStockEntry: jest.fn(),
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

  it('importa cupom fiscal por chave de acesso', async () => {
    const payload = { accessKey: '35260512345678000190650010000012341000012345', documentType: 'NFCE' as const };
    service.importFiscalDocumentByAccessKey.mockResolvedValue({ id: 'pd1', status: 'PENDING_REVIEW' });
    const result = await controller.importFiscalDocumentByAccessKey(ctx, payload);
    expect(result).toEqual({ id: 'pd1', status: 'PENDING_REVIEW' });
    expect(service.importFiscalDocumentByAccessKey).toHaveBeenCalledWith(ctx, payload);
  });

  it('cancela pedido de compra', async () => {
    service.cancelPurchaseOrder.mockResolvedValue({ id: 'po1', status: 'CANCELED' });
    const result = await controller.cancelPurchaseOrder(ctx, 'po1');
    expect(result).toEqual({ id: 'po1', status: 'CANCELED' });
    expect(service.cancelPurchaseOrder).toHaveBeenCalledWith(ctx, 'po1');
  });

  it('mapeia e confirma documento fiscal de compra', async () => {
    service.mapPurchaseDocumentItem.mockResolvedValue({ id: 'pdi1', status: 'MAPPED' });
    service.confirmPurchaseDocumentStockEntry.mockResolvedValue({ documentId: 'pd1', confirmed: true, movementsCreated: 1 });

    await expect(controller.mapPurchaseDocumentItem(ctx, 'pd1', 'pdi1', { stockItemId: 'st1', conversionFactor: 1 })).resolves.toEqual({
      id: 'pdi1',
      status: 'MAPPED',
    });
    await expect(controller.confirmPurchaseDocumentStockEntry(ctx, 'pd1')).resolves.toEqual({
      documentId: 'pd1',
      confirmed: true,
      movementsCreated: 1,
    });
  });
});

