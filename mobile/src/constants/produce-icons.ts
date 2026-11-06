// Emoji render on web, iOS and Android without extra assets or dependencies.
const produceIcons: Record<string, string> = {
  // Vegetables
  butternut: '🎃',
  cabbage: '🥬',
  carrots: '🥕',
  lettuce: '🥗',
  onions: '🧅',
  peppers: '🫑',
  potatoes: '🥔',
  spinach: '🥬',
  tomatoes: '🍅',
  // Fruits
  apples: '🍎',
  avocados: '🥑',
  bananas: '🍌',
  citrus: '🍊',
  grapes: '🍇',
  mangoes: '🥭',
  peaches: '🍑',
  strawberries: '🍓',
  // Herbs
  basil: '🌿',
  coriander: '🌿',
  mint: '🌱',
  parsley: '🌿',
  rosemary: '🌲',
  thyme: '🌱',
  // Livestock and small stock
  'beef cattle': '🐄',
  pigs: '🐖',
  goats: '🐐',
  rabbits: '🐇',
  sheep: '🐑',
  // Poultry
  chicken: '🐔',
  duck: '🦆',
  eggs: '🥚',
  turkey: '🦃',
  // Grain
  barley: '🌾',
  maize: '🌽',
  oats: '🌾',
  sorghum: '🌾',
  soybeans: '🫘',
  sunflower: '🌻',
  wheat: '🌾',
  // Processed foods
  'dairy products': '🧀',
  'dried fruit': '🍇',
  honey: '🍯',
  'jams and preserves': '🫙',
  juices: '🧃',
  'maize meal': '🌽',
  'sauces and chutneys': '🥫',
  // Agricultural services
  'equipment hire': '🚜',
  'farm consulting': '📋',
  harvesting: '🌾',
  irrigation: '💧',
  'ploughing and tillage': '🚜',
  spraying: '💦',
  'veterinary services': '🩺',
};

const categoryIcons: Record<string, string> = {
  vegetables: '🥕',
  fruit: '🍎',
  herbs: '🌿',
  livestock: '🐄',
  poultry: '🐔',
  'small-stock': '🐐',
  grain: '🌾',
  'processed-foods': '🍯',
  'agricultural-services': '🚜',
};

const categoryColors: Record<string, string> = {
  vegetables: '#e3f1dc',
  fruit: '#fde4dc',
  herbs: '#dff0e4',
  livestock: '#efe6da',
  poultry: '#fdf0d5',
  'small-stock': '#ece9e1',
  grain: '#f8edc9',
  'processed-foods': '#f6e3cf',
  'agricultural-services': '#dde8f3',
};

export function categoryIcon(slug: string): string {
  return categoryIcons[slug] ?? '🧺';
}

export function categoryColor(slug: string): string {
  return categoryColors[slug] ?? '#e4eadf';
}

export function produceIcon(name: string, categorySlug = ''): string {
  return produceIcons[name.trim().toLowerCase()] ?? categoryIcon(categorySlug);
}
