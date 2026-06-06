import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { Public } from '../common/public.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { DeliveryZonesService } from './delivery-zones.service';

@Controller('v2/delivery-zones')
@UseGuards(RequireAdminGuard)
export class DeliveryZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  @Get()
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_READ, TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  list(@CurrentContext() ctx: RequestContext, @Query() query: { status?: string; type?: string }) {
    return this.deliveryZonesService.list(ctx, query);
  }

  @Get(':id')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_READ, TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  get(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.deliveryZonesService.get(ctx, id);
  }

  @Post()
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  create(@CurrentContext() ctx: RequestContext, @Body() body: Record<string, unknown>) {
    return this.deliveryZonesService.create(ctx, body);
  }

  @Patch(':id')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  update(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.deliveryZonesService.update(ctx, id, body);
  }

  @Post(':id/archive')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  archive(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.deliveryZonesService.archive(ctx, id);
  }

  @Post(':id/duplicate')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  duplicate(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.deliveryZonesService.duplicate(ctx, id);
  }

  @Post(':id/neighborhoods')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  addNeighborhood(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.deliveryZonesService.addNeighborhood(ctx, id, body);
  }

  @Post(':id/postal-code-ranges')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  addPostalCodeRange(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.deliveryZonesService.addPostalCodeRange(ctx, id, body);
  }

  @Post(':id/polygon-points')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  addPolygonPoints(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: { points?: Array<{ latitude?: number; longitude?: number }> },
  ) {
    return this.deliveryZonesService.addPolygonPoints(ctx, id, body);
  }

  @Post(':id/schedules')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_SCHEDULE, TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  addSchedule(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.deliveryZonesService.addSchedule(ctx, id, body);
  }

  @Post('import-neighborhoods')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  importNeighborhoods(@CurrentContext() ctx: RequestContext, @Body() body: Record<string, unknown>) {
    return this.deliveryZonesService.importNeighborhoods(ctx, body);
  }

  @Get(':id/dynamic-pricing')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_READ, TENANT_PERMISSIONS.DELIVERY_ZONES_PRICING)
  listDynamicPricing(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.deliveryZonesService.listDynamicPricing(ctx, id);
  }

  @Post(':id/dynamic-pricing')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_PRICING, TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  createDynamicPricing(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.deliveryZonesService.createDynamicPricing(ctx, id, body);
  }

  @Patch(':id/dynamic-pricing/:ruleId')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_PRICING, TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  updateDynamicPricing(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.deliveryZonesService.updateDynamicPricing(ctx, id, ruleId, body);
  }

  @Delete(':id/dynamic-pricing/:ruleId')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_PRICING, TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  deleteDynamicPricing(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Param('ruleId') ruleId: string) {
    return this.deliveryZonesService.deleteDynamicPricing(ctx, id, ruleId);
  }

  @Post('validate-address')
  @RequirePermissions(TENANT_PERMISSIONS.DELIVERY_ZONES_READ, TENANT_PERMISSIONS.DELIVERY_ZONES_MANAGE)
  validateAddress(@CurrentContext() ctx: RequestContext, @Body() body: Record<string, unknown>) {
    return this.deliveryZonesService.validateForAdmin(ctx, body as any);
  }
}

@Controller('v2/public/delivery')
export class PublicDeliveryZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  @Public()
  @Post('validate-address')
  validateAddress(@Body() body: Record<string, unknown>) {
    return this.deliveryZonesService.validateForPublic(body as any);
  }
}
