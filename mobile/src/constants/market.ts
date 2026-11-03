export const RADIUS_OPTIONS_KM = [5, 10, 15, 20, 25, 30, 40, 50] as const;
export const DEFAULT_RADIUS_KM = 10;

export function radiusOptionLabel(radiusKm: number) {
  return radiusKm === 5 ? '0–5 km' : `${radiusKm} km`;
}
