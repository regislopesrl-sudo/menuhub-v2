import { Controller, Get } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { MenuService } from './menu.service';
import { Public } from '../common/public.decorator';

@Controller('v2/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  @Public()
  async list(@CurrentContext() ctx: RequestContext) {
    return this.menuService.list(ctx);
  }
}
