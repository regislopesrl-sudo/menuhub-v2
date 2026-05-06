import { randomBytes, scryptSync } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function buildScryptHash(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

async function run() {
  const email = 'tecnico@menuhub.local';
  const password = (process.env.TECHNICAL_ADMIN_PASSWORD || 'tecnico123').trim();
  if (!password) {
    throw new Error('TECHNICAL_ADMIN_PASSWORD vazio.');
  }

  const role = await prisma.role.upsert({
    where: { name: 'TECHNICAL_ADMIN' },
    update: { description: 'Nivel Tecnico' },
    create: { name: 'TECHNICAL_ADMIN', description: 'Nivel Tecnico' },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Tecnico MenuHub',
      isActive: true,
      passwordHash: buildScryptHash(password),
    },
    create: {
      name: 'Tecnico MenuHub',
      email,
      passwordHash: buildScryptHash(password),
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  const defaultCompanyId = (process.env.DEFAULT_COMPANY_ID || '').trim();
  if (defaultCompanyId) {
    await prisma.userCompanyMembership.upsert({
      where: { userId_companyId: { userId: user.id, companyId: defaultCompanyId } },
      update: { isActive: true, roleKey: 'owner' },
      create: { userId: user.id, companyId: defaultCompanyId, roleKey: 'owner', isActive: true },
    });
  }

  console.log(`Technical admin seeded: ${email}`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
