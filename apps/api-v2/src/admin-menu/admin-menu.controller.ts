import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { AdminMenuService } from './admin-menu.service';
import { RequireAdminGuard } from '../common/require-admin.guard';
import {
  CreateAddonGroupDto,
  CreateAddonOptionDto,
  CreateCategoryDto,
  CreateProductDto,
  FeaturedReorderDto,
  ImportPreviewDto,
  ProductRecommendationDto,
  UpdateCategoryDto,
  UpdateAddonGroupDto,
  UpdateAddonOptionDto,
  UpdateAvailabilityDto,
  UpdateProductDto,
} from './dto/admin-menu.dto';

@Controller('v2/admin/menu/products')
@UseGuards(RequireAdminGuard)
export class AdminMenuController {
  constructor(private readonly adminMenuService: AdminMenuService) {}

  @Get()
  async list(@CurrentContext() ctx: RequestContext) {
    return this.adminMenuService.listProducts(ctx);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminMenuService.getProduct(id, ctx);
  }

  @Post()
  async create(@CurrentContext() ctx: RequestContext, @Body() body: CreateProductDto) {
    return this.adminMenuService.createProduct(ctx, body);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateProductDto,
  ) {
    return this.adminMenuService.updateProduct(id, ctx, body);
  }

  @Patch(':id/availability')
  async updateAvailability(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateAvailabilityDto,
  ) {
    return this.adminMenuService.updateAvailability(id, ctx, body);
  }

  @Post(':id/duplicate')
  async duplicate(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminMenuService.duplicateProduct(id, ctx);
  }

  @Get(':id/addon-groups')
  async listAddonGroups(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminMenuService.listProductAddonGroups(id, ctx);
  }

  @Post(':id/addon-groups')
  async createAddonGroup(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: CreateAddonGroupDto,
  ) {
    return this.adminMenuService.createProductAddonGroup(id, ctx, body);
  }

  @Patch(':id/featured')
  async featured(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: { featured?: boolean },
  ) {
    return this.adminMenuService.updateFeatured(id, ctx, body);
  }

  @Get(':id/recommendations')
  async getRecommendations(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminMenuService.getRecommendations(id, ctx);
  }

  @Put(':id/recommendations')
  async putRecommendations(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: ProductRecommendationDto,
  ) {
    return this.adminMenuService.putRecommendations(id, ctx, body);
  }
}

@Controller('v2/admin/menu')
@UseGuards(RequireAdminGuard)
export class AdminMenuUtilityController {
  constructor(private readonly adminMenuService: AdminMenuService) {}

  @Post('import/preview')
  async previewImport(@CurrentContext() ctx: RequestContext, @Body() body: ImportPreviewDto) {
    return this.adminMenuService.previewImport(ctx, body);
  }

  @Get('categories')
  async listCategories(@CurrentContext() ctx: RequestContext) {
    return this.adminMenuService.listCategories(ctx);
  }

  @Post('categories')
  async createCategory(@CurrentContext() ctx: RequestContext, @Body() body: CreateCategoryDto) {
    return this.adminMenuService.createCategory(ctx, body);
  }

  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateCategoryDto,
  ) {
    return this.adminMenuService.updateCategory(id, ctx, body);
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminMenuService.deleteCategory(id, ctx);
  }

  @Post('import/commit')
  async commitImport(@CurrentContext() ctx: RequestContext, @Body() body: ImportPreviewDto) {
    return this.adminMenuService.commitImport(ctx, body);
  }

  @Patch('featured/reorder')
  async reorderFeatured(@CurrentContext() ctx: RequestContext, @Body() body: FeaturedReorderDto) {
    return this.adminMenuService.reorderFeatured(ctx, body);
  }

  @Patch('addon-groups/:groupId')
  async updateAddonGroup(
    @Param('groupId') groupId: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateAddonGroupDto,
  ) {
    return this.adminMenuService.updateAddonGroup(groupId, ctx, body);
  }

  @Delete('addon-groups/:groupId')
  async deleteAddonGroup(@Param('groupId') groupId: string, @CurrentContext() ctx: RequestContext) {
    return this.adminMenuService.deleteAddonGroup(groupId, ctx);
  }

  @Post('addon-groups/:groupId/options')
  async createAddonOption(
    @Param('groupId') groupId: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: CreateAddonOptionDto,
  ) {
    return this.adminMenuService.createAddonOption(groupId, ctx, body);
  }

  @Patch('addon-options/:optionId')
  async updateAddonOption(
    @Param('optionId') optionId: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateAddonOptionDto,
  ) {
    return this.adminMenuService.updateAddonOption(optionId, ctx, body);
  }

  @Delete('addon-options/:optionId')
  async deleteAddonOption(@Param('optionId') optionId: string, @CurrentContext() ctx: RequestContext) {
    return this.adminMenuService.deleteAddonOption(optionId, ctx);
  }
}
