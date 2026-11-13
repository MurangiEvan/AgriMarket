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
