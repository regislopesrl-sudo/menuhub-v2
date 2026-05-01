import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';

@Controller('v2/developer')
export class DeveloperController {
  @Post('login')
  login(@Body() body: { accessCode?: string }) {
    const expectedCode = process.env.DEVELOPER_ACCESS_CODE?.trim();
    const providedCode = body?.accessCode?.trim();

    if (!expectedCode || !providedCode || expectedCode !== providedCode) {
      throw new UnauthorizedException('Codigo de acesso invalido.');
    }

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    return {
      role: 'developer' as const,
      expiresAt,
    };
  }
}
