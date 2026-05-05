import styles from './section-tabs.module.css';

export function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <nav className={styles.tabs} aria-label="Secoes">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={active === tab.key ? styles.active : ''}
          onClick={() => onChange(tab.key)}
        >
          <span>{tab.label}</span>
          {tab.count !== undefined ? <strong>{tab.count}</strong> : null}
        </button>
      ))}
    </nav>
  );
}
