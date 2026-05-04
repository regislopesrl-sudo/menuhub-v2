import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('login tecnico com credenciais validas', async () => {
    const passwordHash = await hash('tecnico123', 10);
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'tecnico@menuhub.local',
          name: 'Tecnico',
          passwordHash,
          roles: [{ role: { name: 'TECHNICAL_ADMIN' } }],
        }),
      },
    };
    const controller = new AuthController(prisma as never);
    const result = await controller.login({ email: 'tecnico@menuhub.local', password: 'tecnico123' });
    expect(result.user.role).toBe('TECHNICAL_ADMIN');
    expect(typeof result.accessToken).toBe('string');
  });

  it('senha errada falha', async () => {
    const passwordHash = await hash('tecnico123', 10);
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'tecnico@menuhub.local',
          name: 'Tecnico',
          passwordHash,
          roles: [{ role: { name: 'TECHNICAL_ADMIN' } }],
        }),
      },
    };
    const controller = new AuthController(prisma as never);
    await expect(controller.login({ email: 'tecnico@menuhub.local', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

