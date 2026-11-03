export type MarketProduceItem = {
  id: string;
  name: string;
  available: boolean;
  listingCount: number;
  nearestKmRounded: number | null;
};

export type MarketFlowState = {
  radiusKm: number;
  categoryId: string;
  categorySlug: string;
  searchText: string;
  query: string;
  screen: 'radius' | 'categories' | 'produce';
};

export type SavedMarketLocation = { label: string; latitude: number; longitude: number };
export type ResolvedMarketOrigin = { latitude: number; longitude: number; source: 'current' | 'saved'; label?: string };

export function roundCoordinate(value: number) {
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function resolveMarketOrigin(
  current: { latitude: number; longitude: number } | null,
  saved: SavedMarketLocation | null,
  preferred: 'current' | 'saved' = 'current',
): ResolvedMarketOrigin | null {
  if (preferred === 'saved' && saved) return { ...saved, source: 'saved' };
  if (preferred === 'current' && current) return { ...current, source: 'current' };
  if (saved) return { ...saved, source: 'saved' };
  if (current) return { ...current, source: 'current' };
  return null;
}

export function changeMarketRadius(state: MarketFlowState): MarketFlowState {
  return { ...state, screen: 'radius' };
}

export function continueMarketFlow(state: MarketFlowState): MarketFlowState {
  return { ...state, screen: state.categoryId ? 'produce' : 'categories' };
}

export function filterAndSortProduce(items: MarketProduceItem[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return items
    .filter((item) => !normalized || item.name.toLocaleLowerCase().includes(normalized))
    .sort((left, right) => Number(right.available) - Number(left.available) || left.name.localeCompare(right.name));
}

export function haversineDistanceKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
