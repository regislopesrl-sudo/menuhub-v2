import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

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
  promotionalPrice?: number | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductChannelsDto)
  channels?: ProductChannelsDto;
}

export class UpdateProductDto extends CreateProductDto {}

export class CreateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
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
