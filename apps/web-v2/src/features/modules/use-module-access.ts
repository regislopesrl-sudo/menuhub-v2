'use client';

import { useMemo } from 'react';
import { useModules, type UseModulesInput } from './use-modules';

export function useModuleAccess(input: UseModulesInput, moduleKey: string) {
  const modulesState = useModules(input);
  const allowed = useMemo(() => {
    if (modulesState.loading) return false;
    return modulesState.isEnabled(moduleKey);
  }, [moduleKey, modulesState]);

  return {
    ...modulesState,
    allowed,
    moduleKey,
  };
}

