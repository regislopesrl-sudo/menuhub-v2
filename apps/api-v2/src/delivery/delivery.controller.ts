import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { ModuleAccess } from '../modules/module-access.decorator';
import { ModuleGuard } from '../modules/module.guard';
import { DeliveryService } from './delivery.service';
import type { DeliveryFeeRule } from './delivery-fee-config.service';
import { CepGeocodingService } from './cep-geocoding.service';
import { DeliveryQuoteService } from './delivery-quote.service';
import { DeliveryQuoteHttpResponse, DeliveryQuoteQueryDto } from './dto/delivery-quote.dto';

@Controller('v2/delivery')
export class DeliveryController {
  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly cepGeocodingService: CepGeocodingService,
    private readonly deliveryQuoteService: DeliveryQuoteService,
  ) {}

  @Get('quote')
  @UseGuards(ModuleGuard)
  @ModuleAccess('delivery')
  async quote(
    @Query() query: DeliveryQuoteQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<DeliveryQuoteHttpResponse> {
    const address = await this.cepGeocodingService.geocodeByCep({
      cep: query.cep,
      number: query.number,
    });

    const quote = await this.deliveryQuoteService.quoteByAddress(ctx, {
      address,
      subtotal: query.subtotal,
    });

    return {
      ...quote,
      address,
    };
  }

  @Get('fee')
  getFee(@Query('neighborhood') neighborhood: string, @CurrentContext() ctx: RequestContext) {
    const normalized = (neighborhood ?? '').trim();
    const deliveryFee = this.deliveryService.calculateFee({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      neighborhood: normalized || 'unknown',
    });
    return { neighborhood: normalized, deliveryFee };
  }

  @Get('fees')
  @UseGuards(ModuleGuard)
  @ModuleAccess('admin_panel')
  listFees(@CurrentContext() ctx: RequestContext) {
    return {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      fees: this.deliveryService.listFees(ctx.companyId, ctx.branchId),
    };
  }

  @Put('fees')
  @UseGuards(ModuleGuard)
  @ModuleAccess('admin_panel')
  updateFees(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { fees: DeliveryFeeRule[] },
  ) {
    const fees = body.fees ?? [];
    return {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      fees: this.deliveryService.updateFees(ctx.companyId, ctx.branchId, fees),
      behavior: {
        disabledNeighborhood: 'bloqueia checkout com erro claro',
        fallback: 'usa taxa default quando bairro nao configurado',
      },
    };
  }
}
