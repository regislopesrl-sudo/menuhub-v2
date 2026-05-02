import { orderCore } from './order-core';
import type { MenuPort, PaymentPort } from './ports';
import type { DeliveryCheckoutInput } from '@delivery-futuro/shared-types';

class MenuPortOkMock implements MenuPort {
  async validateItems(input: Parameters<MenuPort['validateItems']>[0]) {
    const productMap: Record<string, { name: string; unitPrice: number }> = {
      pizza_1: { name: 'Pizza Calabresa', unitPrice: 50 },
      refri_1: { name: 'Refrigerante', unitPrice: 10 },
    };

    return {
      storeId: input.storeId,
      items: input.items.map((item) => {
        const product = productMap[item.productId];
        if (!product) {
          throw new Error(`Item inexistente no cardapio: ${item.productId}`);
        }
        return {
          productId: item.productId,
          name: product.name,
          quantity: item.quantity,
          unitPrice: product.unitPrice,
          selectedOptions: item.selectedOptions,
        };
      }),
    };
  }
}

class PaymentApprovedMock implements PaymentPort {
  async authorizePayment() {
    return { status: 'APPROVED' as const, transactionId: 'txn_ok' };
  }
}

class PaymentDeclinedMock implements PaymentPort {
  async authorizePayment() {
    return { status: 'DECLINED' as const, reason: 'Cartao recusado' };
  }
}

const baseInput: DeliveryCheckoutInput = {
  companyId: 'default-company',
  storeId: 'store_1',
  channel: 'delivery',
  customerId: 'cust_1',
  customer: { name: 'Cliente', phone: '11999990000' },
  deliveryAddress: {
    street: 'Rua A',
    number: '10',
    neighborhood: 'Centro',
  },
  deliveryFee: 8,
  items: [{ productId: 'pizza_1', quantity: 2 }],
  paymentMethod: 'PIX',
};

describe('orderCore.checkout', () => {
  it('checkout sucesso', async () => {
    const result = await orderCore.checkout(baseInput, {
      menuPort: new MenuPortOkMock(),
      paymentPort: new PaymentApprovedMock(),
    });

    expect(result.order.status).toBe('CONFIRMED');
    expect(result.order.totals.subtotal).toBe(100);
    expect(result.order.totals.deliveryFee).toBe(8);
    expect(result.order.totals.total).toBe(108);
    expect(result.payment.status).toBe('APPROVED');
  });

  it('carrinho vazio', async () => {
    await expect(
      orderCore.checkout(
        {
          ...baseInput,
          items: [],
        },
        {
          menuPort: new MenuPortOkMock(),
          paymentPort: new PaymentApprovedMock(),
        },
      ),
    ).rejects.toThrow('Carrinho vazio');
  });

  it('item invalido', async () => {
    await expect(
      orderCore.checkout(
        {
          ...baseInput,
          items: [{ productId: 'item_invalido', quantity: 1 }],
        },
        {
          menuPort: new MenuPortOkMock(),
          paymentPort: new PaymentApprovedMock(),
        },
      ),
    ).rejects.toThrow('Item inexistente no cardapio');
  });

  it('pagamento recusado', async () => {
    const result = await orderCore.checkout(baseInput, {
      menuPort: new MenuPortOkMock(),
      paymentPort: new PaymentDeclinedMock(),
    });

    expect(result.order.status).toBe('PAYMENT_FAILED');
    expect(result.payment.status).toBe('DECLINED');
  });

  it('cupom valido', async () => {
    const result = await orderCore.checkout(
      {
        ...baseInput,
        couponCode: 'BEMVINDO10',
      },
      {
        menuPort: new MenuPortOkMock(),
        paymentPort: new PaymentApprovedMock(),
      },
    );

    expect(result.order.totals.discount).toBe(10);
    expect(result.order.totals.total).toBe(98);
    expect(result.order.status).toBe('CONFIRMED');
  });

  it('checkout com addon soma preco correto', async () => {
    const result = await orderCore.checkout(
      {
        ...baseInput,
        items: [
          {
            productId: 'pizza_1',
            quantity: 2,
            selectedOptions: [
              {
                groupId: 'grp_1',
                optionId: 'add_1',
                name: 'Queijo extra',
                price: 5,
              },
            ],
          },
        ],
      },
      {
        menuPort: new MenuPortOkMock(),
        paymentPort: new PaymentApprovedMock(),
      },
    );

    expect(result.order.totals.subtotal).toBe(110);
    expect(result.order.totals.total).toBe(118);
    expect(result.order.items[0].selectedOptions?.[0].optionId).toBe('add_1');
  });
});
