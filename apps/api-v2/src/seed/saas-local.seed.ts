import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL ?? ''),
});

async function run() {
  const ensurePlan = async (key: string, name: string, description: string) =>
    prisma.plan.upsert({
      where: { key },
      update: { name, isActive: true, description },
      create: { key, name, description },
    });

  const starter = await prisma.plan.upsert({
    where: { key: 'starter' },
    update: { name: 'Starter', isActive: true },
    create: { key: 'starter', name: 'Starter', description: 'Plano inicial' },
  });
  const pro = await prisma.plan.upsert({
    where: { key: 'pro' },
    update: { name: 'Pro', isActive: true },
    create: { key: 'pro', name: 'Pro', description: 'Plano profissional' },
  });
  const enterprise = await prisma.plan.upsert({
    where: { key: 'enterprise' },
    update: { name: 'Enterprise', isActive: true },
    create: { key: 'enterprise', name: 'Enterprise', description: 'Plano enterprise' },
  });
  const demo = await ensurePlan('demo', 'Demo', 'Plano de demonstracao local');
  const premium = await ensurePlan('premium', 'Premium', 'Plano premium SaaS local');

  const modulesByPlan: Record<string, string[]> = {
    starter: ['delivery', 'orders', 'menu', 'payments'],
    pro: ['delivery', 'orders', 'menu', 'payments', 'pdv', 'kds', 'whatsapp', 'reports'],
    enterprise: ['delivery', 'orders', 'menu', 'payments', 'pdv', 'kds', 'whatsapp', 'reports', 'stock', 'fiscal', 'financial', 'admin_panel'],
    demo: ['delivery', 'pdv', 'kds', 'whatsapp', 'kiosk', 'waiter_app'],
    premium: ['delivery', 'pdv', 'kds', 'whatsapp', 'kiosk', 'waiter_app', 'orders', 'menu', 'payments', 'admin_panel'],
  };

  for (const [planKey, moduleKeys] of Object.entries(modulesByPlan)) {
    const plan =
      planKey === 'starter'
        ? starter
        : planKey === 'pro'
          ? pro
          : planKey === 'enterprise'
            ? enterprise
            : planKey === 'demo'
              ? demo
              : premium;
    for (const moduleKey of moduleKeys) {
      await prisma.planModule.upsert({
        where: { planId_moduleKey: { planId: plan.id, moduleKey } },
        update: { enabled: true },
        create: {
          planId: plan.id,
          moduleKey,
          enabled: true,
          adminOnly: ['pdv', 'kds', 'admin_panel', 'reports', 'stock', 'fiscal', 'financial'].includes(moduleKey),
        },
      });
    }
  }

  const company = await prisma.company.upsert({
    where: { slug: 'demo-saas' },
    update: {
      name: 'Demo SaaS',
      legalName: 'Demo SaaS LTDA',
      document: '00000000000100',
      email: 'demo@menuhub.local',
      phone: '11999999999',
      status: 'ACTIVE',
    },
    create: {
      name: 'Demo SaaS',
      legalName: 'Demo SaaS LTDA',
      tradeName: 'Demo SaaS',
      document: '00000000000100',
      slug: 'demo-saas',
      email: 'demo@menuhub.local',
      phone: '11999999999',
      status: 'ACTIVE',
    },
  });

  const now = new Date();
  const activeCompanies = await prisma.company.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true, name: true },
  });

  for (const currentCompany of activeCompanies) {
    const lastSubscription = await prisma.companySubscription.findFirst({
      where: { companyId: currentCompany.id },
      orderBy: [{ startsAt: 'desc' }],
    });

    if (!lastSubscription) {
      await prisma.companySubscription.create({
        data: {
          companyId: currentCompany.id,
          planId: currentCompany.slug === 'demo-saas' ? premium.id : pro.id,
          status: 'ACTIVE',
          startsAt: now,
        },
      });
    }
  }

  await prisma.billingAccount.upsert({
    where: { companyId: company.id },
    update: {
      billingEmail: company.email ?? 'billing@menuhub.local',
      legalName: company.legalName,
      document: company.document,
    },
    create: {
      companyId: company.id,
      billingEmail: company.email ?? 'billing@menuhub.local',
      legalName: company.legalName,
      document: company.document,
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin.demo@menuhub.local' },
    update: { name: 'Admin Demo', isActive: true },
    create: {
      name: 'Admin Demo',
      email: 'admin.demo@menuhub.local',
      passwordHash: 'local_dev_only_change_me',
      isActive: true,
    },
  });

  console.log('Seed SaaS local finalizado. companyId=', company.id);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
