import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from '@delivery-futuro/shared-types';

export const MODULE_ACCESS_KEY = 'module_access_key';

export const ModuleAccess = (moduleKey: ModuleKey) => SetMetadata(MODULE_ACCESS_KEY, moduleKey);

