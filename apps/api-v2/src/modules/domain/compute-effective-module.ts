export function computeEffectiveModule(input: {
  planEnabled: boolean;
  override: boolean | null;
}): boolean {
  return input.override !== null ? input.override : input.planEnabled;
}
