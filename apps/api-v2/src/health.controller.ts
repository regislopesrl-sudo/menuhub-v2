import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator';

@Controller('v2')
export class HealthController {
  @Get('health')
  @Public()
  health() {
    return {
      status: 'ok',
      service: 'api-v2',
      env: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'unknown',
    };
  }
}
