export interface MenuProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryName?: string;
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

export const mockMenuProducts: MenuProduct[] = [
  {
    id: 'prod-1',
    name: 'X-Burger',
    description: 'Pao, carne e queijo',
    price: 29.9,
    categoryName: 'Lanches',
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
  { id: 'prod-2', name: 'Batata Frita', description: 'Porcao media crocante', price: 18.5, categoryName: 'Acompanhamentos' },
  { id: 'prod-3', name: 'Refrigerante Lata', description: '350ml gelado', price: 7.0, categoryName: 'Bebidas' },
  { id: 'prod-4', name: 'Pizza Calabresa', description: 'Mussarela e calabresa', price: 59.9, categoryName: 'Pizzas' },
];
