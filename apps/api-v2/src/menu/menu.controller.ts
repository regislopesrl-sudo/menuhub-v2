import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { Public } from '../common/public.decorator';
import { MenuService } from './menu.service';

@Controller('v2/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  async list(@CurrentContext() ctx: RequestContext) {
    return this.menuService.list(ctx);
  }

  @Get('public/:companySlug')
  @Public()
  async listPublicByCompanySlug(
    @Param('companySlug') companySlug: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.menuService.listPublicByCompanySlug(companySlug, branchId);
  }
}

