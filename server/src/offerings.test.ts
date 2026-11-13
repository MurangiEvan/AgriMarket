import assert from 'node:assert/strict';
import test from 'node:test';

import { initialCategories } from './db/catalog.js';
import { listingTypeForCategory } from './offerings.js';

test('the category list covers every offering named in the AgriMarket brief', () => {
  const slugs = new Set(initialCategories.map((category) => category.slug));
  for (const slug of ['vegetables', 'livestock', 'processed-foods', 'agricultural-services', 'equipment-services', 'drone-services', 'logistics', 'consulting-training']) {
    assert.ok(slugs.has(slug), `missing category ${slug}`);
  }
});

test('service categories create service listings and everything else creates product listings', () => {
  assert.equal(listingTypeForCategory('drone-services'), 'service');
  assert.equal(listingTypeForCategory('logistics'), 'service');
  assert.equal(listingTypeForCategory('consulting-training'), 'service');
  assert.equal(listingTypeForCategory('equipment-services'), 'service');
  assert.equal(listingTypeForCategory('agricultural-services'), 'service');
  assert.equal(listingTypeForCategory('vegetables'), 'product');
  assert.equal(listingTypeForCategory('livestock'), 'product');
});
