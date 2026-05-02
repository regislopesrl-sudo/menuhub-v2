export interface MenuCatalogItem {
  productId: string;
  name: string;
  unitPrice: number;
  available: boolean;
}

export interface MenuValidationItemInput {
  productId: string;
  quantity: number;
  selectedOptions?: Array<{
    groupId: string;
    optionId: string;
    name: string;
    price: number;
  }>;
}

export interface MenuValidationItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedOptions?: Array<{
    groupId: string;
    optionId: string;
    name: string;
    price: number;
  }>;
}

export interface MenuValidationResult {
  storeId: string;
  items: MenuValidationItem[];
}
