import { MenuPortMock } from '../ports/menu.mock';
import { MenuPrismaPort } from '../ports/menu.prisma';
import { selectMenuProvider } from './checkout.module';

describe('CheckoutModule menu provider selection', () => {
  const originalProvider = process.env.MENU_PROVIDER;

  afterEach(() => {
    process.env.MENU_PROVIDER = originalProvider;
  });

  it('fallback mock continua funcionando por padrao', () => {
    delete process.env.MENU_PROVIDER;
    const menuMock = new MenuPortMock();
    const menuPrisma = new MenuPrismaPort({ product: { findMany: jest.fn() } } as any);

    const selected = selectMenuProvider(menuMock, menuPrisma);
    expect(selected).toBe(menuMock);
  });

  it('usa prisma quando MENU_PROVIDER=prisma', () => {
    process.env.MENU_PROVIDER = 'prisma';
    const menuMock = new MenuPortMock();
    const menuPrisma = new MenuPrismaPort({ product: { findMany: jest.fn() } } as any);

    const selected = selectMenuProvider(menuMock, menuPrisma);
    expect(selected).toBe(menuPrisma);
  });
});

