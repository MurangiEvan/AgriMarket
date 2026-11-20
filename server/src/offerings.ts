// What AgriMarket sellers can offer, following the AgriMarket brief: produce, livestock,
// processed products, agricultural services, equipment services, drone services, logistics,
// consulting and training. Listings in a service category are stored with type "service".
export const SERVICE_CATEGORY_SLUGS = new Set([
  'agricultural-services',
  'equipment-services',
  'drone-services',
  'logistics',
  'consulting-training',
]);

export function listingTypeForCategory(slug: string): 'product' | 'service' {
  return SERVICE_CATEGORY_SLUGS.has(slug) ? 'service' : 'product';
}

// Drone work is regulated by the South African Civil Aviation Authority (SACAA).
export const DRONE_CATEGORY_SLUG = 'drone-services';

export function isDroneCategory(slug: string | null | undefined): boolean {
  return slug === DRONE_CATEGORY_SLUG;
}
