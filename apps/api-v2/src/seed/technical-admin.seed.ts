import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function run() {
  const email = 'tecnico@menuhub.local';
  const password =
    process.env.TECHNICAL_ADMIN_PASSWORD?.trim() ||
    (process.env.NODE_ENV === 'production' ? '' : 'tecnico123');

  if (!password) {
    throw new Error('TECHNICAL_ADMIN_PASSWORD obrigatoria em ambiente de producao.');
  }

  const technicalRole = await prisma.role.upsert({
    where: { name: 'TECHNICAL_ADMIN' },
    update: { description: 'Nível Técnico' },
    create: { name: 'TECHNICAL_ADMIN', description: 'Nível Técnico' },
  });

  const passwordHash = await hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Usuário Técnico',
      isActive: true,
      passwordHash,
    },
    create: {
      name: 'Usuário Técnico',
      email,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: technicalRole.id } },
    update: {},
    create: { userId: user.id, roleId: technicalRole.id },
  });

  console.log(`Technical admin seed finalizado para ${email}`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

