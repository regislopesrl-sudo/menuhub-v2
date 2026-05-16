import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export const PRODUCT_KITCHEN_STATIONS = ['FRYER', 'DRINKS', 'DESSERTS', 'EXPEDITION'] as const;
export type ProductKitchenStationDto = (typeof PRODUCT_KITCHEN_STATIONS)[number];

export class ProductChannelsDto {
  @IsOptional()
  @IsBoolean()
  delivery?: boolean;

  @IsOptional()
  @IsBoolean()
  pdv?: boolean;

  @IsOptional()
  @IsBoolean()
  kiosk?: boolean;

  @IsOptional()
  @IsBoolean()
  waiter?: boolean;
}

export class CreateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  categoryName?: string | null;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  localPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  promotionalPrice?: number | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsBoolean()
  controlsStock?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductChannelsDto)
  channels?: ProductChannelsDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  prepTimeMinutes?: number;

  @IsOptional()
  @IsIn(PRODUCT_KITCHEN_STATIONS)
  kitchenStation?: ProductKitchenStationDto | null;
}

export class UpdateProductDto extends CreateProductDto {}

export class CreateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateAvailabilityDto {
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductChannelsDto)
  channels?: ProductChannelsDto;
}

export class ImportPreviewDto {
  @IsOptional()
  @IsString()
  csv?: string;
}

export class ProductRecommendationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(['manual', 'category_related', 'best_sellers_future'])
  type?: 'manual' | 'category_related' | 'best_sellers_future';

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}

export class FeaturedReorderDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}

export class CreateAddonGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSelect?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxSelect?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;
}

export class UpdateAddonGroupDto extends CreateAddonGroupDto {}

export class UpdateAddonGroupProductsDto {
  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}

export class CreateAddonOptionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateAddonOptionDto extends CreateAddonOptionDto {}

export class CreateProductVariationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceDelta?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  localPriceDelta?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryPriceDelta?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateProductVariationDto extends CreateProductVariationDto {}

export class ComboItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class CreateComboDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboItemDto)
  items?: ComboItemDto[];
}

export class UpdateComboDto extends CreateComboDto {}
