export const ONBOARDING_STEP_KEYS = [
  'company_profile',
  'branch_profile',
  'operation_hours',
  'payment_methods',
  'catalog_basics',
  'first_order_flow',
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export interface CompleteOnboardingStepDto {
  completed: boolean;
}

