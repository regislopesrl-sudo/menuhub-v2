import { isProductVisibleOnChannel, resolvePublicMenuPrice } from './menu-visibility.policy';

describe('menu-visibility.policy', () => {
  it('esconde produto inativo/deletado', () => {
    expect(
      isProductVisibleOnChannel(
        { isActive: false, deletedAt: null, availableDelivery: true },
        'delivery',
      ),
    ).toBe(false);
    expect(
      isProductVisibleOnChannel(
        { isActive: true, deletedAt: new Date(), availableDelivery: true },
        'delivery',
      ),
    ).toBe(false);
  });

  it('respeita flags por canal', () => {
    const product = {
      isActive: true,
      deletedAt: null,
      availableDelivery: true,
      availableCounter: false,
      availableKiosk: true,
      availableTable: false,
    };
    expect(isProductVisibleOnChannel(product, 'delivery')).toBe(true);
    expect(isProductVisibleOnChannel(product, 'pdv')).toBe(false);
    expect(isProductVisibleOnChannel(product, 'kiosk')).toBe(true);
    expect(isProductVisibleOnChannel(product, 'waiter')).toBe(false);
  });

  it('resolve preco publico com prioridade promocional -> delivery -> sale', () => {
    expect(resolvePublicMenuPrice({ salePrice: 20, deliveryPickupPrice: 18, promotionalPrice: 15 })).toBe(15);
    expect(resolvePublicMenuPrice({ salePrice: 20, deliveryPickupPrice: 18, promotionalPrice: null })).toBe(18);
    expect(resolvePublicMenuPrice({ salePrice: 20, deliveryPickupPrice: 0, promotionalPrice: null })).toBe(20);
  });
});

