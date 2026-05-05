import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromApiV2() {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\\r?\\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    const value = line.slice(equalIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFromApiV2();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/menuhub_v2?schema=public';
}
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const COMPANY_ID = 'company-demo';
const COMPANY_NAME = 'MenuHub Demo';
const BRANCH_ID = 'branch-demo';
const BRANCH_NAME = 'Loja Demo';
const ADMIN_EMAIL = 'admin@menuhub.local';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_NAME = 'Admin MenuHub';
const MEMBERSHIP_ROLE = 'owner';
const PLAN_KEY = 'basic';
const PLAN_NAME = 'Basic';
const BASIC_MODULES = ['orders', 'menu', 'delivery', 'pdv', 'kds', 'payments', 'admin_panel'];

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

async function ensureCompany() {
  return prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {
      legalName: COMPANY_NAME,
      tradeName: COMPANY_NAME,
    },
    create: {
      id: COMPANY_ID,
      legalName: COMPANY_NAME,
      tradeName: COMPANY_NAME,
      email: ADMIN_EMAIL,
    },
  });
}

async function ensureBranch() {
  return prisma.branch.upsert({
    where: { id: BRANCH_ID },
    update: {
      companyId: COMPANY_ID,
      name: BRANCH_NAME,
      code: 'DEMO',
      isActive: true,
    },
    create: {
      id: BRANCH_ID,
      companyId: COMPANY_ID,
      name: BRANCH_NAME,
      code: 'DEMO',
      isActive: true,
    },
  });
}

async function ensurePlanAndSubscription() {
  const plan = await prisma.plan.upsert({
    where: { key: PLAN_KEY },
    update: {
      name: PLAN_NAME,
      isActive: true,
      description: 'Plano local para bootstrap MenuHub V2',
    },
    create: {
      key: PLAN_KEY,
      name: PLAN_NAME,
      description: 'Plano local para bootstrap MenuHub V2',
      isActive: true,
    },
  });

  await prisma.planModule.deleteMany({ where: { planId: plan.id } });
  await prisma.planModule.createMany({
    data: BASIC_MODULES.map((moduleKey) => ({
      planId: plan.id,
      moduleKey,
      enabled: true,
      adminOnly: moduleKey === 'pdv' || moduleKey === 'kds' || moduleKey === 'admin_panel',
    })),
  });

  await prisma.companySubscription.upsert({
    where: {
      id: `${COMPANY_ID}::${PLAN_KEY}`,
    },
    update: {
      companyId: COMPANY_ID,
      planId: plan.id,
      status: 'ACTIVE',
      endedAt: null,
    },
    create: {
      id: `${COMPANY_ID}::${PLAN_KEY}`,
      companyId: COMPANY_ID,
      planId: plan.id,
      status: 'ACTIVE',
    },
  });

  await prisma.companySubscription.updateMany({
    where: {
      companyId: COMPANY_ID,
      id: { not: `${COMPANY_ID}::${PLAN_KEY}` },
      status: 'ACTIVE',
    },
    data: {
      status: 'INACTIVE',
      endedAt: new Date(),
    },
  });
}

async function ensureAdminUser() {
  const passwordHash = hashPassword(ADMIN_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: ADMIN_NAME,
      passwordHash,
      isActive: true,
      deletedAt: null,
    },
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userCompanyMembership.upsert({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId: COMPANY_ID,
      },
    },
    update: {
      roleKey: MEMBERSHIP_ROLE,
      isActive: true,
      acceptedAt: new Date(),
    },
    create: {
      userId: user.id,
      companyId: COMPANY_ID,
      roleKey: MEMBERSHIP_ROLE,
      isActive: true,
      acceptedAt: new Date(),
    },
  });

  await prisma.userBranchAccess.upsert({
    where: {
      userId_branchId: {
        userId: user.id,
        branchId: BRANCH_ID,
      },
    },
    update: {
      isDefault: true,
    },
    create: {
      userId: user.id,
      branchId: BRANCH_ID,
      isDefault: true,
    },
  });

  await prisma.userBranchAccess.updateMany({
    where: {
      userId: user.id,
      branchId: { not: BRANCH_ID },
      isDefault: true,
    },
    data: {
      isDefault: false,
    },
  });

  return user;
}

async function main() {
  await ensureCompany();
  await ensureBranch();
  await ensurePlanAndSubscription();
  const user = await ensureAdminUser();

  console.log('Seed local concluido com sucesso.');
  console.log(`companyId=${COMPANY_ID}`);
  console.log(`branchId=${BRANCH_ID}`);
  console.log(`adminEmail=${ADMIN_EMAIL}`);
  console.log(`adminUserId=${user.id}`);
}

main()
  .catch((error) => {
    console.error('Falha no seed local:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
