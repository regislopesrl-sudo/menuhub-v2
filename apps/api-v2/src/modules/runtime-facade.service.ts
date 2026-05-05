import { Injectable } from '@nestjs/common';
import { ModulesService } from './modules.service';
import { canUseModules } from '../subscriptions/domain/can-use-modules';
import { computeEffectiveModule } from './domain/compute-effective-module';

@Injectable()
export class RuntimeFacadeService {
  constructor(private readonly modulesService: ModulesService) {}

  async getRuntimeModules(companyId: string) {
    const view = await this.modulesService.getCompanyModulesView(companyId);
    const subscriptionAllowed = canUseModules(view.subscription?.status);

    return {
      companyId,
      subscriptionStatus: view.subscription?.status ?? null,
      modules: view.modules.map((moduleItem) => ({
        moduleKey: moduleItem.moduleKey,
        enabled: subscriptionAllowed
          ? computeEffectiveModule({
              planEnabled: moduleItem.includedInPlan || moduleItem.enabledByDefault,
              override: moduleItem.overrideEnabled,
            })
          : false,
      })),
    };
  }
}
