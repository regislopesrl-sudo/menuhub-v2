import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as auditRecorder from '../common/audit-log-recorder';
import { ProcurementService } from './procurement.service';

describe('ProcurementService', () => {
  const auditSpy = jest.spyOn(auditRecorder, 'recordAuditFromContext').mockImplementation(() => undefined);
  const prisma = {
    supplier: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    purchaseOrder: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    goodsReceipt: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    goodsReceiptItem: { create: jest.fn(), findMany: jest.fn() },
    purchaseOrderItem: { findMany: jest.fn() },
    stockItem: { findUnique: jest.fn(), update: jest.fn() },
    stockBatch: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    stockLocationBalance: { upsert: jest.fn() },
    stockMovement: { create: jest.fn(), findFirst: jest.fn() },
    purchaseDocument: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    purchaseDocumentItem: { update: jest.fn(), findMany: jest.fn() },
    supplierItemMapping: { create: jest.fn() },
    accountsPayable: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  const service = new ProcurementService(prisma);
  const ctx = { companyId: 'company-demo', branchId: 'branch-demo', userId: 'u1', requestId: 'r1' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        goodsReceipt: prisma.goodsReceipt,
        goodsReceiptItem: prisma.goodsReceiptItem,
        stockItem: prisma.stockItem,
        stockBatch: prisma.stockBatch,
        stockLocationBalance: prisma.stockLocationBalance,
        stockMovement: prisma.stockMovement,
        purchaseDocument: prisma.purchaseDocument,
        purchaseDocumentItem: prisma.purchaseDocumentItem,
        supplierItemMapping: prisma.supplierItemMapping,
        accountsPayable: prisma.accountsPayable,
        purchaseOrder: prisma.purchaseOrder,
      }),
    );
  });

  afterAll(() => {
    auditSpy.mockRestore();
  });

  it('cria fornecedor com nome obrigatorio', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    prisma.supplier.create.mockResolvedValue({ id: 's1' });
    const created = await service.createSupplier(ctx, { name: 'Fornecedor A' });
    expect(created.id).toBe('s1');
  });

  it('bloqueia fornecedor sem nome', async () => {
    await expect(service.createSupplier(ctx, { name: '' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria pedido de compra', async () => {
    prisma.supplier.findUnique.mockResolvedValue({ id: 'sup1', companyId: 'company-demo' });
    prisma.stockItem.findUnique.mockResolvedValue({ id: 'st1', companyId: 'company-demo', stockType: 'RAW_MATERIAL', isActive: true, purchaseUnit: 'UN', stockUnit: 'UN' });
    prisma.purchaseOrder.create.mockResolvedValue({ id: 'po1' });
    const created = await service.createPurchaseOrder(ctx, {
      supplierId: 'sup1',
      items: [{ stockItemId: 'st1', quantity: 2, unitCost: 10 }],
    });
    expect(created.id).toBe('po1');
  });

  it('bloqueia pedido com fornecedor fora da empresa', async () => {
    prisma.supplier.findUnique.mockResolvedValue({ id: 'sup1', companyId: 'other' });
    await expect(
      service.createPurchaseOrder(ctx, { supplierId: 'sup1', items: [{ stockItemId: 'st1', quantity: 1, unitCost: 1 }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bloqueia pedido com fornecedor inativo', async () => {
    prisma.supplier.findUnique.mockResolvedValue({ id: 'sup1', companyId: 'company-demo', active: false });
    await expect(
      service.createPurchaseOrder(ctx, { supplierId: 'sup1', items: [{ stockItemId: 'st1', quantity: 1, unitCost: 1 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancela pedido ainda nao recebido', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po1',
      branchId: 'branch-demo',
      supplierId: 'sup1',
      status: 'APPROVED',
      supplier: { id: 'sup1', companyId: 'company-demo' },
      items: [],
    });
    prisma.purchaseOrder.update.mockResolvedValue({ id: 'po1', status: 'CANCELED' });

    const result = await service.cancelPurchaseOrder(ctx, 'po1');

    expect(result).toEqual({ id: 'po1', status: 'CANCELED' });
    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 'po1' },
      data: { status: 'CANCELED', updatedById: 'u1' },
    });
  });

  it('bloqueia cancelamento de pedido recebido', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po1',
      branchId: 'branch-demo',
      supplierId: 'sup1',
      status: 'RECEIVED',
      supplier: { id: 'sup1', companyId: 'company-demo' },
      items: [],
    });
    await expect(service.cancelPurchaseOrder(ctx, 'po1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recebe pedido e vincula lote operacional ao estoque', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po1',
      branchId: 'branch-demo',
      supplierId: 'sup1',
      status: 'APPROVED',
      supplier: { id: 'sup1', companyId: 'company-demo' },
      items: [{ stockItemId: 'st1', quantity: 3 }],
    });
    prisma.goodsReceipt.create.mockResolvedValue({ id: 'gr1' });
    prisma.stockItem.findUnique.mockResolvedValue({
      id: 'st1',
      companyId: 'company-demo',
      stockType: 'RAW_MATERIAL',
      isActive: true,
      currentQuantity: 2,
      averageCost: 5,
      controlsExpiry: false,
    });
    prisma.stockBatch.findFirst.mockResolvedValue(null);
    prisma.stockBatch.create.mockResolvedValue({ id: 'batch-1' });
    prisma.stockItem.update.mockResolvedValue({ id: 'st1', currentQuantity: 5 });
    prisma.stockMovement.create.mockResolvedValue({ id: 'mov1' });
    prisma.accountsPayable.create.mockResolvedValue({ id: 'ap1' });
    prisma.purchaseOrder.update.mockResolvedValue({ id: 'po1', status: 'RECEIVED' });

    const result = await service.receivePurchaseOrder(ctx, 'po1', {
      items: [{
        stockItemId: 'st1',
        receivedQuantity: 3,
        unitCost: 7,
        orderedQuantity: 3,
        batchNumber: 'L-001',
        expirationDate: '2026-06-30',
      }],
    });

    expect(result).toEqual(expect.objectContaining({ receiptId: 'gr1', payableId: 'ap1', hasDivergence: false, totalReceived: 21 }));
    expect(prisma.stockBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stockItemId: 'st1',
        branchId: 'branch-demo',
        supplierId: 'sup1',
        batchNumber: 'L-001',
        quantityRemaining: 3,
        unitCost: 7,
      }),
    });
    expect(prisma.goodsReceiptItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ batchId: 'batch-1', batchNumber: 'L-001' }),
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ batchId: 'batch-1', movementType: 'ENTRY', movementTypeDetailed: 'purchase_receipt_entry' }),
    });
  });

  it('bloqueia recebimento duplicado do mesmo pedido', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po1',
      branchId: 'branch-demo',
      supplierId: 'sup1',
      status: 'RECEIVED',
      supplier: { id: 'sup1', companyId: 'company-demo' },
      items: [{ stockItemId: 'st1', quantity: 3 }],
    });

    await expect(service.receivePurchaseOrder(ctx, 'po1', {
      items: [{ stockItemId: 'st1', receivedQuantity: 3, unitCost: 7, orderedQuantity: 3 }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('importa cupom fiscal por chave e cria pre-importacao sem movimentar estoque', async () => {
    prisma.purchaseDocument.findFirst.mockResolvedValue(null);
    prisma.purchaseDocument.create.mockResolvedValue({
      id: 'pd1',
      accessKey: '35260512345678000190650010000012341000012345',
      documentType: 'NFCE',
      status: 'PENDING_REVIEW',
      totalAmount: 175.3,
      items: [{ id: 'pdi1' }, { id: 'pdi2' }],
    });

    const result = await service.importFiscalDocumentByAccessKey(ctx, {
      accessKey: '35260512345678000190650010000012341000012345',
      documentType: 'NFCE',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'pd1', status: 'PENDING_REVIEW' }));
    expect(prisma.purchaseDocument.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        companyId: 'company-demo',
        branchId: 'branch-demo',
        status: 'PENDING_REVIEW',
        items: expect.objectContaining({ create: expect.any(Array) }),
      }),
      include: { items: true },
    }));
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it('bloqueia cupom fiscal duplicado', async () => {
    prisma.purchaseDocument.findFirst.mockResolvedValue({ id: 'pd1', status: 'PENDING_REVIEW' });
    await expect(service.importFiscalDocumentByAccessKey(ctx, {
      accessKey: '35260512345678000190650010000012341000012345',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mapeia item fiscal para insumo da empresa', async () => {
    prisma.purchaseDocument.findFirst.mockResolvedValue({
      id: 'pd1',
      companyId: 'company-demo',
      branchId: 'branch-demo',
      supplierId: 'sup1',
      issuerCnpj: '12345678000190',
      status: 'PENDING_REVIEW',
      items: [{ id: 'pdi1', fiscalCode: 'F1', ean: null, description: 'QUEIJO', unit: 'kg' }],
    });
    prisma.stockItem.findUnique.mockResolvedValue({ id: 'st1', companyId: 'company-demo', stockType: 'RAW_MATERIAL', isActive: true });
    prisma.purchaseDocumentItem.update.mockResolvedValue({ id: 'pdi1', status: 'MAPPED' });
    prisma.purchaseDocumentItem.findMany.mockResolvedValue([{ status: 'MAPPED' }]);
    prisma.purchaseDocument.update.mockResolvedValue({ id: 'pd1', status: 'READY_TO_CONFIRM' });
    prisma.supplierItemMapping.create.mockResolvedValue({ id: 'map1' });

    const result = await service.mapPurchaseDocumentItem(ctx, 'pd1', 'pdi1', { stockItemId: 'st1', conversionFactor: 1 });

    expect(result).toEqual({ id: 'pdi1', status: 'MAPPED' });
    expect(prisma.purchaseDocumentItem.update).toHaveBeenCalledWith({
      where: { id: 'pdi1' },
      data: { mappedStockItemId: 'st1', conversionFactor: 1, status: 'MAPPED' },
    });
  });

  it('confirma entrada somente com itens mapeados e cria movimento de estoque', async () => {
    prisma.purchaseDocument.findFirst.mockResolvedValue({
      id: 'pd1',
      accessKey: '35260512345678000190650010000012341000012345',
      companyId: 'company-demo',
      branchId: 'branch-demo',
      supplierId: 'sup1',
      status: 'READY_TO_CONFIRM',
      items: [{
        id: 'pdi1',
        status: 'MAPPED',
        mappedStockItemId: 'st1',
        quantity: 2,
        conversionFactor: 1,
        unitPrice: 10,
        totalAmount: 20,
        batchNumber: 'L-001',
        expirationDate: new Date('2026-06-30T00:00:00.000Z'),
      }],
    });
    prisma.stockMovement.findFirst = jest.fn().mockResolvedValue(null);
    prisma.stockItem.findUnique.mockResolvedValue({ id: 'st1', companyId: 'company-demo', stockType: 'RAW_MATERIAL', isActive: true, currentQuantity: 3, averageCost: 8, controlsExpiry: false });
    prisma.stockBatch.findFirst.mockResolvedValue(null);
    prisma.stockBatch.create.mockResolvedValue({ id: 'b1' });
    prisma.stockItem.update.mockResolvedValue({ id: 'st1', currentQuantity: 5 });
    prisma.stockMovement.create.mockResolvedValue({ id: 'm1' });
    prisma.purchaseDocumentItem.update.mockResolvedValue({ id: 'pdi1', status: 'CONFIRMED' });
    prisma.purchaseDocument.update.mockResolvedValue({ id: 'pd1', status: 'CONFIRMED' });

    const result = await service.confirmPurchaseDocumentStockEntry(ctx, 'pd1');

    expect(result).toEqual(expect.objectContaining({ documentId: 'pd1', confirmed: true, movementsCreated: 1 }));
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stockItemId: 'st1',
        batchId: 'b1',
        movementType: 'ENTRY',
        movementTypeDetailed: 'purchase_fiscal_document_entry',
        sourceModule: 'purchase_fiscal_document',
      }),
    });
  });

  it('bloqueia confirmacao com item nao mapeado', async () => {
    prisma.purchaseDocument.findFirst.mockResolvedValue({
      id: 'pd1',
      companyId: 'company-demo',
      branchId: 'branch-demo',
      status: 'PENDING_REVIEW',
      items: [{ id: 'pdi1', status: 'UNMAPPED' }],
    });
    await expect(service.confirmPurchaseDocumentStockEntry(ctx, 'pd1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

