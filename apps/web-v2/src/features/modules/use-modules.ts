'use client';

import { useEffect, useMemo, useState } from 'react';
import { listCurrentCompanyModules, type CompanyModuleAccess } from './modules.api';

export interface UseModulesInput {
  companyId: string;
  branchId?: string;
  userRole?: 'admin' | 'master' | 'user';
}

export function useModules(input: UseModulesInput) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<CompanyModuleAccess[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listCurrentCompanyModules(input);
        if (!active) return;
        setModules(data);
      } catch (err) {
        if (!active) return;
        setModules([]);
        setError(err instanceof Error ? err.message : 'Falha ao carregar modulos.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [input.branchId, input.companyId, input.userRole]);

  const moduleMap = useMemo(() => new Map(modules.map((m) => [m.moduleKey, m])), [modules]);

  return {
    loading,
    error,
    modules,
    isApiHealthy: !error,
    isEnabled(moduleKey: string) {
      const module = moduleMap.get(moduleKey);
      if (!module) return false;
      return module.enabled;
    },
  };
}

