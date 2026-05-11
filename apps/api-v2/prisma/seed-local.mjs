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
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFromApiV2();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/menuhub_local?schema=public';
}
const { PrismaClient } = await import('@prisma/client');
const { PrismaPg } = await import('@prisma/adapter-pg');
const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL ?? ''),
});

const COMPANY_ID = 'company-demo';
const COMPANY_NAME = 'MenuHub Demo';
const BRANCH_ID = 'branch-demo';
const BRANCH_NAME = 'Loja Demo';
const ADMIN_EMAIL = 'admin@menuhub.local';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_NAME = 'Admin MenuHub';
const MEMBERSHIP_ROLE = 'owner';
const PLANS = [
  { key: 'basic', name: 'Basic', description: 'Plano local basico para bootstrap MenuHub V2' },
  { key: 'pro', name: 'Pro', description: 'Plano local pro para bootstrap MenuHub V2' },
];
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
      name: COMPANY_NAME,
      legalName: COMPANY_NAME,
      tradeName: COMPANY_NAME,
      slug: 'company-demo',
      status: 'ACTIVE',
      email: ADMIN_EMAIL,
    },
    create: {
      id: COMPANY_ID,
      name: COMPANY_NAME,
      legalName: COMPANY_NAME,
      tradeName: COMPANY_NAME,
      slug: 'company-demo',
      status: 'ACTIVE',
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

async function ensurePlansAndSubscription() {
  const plans = [];
  for (const planDef of PLANS) {
    const plan = await prisma.plan.upsert({
      where: { key: planDef.key },
      update: {
        name: planDef.name,
        isActive: true,
        description: planDef.description,
      },
      create: {
        key: planDef.key,
        name: planDef.name,
        description: planDef.description,
        isActive: true,
      },
    });
    plans.push(plan);

    for (const moduleKey of BASIC_MODULES) {
      await prisma.planModule.upsert({
        where: {
          planId_moduleKey: {
            planId: plan.id,
            moduleKey,
          },
        },
        update: {
          enabled: true,
          adminOnly: moduleKey === 'pdv' || moduleKey === 'kds' || moduleKey === 'admin_panel',
        },
        create: {
          planId: plan.id,
          moduleKey,
          enabled: true,
          adminOnly: moduleKey === 'pdv' || moduleKey === 'kds' || moduleKey === 'admin_panel',
        },
      });
    }
  }

  const basicPlan = plans.find((p) => p.key === 'basic');
  if (!basicPlan) {
    throw new Error('Plano basic nao encontrado no bootstrap local.');
  }

  const existingSubscription = await prisma.companySubscription.findFirst({
    where: { companyId: COMPANY_ID },
    orderBy: [{ startsAt: 'desc' }],
  });

  if (!existingSubscription) {
    await prisma.companySubscription.create({
      data: {
        companyId: COMPANY_ID,
        planId: basicPlan.id,
        status: 'ACTIVE',
      },
    });
  } else {
    await prisma.companySubscription.update({
      where: { id: existingSubscription.id },
      data: {
        planId: basicPlan.id,
        status: 'ACTIVE',
        endsAt: null,
      },
    });
  }

  await prisma.companySubscription.updateMany({
    where: {
      companyId: COMPANY_ID,
      id: { not: existingSubscription?.id ?? '' },
      status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
    },
    data: {
      status: 'CANCELED',
      endsAt: new Date(),
    },
  });

  for (const moduleKey of BASIC_MODULES) {
    await prisma.companyModuleOverride.upsert({
      where: {
        companyId_moduleKey: {
          companyId: COMPANY_ID,
          moduleKey,
        },
      },
      update: {
        enabled: true,
      },
      create: {
        companyId: COMPANY_ID,
        moduleKey,
        enabled: true,
      },
    });
  }
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
  await ensurePlansAndSubscription();
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
