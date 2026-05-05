export interface MenuProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  categoryName?: string;
  available?: boolean;
  salePrice?: number;
  deliveryPrice?: number;
  promotionalPrice?: number;
  categoryId?: string;
  featured?: boolean;
  featuredSortOrder?: number;
  recommendations?: MenuRecommendationConfig;
  channels?: {
    delivery?: boolean;
    pdv?: boolean;
    kiosk?: boolean;
    waiter?: boolean;
  };
  addonGroups?: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    required: boolean;
    allowMultiple: boolean;
    options: Array<{
      id: string;
      name: string;
      price: number;
      available: boolean;
    }>;
  }>;
}

export interface MenuRecommendationConfig {
  title: string;
  type: 'manual' | 'category_related' | 'best_sellers_future';
  limit: number;
  active: boolean;
  productIds: string[];
}

export const mockMenuProducts: MenuProduct[] = [
  {
    id: 'prod-1',
    name: 'X-Burger',
    description: 'Pao, carne e queijo',
    price: 29.9,
    available: true,
    featured: true,
    featuredSortOrder: 0,
    categoryName: 'Lanches',
    channels: { delivery: true, pdv: true, kiosk: true, waiter: false },
    addonGroups: [
      {
        id: 'grp_1',
        name: 'Adicionais',
        minSelect: 0,
        maxSelect: 2,
        required: false,
        allowMultiple: true,
        options: [
          { id: 'add_1', name: 'Queijo extra', price: 4, available: true },
          { id: 'add_2', name: 'Bacon', price: 6, available: true },
        ],
      },
    ],
  },
  {
    id: 'prod-2',
    name: 'Batata Frita',
    description: 'Porcao media crocante',
    price: 18.5,
    available: true,
    featured: true,
    featuredSortOrder: 1,
    categoryName: 'Acompanhamentos',
    channels: { delivery: true, pdv: true, kiosk: true, waiter: true },
  },
  {
    id: 'prod-3',
    name: 'Refrigerante Lata',
    description: '350ml gelado',
    price: 7.0,
    available: true,
    categoryName: 'Bebidas',
    channels: { delivery: true, pdv: true, kiosk: true, waiter: true },
  },
  {
    id: 'prod-4',
    name: 'Pizza Calabresa',
    description: 'Mussarela e calabresa',
    price: 59.9,
    available: false,
    categoryName: 'Pizzas',
    channels: { delivery: false, pdv: true, kiosk: false, waiter: true },
  },
];
