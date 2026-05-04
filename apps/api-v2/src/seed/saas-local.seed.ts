import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
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

  const modulesByPlan: Record<string, string[]> = {
    starter: ['delivery', 'orders', 'menu', 'payments'],
    pro: ['delivery', 'orders', 'menu', 'payments', 'pdv', 'kds', 'whatsapp', 'reports'],
    enterprise: ['delivery', 'orders', 'menu', 'payments', 'pdv', 'kds', 'whatsapp', 'reports', 'stock', 'fiscal', 'financial', 'admin_panel'],
  };

  for (const [planKey, moduleKeys] of Object.entries(modulesByPlan)) {
    const plan = planKey === 'starter' ? starter : planKey === 'pro' ? pro : enterprise;
    for (const moduleKey of moduleKeys) {
      await prisma.planModule.upsert({
        where: { planId_moduleKey: { planId: plan.id, moduleKey } },
        update: { enabled: true },
        create: { planId: plan.id, moduleKey, enabled: true },
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

  await prisma.companySubscription.create({
    data: {
      companyId: company.id,
      planId: pro.id,
      status: 'ACTIVE',
      startsAt: new Date(),
    },
  }).catch(() => undefined);

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
