import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator';

@Controller('v2')
export class HealthController {
  @Public()
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'api-v2',
      env: process.env.NODE_ENV ?? 'development',
    };
  }
}
