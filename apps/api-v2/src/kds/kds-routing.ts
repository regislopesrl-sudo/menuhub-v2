export const KDS_STATIONS = [
  {
    key: 'hot_kitchen',
    label: 'Cozinha quente',
    prepTargetMinutes: 20,
    productStationKeys: ['FRYER'],
    routingDescription: 'Frituras, grelha, chapa e preparos quentes.',
  },
  {
    key: 'cold_kitchen',
    label: 'Cozinha fria',
    prepTargetMinutes: 12,
    productStationKeys: ['DRINKS', 'DESSERTS'],
    routingDescription: 'Bebidas, sobremesas e montagem fria.',
  },
  {
    key: 'assembly',
    label: 'Montagem',
    prepTargetMinutes: 10,
    productStationKeys: [],
    routingDescription: 'Pedidos delivery/web sem estacao de produto definida.',
  },
  {
    key: 'expedition',
    label: 'Expedicao',
    prepTargetMinutes: 8,
    productStationKeys: ['EXPEDITION'],
    routingDescription: 'Conferencia, embalagem e expedicao.',
  },
] as const;

export type KdsStationKey = (typeof KDS_STATIONS)[number]['key'];
export type ProductKitchenStation = 'FRYER' | 'DRINKS' | 'DESSERTS' | 'EXPEDITION';

export function mapProductKitchenStation(station?: string | null): KdsStationKey | undefined {
  const normalized = String(station ?? '').trim().toUpperCase();
  if (normalized === 'FRYER') return 'hot_kitchen';
  if (normalized === 'DRINKS' || normalized === 'DESSERTS') return 'cold_kitchen';
  if (normalized === 'EXPEDITION') return 'expedition';
  return undefined;
}

export function resolveKdsStation(input: {
  channel?: string | null;
  itemStations?: Array<string | null | undefined>;
}): KdsStationKey {
  const itemStation = input.itemStations?.map(mapProductKitchenStation).find(Boolean);
  if (itemStation) return itemStation;

  const normalized = String(input.channel ?? 'unknown').toUpperCase();
  if (normalized === 'PDV' || normalized === 'KIOSK' || normalized === 'WAITER_APP') return 'hot_kitchen';
  if (normalized === 'WEB' || normalized === 'WHATSAPP' || normalized === 'DELIVERY') return 'assembly';
  return 'expedition';
}

export function resolveKdsPrepTargetMinutes(station: KdsStationKey): number {
  return KDS_STATIONS.find((item) => item.key === station)?.prepTargetMinutes ?? 8;
}
