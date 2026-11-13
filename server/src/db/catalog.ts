import { and, eq } from 'drizzle-orm';

import type { Database } from './client.js';
import { categories, produceTypes } from './schema.js';

// The controlled list of categories and types sellers choose from. Safe to run repeatedly:
// it adds anything missing and re-activates listed items, but never deletes.
export const initialCategories = [
  { slug: 'vegetables', name: 'Vegetables' },
  { slug: 'fruit', name: 'Fruits' },
  { slug: 'herbs', name: 'Herbs' },
  { slug: 'livestock', name: 'Livestock' },
  { slug: 'poultry', name: 'Poultry' },
  { slug: 'small-stock', name: 'Small stock' },
  { slug: 'grain', name: 'Grain' },
  { slug: 'processed-foods', name: 'Processed foods' },
  { slug: 'agricultural-services', name: 'Agricultural services' },
  { slug: 'equipment-services', name: 'Equipment services' },
  { slug: 'drone-services', name: 'Drone services' },
  { slug: 'logistics', name: 'Logistics & transport' },
  { slug: 'consulting-training', name: 'Consulting & training' },
];

export const initialProduceTypes: Record<string, string[]> = {
  vegetables: ['Butternut', 'Cabbage', 'Carrots', 'Lettuce', 'Onions', 'Peppers', 'Potatoes', 'Spinach', 'Tomatoes'],
  fruit: ['Apples', 'Avocados', 'Bananas', 'Citrus', 'Grapes', 'Mangoes', 'Peaches', 'Strawberries'],
  herbs: ['Basil', 'Coriander', 'Mint', 'Parsley', 'Rosemary', 'Thyme'],
  livestock: ['Beef cattle', 'Pigs'],
  poultry: ['Chicken', 'Duck', 'Eggs', 'Turkey'],
  'small-stock': ['Goats', 'Rabbits', 'Sheep'],
  grain: ['Barley', 'Maize', 'Oats', 'Sorghum', 'Soybeans', 'Sunflower', 'Wheat'],
  'processed-foods': ['Dairy products', 'Dried fruit', 'Honey', 'Jams and preserves', 'Juices', 'Maize meal', 'Sauces and chutneys'],
  'agricultural-services': ['Equipment hire', 'Farm consulting', 'Harvesting', 'Irrigation', 'Ploughing and tillage', 'Spraying', 'Veterinary services'],
  'equipment-services': ['Tractor hire', 'Implement hire', 'Equipment repair and maintenance', 'Irrigation installation', 'Cold room hire'],
  'drone-services': ['Crop spraying by drone', 'Crop scouting and mapping', 'Land surveying', 'Livestock monitoring'],
  logistics: ['Produce transport', 'Cold-chain transport', 'Livestock transport', 'Storage and warehousing', 'Packhouse services'],
  'consulting-training': ['Farm business planning', 'Agronomy advice', 'Skills training', 'Compliance and certification support', 'Market readiness coaching'],
};

export async function seedCategories(db: Database) {
  await db.transaction(async (transaction) => {
    for (const category of initialCategories) {
      await transaction.insert(categories).values(category).onConflictDoUpdate({
        target: categories.slug,
        set: { name: category.name, isActive: true },
      });
    }

    const allCategories = await transaction.select({ id: categories.id }).from(categories);
    for (const category of allCategories) {
      await transaction.insert(produceTypes).values({
        categoryId: category.id,
        name: 'Other',
        active: false,
      }).onConflictDoNothing({ target: [produceTypes.categoryId, produceTypes.name] });
    }

    for (const category of initialCategories) {
      const [storedCategory] = await transaction
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.slug, category.slug), eq(categories.isActive, true)))
        .limit(1);
      if (!storedCategory) throw new Error(`The ${category.name} category was not created.`);
      for (const name of initialProduceTypes[category.slug] ?? []) {
        await transaction.insert(produceTypes).values({
          categoryId: storedCategory.id,
          name,
          active: true,
        }).onConflictDoUpdate({
          target: [produceTypes.categoryId, produceTypes.name],
          set: { active: true },
        });
      }
    }
  });
}
