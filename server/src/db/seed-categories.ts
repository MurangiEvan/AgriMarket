import { and, eq } from 'drizzle-orm';

import { loadEnvironment } from '../config.js';
import { createDatabase } from './client.js';
import { categories, produceTypes } from './schema.js';

const initialCategories = [
  { slug: 'vegetables', name: 'Vegetables' },
  { slug: 'fruit', name: 'Fruits' },
  { slug: 'herbs', name: 'Herbs' },
  { slug: 'livestock', name: 'Livestock' },
  { slug: 'poultry', name: 'Poultry' },
  { slug: 'small-stock', name: 'Small stock' },
];

const initialProduceTypes: Record<string, string[]> = {
  vegetables: ['Butternut', 'Cabbage', 'Carrots', 'Lettuce', 'Onions', 'Peppers', 'Potatoes', 'Spinach', 'Tomatoes'],
  fruit: ['Apples', 'Avocados', 'Bananas', 'Citrus', 'Grapes', 'Mangoes', 'Peaches', 'Strawberries'],
  herbs: ['Basil', 'Coriander', 'Mint', 'Parsley', 'Rosemary', 'Thyme'],
  livestock: ['Beef cattle', 'Pigs'],
  poultry: ['Chicken', 'Duck', 'Eggs', 'Turkey'],
  'small-stock': ['Goats', 'Rabbits', 'Sheep'],
};

const { db, pool } = createDatabase(loadEnvironment().DATABASE_URL);

try {
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
} finally {
  await pool.end();
}
