import assert from 'node:assert/strict';
import test from 'node:test';

import {
  changeMarketRadius,
  filterAndSortProduce,
  haversineDistanceKm,
  roundCoordinate,
  resolveMarketOrigin,
  type MarketProduceItem,
  type MarketFlowState,
} from './market-flow.ts';

const initialState: MarketFlowState = {
  radiusKm: 10,
  categoryId: 'vegetables-id',
  categorySlug: 'vegetables',
  searchText: 'spin',
  query: 'spin',
  screen: 'produce',
};

test('changing radius preserves the selected category and search state', () => {
  const changed = changeMarketRadius({ ...initialState, radiusKm: 25 });
  assert.equal(changed.screen, 'radius');
  assert.equal(changed.categoryId, initialState.categoryId);
  assert.equal(changed.categorySlug, initialState.categorySlug);
  assert.equal(changed.searchText, initialState.searchText);
  assert.equal(changed.query, initialState.query);
});

test('produce filtering keeps unavailable matches and sorts available items first', () => {
  const items: MarketProduceItem[] = [
    { id: 'spinach', name: 'Spinach', available: false, listingCount: 0, nearestKmRounded: null },
    { id: 'tomatoes', name: 'Tomatoes', available: true, listingCount: 2, nearestKmRounded: 3 },
    { id: 'baby-spinach', name: 'Baby Spinach', available: true, listingCount: 1, nearestKmRounded: 8 },
  ];
  assert.deepEqual(filterAndSortProduce(items, 'spin').map((item) => item.id), ['baby-spinach', 'spinach']);
  assert.deepEqual(filterAndSortProduce(items, '').map((item) => item.id), ['baby-spinach', 'tomatoes', 'spinach']);
});

test('market coordinates round to about one hundred metres before a request', () => {
  assert.equal(roundCoordinate(-25.731926), -25.732);
  assert.equal(roundCoordinate(28.18762), 28.188);
  assert.equal(roundCoordinate(-0.0001), 0);
});

test('location uses GPS first and falls back to saved profile location or no origin', () => {
  const gps = { latitude: -25.731, longitude: 28.188 };
  const saved = { label: 'Pretoria, South Africa', latitude: -25.7479, longitude: 28.2293 };
  assert.deepEqual(resolveMarketOrigin(gps, saved), { ...gps, source: 'current' });
  assert.deepEqual(resolveMarketOrigin(null, saved), { ...saved, source: 'saved' });
  assert.equal(resolveMarketOrigin(null, null), null);
});

test('buyers can manually switch between current and saved origin', () => {
  const gps = { latitude: -25.731, longitude: 28.188 };
  const saved = { label: 'Pretoria, South Africa', latitude: -25.7479, longitude: 28.2293 };
  assert.equal(resolveMarketOrigin(gps, saved, 'current')?.source, 'current');
  assert.equal(resolveMarketOrigin(gps, saved, 'saved')?.source, 'saved');
});

test('distance comparison can identify GPS and saved locations over fifty kilometres apart', () => {
  const distance = haversineDistanceKm(
    { latitude: -25.7479, longitude: 28.2293 },
    { latitude: -26.2041, longitude: 28.0473 },
  );
  assert.ok(distance > 50);
});
