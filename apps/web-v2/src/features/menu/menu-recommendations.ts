import type { MenuProduct } from './menu.mock';

type RecommendationItem = {
  productId: string;
};

type RecommendationOptions = {
  cartItems?: RecommendationItem[];
  sourceProductId?: string;
  limit?: number;
};

const BEVERAGE_TERMS = ['bebida', 'refrigerante', 'suco', 'agua', 'água', 'cerveja', 'coca', 'guarana', 'guaraná'];
const DESSERT_TERMS = ['sobremesa', 'doce', 'doç', 'acai', 'açaí', 'sorvete', 'bolo', 'chocolate'];
const SIDE_TERMS = ['porcao', 'porção', 'batata', 'frita', 'acompanhamento', 'molho'];
const KIDS_TERMS = ['kids', 'infantil', 'crianca', 'criança'];
const VEG_TERMS = ['veg', 'vegetariano', 'vegetariana', 'sem carne'];
const STORAGE_KEY = 'menuhub:smart-recommendations-enabled';

export function getSmartMenuRecommendations(products: MenuProduct[], options: RecommendationOptions = {}): MenuProduct[] {
  if (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === 'false') return [];
  const limit = Math.max(1, Math.min(Number(options.limit ?? 4), 8));
  const available = products.filter((product) => product.available !== false && product.channels?.delivery !== false);
  const selectedIds = new Set<string>();
  for (const item of options.cartItems ?? []) {
    if (item.productId) selectedIds.add(item.productId);
  }
  if (options.sourceProductId) selectedIds.add(options.sourceProductId);

  const anchorProducts = available.filter((product) => selectedIds.has(product.id));
  const scored = available
    .filter((product) => !selectedIds.has(product.id))
    .map((product) => ({ product, score: scoreRecommendation(product, anchorProducts, available) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || sortRecommendationTie(a.product, b.product));

  return scored.slice(0, limit).map((item) => item.product);
}

function scoreRecommendation(candidate: MenuProduct, anchors: MenuProduct[], allProducts: MenuProduct[]): number {
  const candidateKind = classifyProduct(candidate);
  const averagePrice = averageProductPrice(allProducts);
  let score = 20;

  if (candidate.featured) score += 16;
  if (candidate.imageUrl) score += 6;
  if ((candidate.sortOrder ?? 999) <= 3) score += 6;
  if ((candidate.deliveryPrice ?? candidate.price) <= averagePrice * 1.15) score += 4;

  if (anchors.length === 0) {
    score += candidateKind.main ? 10 : 0;
    score += candidateKind.beverage || candidateKind.dessert ? 6 : 0;
    return score;
  }

  for (const anchor of anchors) {
    const anchorKind = classifyProduct(anchor);
    if (anchor.categoryName && anchor.categoryName === candidate.categoryName) score += 13;
    if (anchorKind.main && candidateKind.beverage) score += 35;
    if (anchorKind.main && candidateKind.side) score += 30;
    if (anchorKind.main && candidateKind.dessert) score += 24;
    if (anchorKind.beverage && (candidateKind.main || candidateKind.side)) score += 22;
    if (anchorKind.dessert && candidateKind.beverage) score += 18;
    if (anchorKind.kids && candidateKind.beverage) score += 18;
    if (anchorKind.vegetarian && candidateKind.vegetarian) score += 18;
    if (shareNameToken(anchor, candidate)) score += 10;
  }

  return score;
}

function classifyProduct(product: MenuProduct) {
  const text = `${product.name} ${product.description} ${product.categoryName ?? ''}`.toLowerCase();
  const beverage = hasAny(text, BEVERAGE_TERMS);
  const dessert = hasAny(text, DESSERT_TERMS);
  const side = hasAny(text, SIDE_TERMS);
  const kids = hasAny(text, KIDS_TERMS);
  const vegetarian = hasAny(text, VEG_TERMS);
  return {
    beverage,
    dessert,
    side,
    kids,
    vegetarian,
    main: !beverage && !dessert && !side,
  };
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function averageProductPrice(products: MenuProduct[]) {
  const prices = products.map((product) => Number(product.deliveryPrice ?? product.price ?? 0)).filter((price) => price > 0);
  if (prices.length === 0) return 0;
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

function shareNameToken(a: MenuProduct, b: MenuProduct) {
  const aTokens = relevantTokens(a.name);
  if (aTokens.size === 0) return false;
  return Array.from(relevantTokens(b.name)).some((token) => aTokens.has(token));
}

function relevantTokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9áàâãéèêíïóôõöúçñ]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4),
  );
}

function sortRecommendationTie(a: MenuProduct, b: MenuProduct) {
  const orderA = Number(a.sortOrder ?? a.featuredSortOrder ?? 999);
  const orderB = Number(b.sortOrder ?? b.featuredSortOrder ?? 999);
  if (orderA !== orderB) return orderA - orderB;
  return a.name.localeCompare(b.name);
}
