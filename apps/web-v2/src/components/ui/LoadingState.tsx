export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return <div className="ui-loading ui-card">{label}</div>;
}
