import { mapProductKitchenStation, resolveKdsStation } from './kds-routing';

describe('kds-routing', () => {
  it('maps product kitchen station to KDS station', () => {
    expect(mapProductKitchenStation('FRYER')).toBe('hot_kitchen');
    expect(mapProductKitchenStation('DRINKS')).toBe('cold_kitchen');
    expect(mapProductKitchenStation('DESSERTS')).toBe('cold_kitchen');
    expect(mapProductKitchenStation('EXPEDITION')).toBe('expedition');
  });

  it('prefers product station over channel fallback', () => {
    expect(resolveKdsStation({ channel: 'PDV', itemStations: ['DESSERTS'] })).toBe('cold_kitchen');
  });

  it('falls back to channel when no product station exists', () => {
    expect(resolveKdsStation({ channel: 'PDV' })).toBe('hot_kitchen');
    expect(resolveKdsStation({ channel: 'WEB' })).toBe('assembly');
    expect(resolveKdsStation({ channel: 'unknown' })).toBe('expedition');
  });
});
