import { Controller, Get } from '@nestjs/common';

@Controller('v2')
export class HealthController {
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'api-v2',
      env: process.env.NODE_ENV ?? 'development',
    };
  }
}
