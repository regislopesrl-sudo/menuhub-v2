import { Controller, Get } from '@nestjs/common';

@Controller('v2')
export class HealthController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'api-v2',
      env: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'unknown',
    };
  }
}
