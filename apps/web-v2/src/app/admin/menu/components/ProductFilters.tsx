import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { CHANNEL_LABELS, type AddonFilter, type AvailabilityFilter, type CategorySummary, type ChannelFilter } from '../menu-view-model';
import styles from '../page.module.css';

export function ProductFilters({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  availability,
  onAvailabilityChange,
  channel,
  onChannelChange,
  addonFilter,
  onAddonFilterChange,
  minPrice,
  onMinPriceChange,
  maxPrice,
  onMaxPriceChange,
  categories,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  availability: AvailabilityFilter;
  onAvailabilityChange: (value: AvailabilityFilter) => void;
  channel: ChannelFilter;
  onChannelChange: (value: ChannelFilter) => void;
  addonFilter: AddonFilter;
  onAddonFilterChange: (value: AddonFilter) => void;
  minPrice: string;
  onMinPriceChange: (value: string) => void;
  maxPrice: string;
  onMaxPriceChange: (value: string) => void;
  categories: CategorySummary[];
}) {
  return (
    <Card className={styles.filters}>
      <Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar produto..." />
      <Select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
        {categories.map((item) => (
          <option key={item.name} value={item.name}>{item.name === 'all' ? 'Todas categorias' : item.name}</option>
        ))}
      </Select>
      <Select value={availability} onChange={(event) => onAvailabilityChange(event.target.value as AvailabilityFilter)}>
        <option value="all">Todos os status</option>
        <option value="active">Ativos</option>
        <option value="inactive">Inativos</option>
      </Select>
      <Select value={channel} onChange={(event) => onChannelChange(event.target.value as ChannelFilter)}>
        <option value="all">Todos os canais</option>
        {CHANNEL_LABELS.map((item) => (
          <option key={item.key} value={item.key}>{item.label}</option>
        ))}
      </Select>
      <Select value={addonFilter} onChange={(event) => onAddonFilterChange(event.target.value as AddonFilter)}>
        <option value="all">Todos adicionais</option>
        <option value="with">Com adicionais</option>
        <option value="without">Sem adicionais</option>
      </Select>
      <Input value={minPrice} onChange={(event) => onMinPriceChange(event.target.value)} placeholder="Preco minimo" inputMode="decimal" />
      <Input value={maxPrice} onChange={(event) => onMaxPriceChange(event.target.value)} placeholder="Preco maximo" inputMode="decimal" />
    </Card>
  );
}
