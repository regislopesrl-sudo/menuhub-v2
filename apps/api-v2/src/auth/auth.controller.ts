import { Body, Controller, Get, Post, UnauthorizedException } from '@nestjs/common';
import { AuthServiceV2 } from './auth.service';
import { Public } from '../common/public.decorator';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';

@Controller('v2/auth')
export class AuthControllerV2 {
  constructor(private readonly authService: AuthServiceV2) {}

  @Public()
  @Post('login')
  login(@Body() body: { email?: string; password?: string; branchId?: string }) {
    return this.authService.login({
      email: body.email ?? '',
      password: body.password ?? '',
      branchId: body.branchId,
    });
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: { refreshToken?: string }) {
    return this.authService.refresh({ refreshToken: body.refreshToken ?? '' });
  }

  @Public()
  @Post('logout')
  logout(@Body() body: { refreshToken?: string }) {
    return this.authService.logout({ refreshToken: body.refreshToken ?? '' });
  }

  @Get('me')
  me(@CurrentContext() ctx: RequestContext) {
    if (!ctx.userId) {
      throw new UnauthorizedException('Sessao invalida.');
    }
    return this.authService.me(ctx.userId, ctx);
  }
}
