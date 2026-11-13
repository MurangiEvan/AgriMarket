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
  // Equipment services
  'tractor hire': '🚜',
  'implement hire': '🛠️',
  'equipment repair and maintenance': '🔧',
  'irrigation installation': '💧',
  'cold room hire': '❄️',
  // Drone services
  'crop spraying by drone': '🛸',
  'crop scouting and mapping': '🗺️',
  'land surveying': '📐',
  'livestock monitoring': '📡',
  // Logistics and transport
  'produce transport': '🚚',
  'cold-chain transport': '🧊',
  'livestock transport': '🚛',
  'storage and warehousing': '🏬',
  'packhouse services': '📦',
  // Consulting and training
  'farm business planning': '📊',
  'agronomy advice': '🌱',
  'skills training': '🎓',
  'compliance and certification support': '✅',
  'market readiness coaching': '🤝',
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
  'agricultural-services': '🧑‍🌾',
  'equipment-services': '🚜',
  'drone-services': '🛸',
  logistics: '🚚',
  'consulting-training': '🎓',
};

// Categories whose listings are services rather than goods (matches the server's list).
export const SERVICE_CATEGORY_SLUGS = new Set(['agricultural-services', 'equipment-services', 'drone-services', 'logistics', 'consulting-training']);

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
  'equipment-services': '#e6e2f3',
  'drone-services': '#dceef2',
  logistics: '#f1e6dd',
  'consulting-training': '#e9f0dc',
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
