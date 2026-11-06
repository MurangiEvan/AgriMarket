// Demo data for presentations: two approved Limpopo sellers with published, photographed listings
// (visible to buyers) plus one listing each waiting in the admin moderation queue.
// Safe to re-run: demo accounts are identified by their emails and rebuilt from scratch.
import { hash } from 'bcryptjs';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';

import { loadEnvironment } from '../config.js';
import { createPrivateStorage, createPublicImageStorage } from '../storage.js';
import { createDatabase } from './client.js';
import {
  auditLogs,
  businesses,
  categories,
  enquiries,
  listingImages,
  listings,
  produceTypes,
  users,
  verificationSubmissions,
} from './schema.js';

export const DEMO_PASSWORD = 'DemoSeller2026!';

type Art = 'tomatoes' | 'cherry' | 'peppers' | 'cabbage' | 'spinach' | 'butternut' | 'carrots' | 'onions' | 'potatoes';
type DemoListing = {
  category: string;
  produce: string;
  title: string;
  description: string;
  art: Art;
  status: 'published' | 'pending';
};
type DemoSeller = {
  email: string;
  business: {
    name: string;
    description: string;
    address: string;
    town: string;
    latitude: number;
    longitude: number;
    contactPhone: string;
    whatsappPhone: string;
  };
  listings: DemoListing[];
};

const sellers: DemoSeller[] = [
  {
    email: 'thabo.tomatoes@example.com',
    business: {
      name: 'Tomatoes by Thabo',
      description: 'Family tomato farm outside Tzaneen growing Roma and cherry tomatoes year-round. Supplying spaza shops, restaurants and market traders across Mopani.',
      address: 'Farm 12, R71, Tzaneen',
      town: 'Tzaneen',
      latitude: -23.8329,
      longitude: 30.1636,
      contactPhone: '+27821234501',
      whatsappPhone: '+27821234501',
    },
    listings: [
      {
        category: 'vegetables',
        produce: 'Tomatoes',
        title: 'Roma tomatoes – 10 kg boxes',
        description: 'Firm, deep-red Roma tomatoes picked daily. Ideal for cooking, sauces and atchar. Sold in 10 kg boxes; collection or delivery around Tzaneen.',
        art: 'tomatoes',
        status: 'published',
      },
      {
        category: 'vegetables',
        produce: 'Tomatoes',
        title: 'Sweet cherry tomatoes – 2 kg punnets',
        description: 'Sweet cherry tomatoes in 2 kg punnets, perfect for salads and lunch boxes. Weekly harvest, bulk discounts for restaurants.',
        art: 'cherry',
        status: 'published',
      },
      {
        category: 'vegetables',
        produce: 'Peppers',
        title: 'Green peppers – 5 kg bags',
        description: 'Crunchy green bell peppers grown alongside our tomatoes. 5 kg bags, available from next week.',
        art: 'peppers',
        status: 'pending',
      },
    ],
  },
  {
    email: 'maake.veggies@example.com',
    business: {
      name: 'Veggies by Maake',
      description: 'Community vegetable garden in Maake growing leafy greens and root vegetables without harsh chemicals. Fresh produce for households, schools and street vendors.',
      address: 'Maake village, near Lenyenye',
      town: 'Maake',
      latitude: -23.8515,
      longitude: 30.5568,
      contactPhone: '+27831234502',
      whatsappPhone: '+27831234502',
    },
    listings: [
      {
        category: 'vegetables',
        produce: 'Cabbage',
        title: 'Large green cabbages',
        description: 'Big, tight-headed green cabbages, about 2–3 kg each. Sold per head or by the bag of 10.',
        art: 'cabbage',
        status: 'published',
      },
      {
        category: 'vegetables',
        produce: 'Spinach',
        title: 'Fresh spinach bunches',
        description: 'Dark green Swiss chard spinach cut the morning of collection. Bunches or 5 kg crates for vendors.',
        art: 'spinach',
        status: 'published',
      },
      {
        category: 'vegetables',
        produce: 'Butternut',
        title: 'Butternut squash',
        description: 'Sweet, well-cured butternuts with long shelf life. Sold per kg or in 15 kg pockets.',
        art: 'butternut',
        status: 'published',
      },
      {
        category: 'vegetables',
        produce: 'Carrots',
        title: 'Carrots – 10 kg pockets',
        description: 'Crisp orange carrots, washed and sorted. 10 kg pockets ready for collection in Maake.',
        art: 'carrots',
        status: 'published',
      },
      {
        category: 'vegetables',
        produce: 'Onions',
        title: 'Brown onions – 10 kg bags',
        description: 'Dry, well-cured brown onions in 10 kg bags. Good keepers for traders and kitchens.',
        art: 'onions',
        status: 'published',
      },
      {
        category: 'vegetables',
        produce: 'Potatoes',
        title: 'Potatoes – 10 kg pockets',
        description: 'Washed table potatoes in 10 kg pockets. First harvest of the season, listing awaiting approval.',
        art: 'potatoes',
        status: 'pending',
      },
    ],
  },
];

const environment = loadEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);
const imageStorage = createPublicImageStorage(environment);
const privateStorage = createPrivateStorage(environment);

try {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
  const passwordHash = await hash(DEMO_PASSWORD, 12);

  for (const seller of sellers) {
    await removeExistingDemo(seller.email);

    const [user] = await db
      .insert(users)
      .values({ email: seller.email, passwordHash, role: 'seller', emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    if (!user) throw new Error(`Could not create ${seller.email}.`);

    const [business] = await db
      .insert(businesses)
      .values({
        ...seller.business,
        ownerId: user.id,
        province: 'Limpopo',
        contactEmail: seller.email,
        verificationStatus: 'approved',
      })
      .returning({ id: businesses.id });
    if (!business) throw new Error(`Could not create ${seller.business.name}.`);

    const documentKey = await privateStorage.storeVerificationDocument(demoCertificate(seller.business.name));
    const [submission] = await db
      .insert(verificationSubmissions)
      .values({
        businessId: business.id,
        submitterId: user.id,
        reviewerId: admin?.id ?? null,
        storageKeys: [documentKey],
        status: 'approved',
        sellerFeedback: 'Welcome to AgriMarket. Your business is verified.',
        internalReason: 'Demo data',
        reviewedAt: new Date(),
      })
      .returning({ id: verificationSubmissions.id });
    if (submission && admin) {
      await db.insert(auditLogs).values({
        actorId: admin.id,
        action: 'verification.approved',
        targetType: 'verification_submission',
        targetId: submission.id,
        metadata: { businessId: business.id, demo: true },
      });
    }

    for (const item of seller.listings) {
      const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, item.category)).limit(1);
      if (!category) throw new Error(`Category ${item.category} is missing. Run npm run db:seed first.`);
      const [produceType] = await db
        .select({ id: produceTypes.id })
        .from(produceTypes)
        .where(and(eq(produceTypes.categoryId, category.id), eq(produceTypes.name, item.produce)))
        .limit(1);
      if (!produceType) throw new Error(`Produce type ${item.produce} is missing. Run npm run db:seed first.`);

      const [listing] = await db
        .insert(listings)
        .values({
          businessId: business.id,
          categoryId: category.id,
          produceTypeId: produceType.id,
          title: item.title,
          description: item.description,
          province: 'Limpopo',
          town: seller.business.town,
          type: 'product',
          status: item.status,
        })
        .returning({ id: listings.id });
      if (!listing) throw new Error(`Could not create ${item.title}.`);

      const png = await sharp(Buffer.from(artSvg(item.art))).png().toBuffer();
      const stored = await imageStorage.storeListingImage({ buffer: png, size: png.byteLength });
      await db.insert(listingImages).values({
        listingId: listing.id,
        storageKey: stored.storageKey,
        altText: `${item.title} from ${seller.business.name}`,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        width: stored.width,
        height: stored.height,
        sortOrder: 0,
      });

      if (item.status === 'published' && admin) {
        await db.insert(auditLogs).values({
          actorId: admin.id,
          action: 'listing.published',
          targetType: 'listing',
          targetId: listing.id,
          metadata: { businessId: business.id, demo: true },
        });
      }
    }
    console.info(`Created ${seller.business.name} (${seller.email}) with ${seller.listings.length} listings.`);
  }

  console.info(`Demo sellers can sign in with password: ${DEMO_PASSWORD}`);
  if (!admin) console.info('No admin account exists, so approvals were not recorded in the audit log.');
} finally {
  await pool.end();
}

async function removeExistingDemo(email: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return;
  const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerId, user.id)).limit(1);
  if (business) {
    const listingRows = await db.select({ id: listings.id }).from(listings).where(eq(listings.businessId, business.id));
    const listingIds = listingRows.map((row) => row.id);
    if (listingIds.length) {
      const images = await db.select({ storageKey: listingImages.storageKey }).from(listingImages).where(inArray(listingImages.listingId, listingIds));
      for (const image of images) await imageStorage.removePublicImage(image.storageKey).catch(() => undefined);
      await db.delete(enquiries).where(inArray(enquiries.listingId, listingIds));
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, listingIds));
      await db.delete(listings).where(inArray(listings.id, listingIds));
    }
    const submissions = await db
      .select({ id: verificationSubmissions.id, storageKeys: verificationSubmissions.storageKeys })
      .from(verificationSubmissions)
      .where(eq(verificationSubmissions.businessId, business.id));
    for (const key of submissions.flatMap((row) => row.storageKeys)) await privateStorage.removePrivateObject(key).catch(() => undefined);
    if (submissions.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, submissions.map((row) => row.id)));
      await db.delete(verificationSubmissions).where(eq(verificationSubmissions.businessId, business.id));
    }
    await db.delete(enquiries).where(eq(enquiries.businessId, business.id));
    await db.delete(businesses).where(eq(businesses.id, business.id));
  }
  await db.delete(auditLogs).where(eq(auditLogs.actorId, user.id));
  await db.delete(users).where(eq(users.id, user.id));
}

function demoCertificate(businessName: string) {
  const text = `DEMO business registration certificate for ${businessName}. Not a real document.`;
  const stream = `BT /F1 14 Tf 50 750 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const pdf = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj`,
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    'trailer<</Root 1 0 R>>',
    '%%EOF',
  ].join('\n');
  const buffer = Buffer.from(pdf);
  return { buffer, size: buffer.byteLength };
}

// Simple illustrated "photos" so the demo works offline and without stock-image licences.
function artSvg(art: Art): string {
  const width = 1200;
  const height = 900;
  const backgrounds: Record<Art, [string, string]> = {
    tomatoes: ['#fff1e6', '#f6d5c0'],
    cherry: ['#fdf0e8', '#f3cfc2'],
    peppers: ['#eef7e8', '#d3e8c6'],
    cabbage: ['#eef6ea', '#cfe3c4'],
    spinach: ['#eaf4ec', '#c7e0cc'],
    butternut: ['#fdf4e3', '#f1dcb4'],
    carrots: ['#fff3e3', '#f5d9b5'],
    onions: ['#fbf3e7', '#ead7bb'],
    potatoes: ['#f8f1e6', '#e3d2b8'],
  };
  const [light, dark] = backgrounds[art];
  const items: string[] = [];
  const seeded = mulberry32(art.length * 7919 + art.charCodeAt(0));

  const grid = (count: number, size: number, draw: (x: number, y: number, s: number, i: number) => string) => {
    const columns = Math.ceil(Math.sqrt(count * 1.6));
    const rows = Math.ceil(count / columns);
    for (let index = 0; index < count; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = 170 + (column + 0.5) * ((width - 340) / columns) + (seeded() - 0.5) * size * 0.4;
      const y = 300 + (row + 0.5) * (400 / rows) + (seeded() - 0.5) * size * 0.15;
      items.push(draw(x, y, size * (0.88 + seeded() * 0.24), index));
    }
  };

  switch (art) {
    case 'tomatoes':
      grid(8, 175, (x, y, s) => tomato(x, y, s, '#d7261e', '#a3140f'));
      break;
    case 'cherry':
      grid(21, 92, (x, y, s) => tomato(x, y, s, '#e8382c', '#b01d14'));
      break;
    case 'peppers':
      grid(8, 160, (x, y, s, i) => pepper(x, y, s, i % 4 === 3 ? '#e0a21c' : '#3f8f2f'));
      break;
    case 'cabbage':
      grid(6, 185, (x, y, s) => cabbage(x, y, s));
      break;
    case 'spinach':
      grid(12, 175, (x, y, s) => leaf(x, y, s, seeded() * 360));
      break;
    case 'butternut':
      grid(6, 190, (x, y, s) => butternut(x, y, s, -25 + seeded() * 50));
      break;
    case 'carrots':
      for (let index = 0; index < 11; index += 1) items.push(carrot(230 + index * 75, 360 + (index % 2) * 50, 1 + seeded() * 0.15));
      break;
    case 'onions':
      grid(8, 165, (x, y, s) => onion(x, y, s));
      break;
    case 'potatoes':
      grid(10, 160, (x, y, s) => potato(x, y, s, seeded() * 40 - 20));
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9824f"/><stop offset="1" stop-color="#8a5a32"/></linearGradient>
    <radialGradient id="shine" cx="0.35" cy="0.3" r="0.6"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="110" y="250" width="${width - 220}" height="560" rx="26" fill="#000" opacity="0.08"/>
  <rect x="100" y="230" width="${width - 200}" height="560" rx="26" fill="url(#wood)"/>
  <rect x="130" y="260" width="${width - 260}" height="500" rx="18" fill="#6f4526" opacity="0.35"/>
  ${items.join('\n  ')}
  <rect x="100" y="725" width="${width - 200}" height="65" rx="10" fill="url(#wood)"/>
  <rect x="100" y="725" width="${width - 200}" height="10" fill="#000" opacity="0.12"/>
</svg>`;
}

function tomato(x: number, y: number, s: number, color: string, shade: string) {
  const r = s / 2;
  const calyx = Array.from({ length: 5 }, (_, i) => {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return `${x + Math.cos(angle) * r * 0.42},${y - r * 0.78 + Math.sin(angle) * r * 0.32}`;
  }).join(' ');
  return `<g><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.9}" fill="${color}" stroke="${shade}" stroke-width="3"/>
  <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.9}" fill="url(#shine)"/>
  <polygon points="${calyx}" fill="#3d7d2a"/><rect x="${x - 3}" y="${y - r * 1.05}" width="6" height="${r * 0.3}" rx="3" fill="#2f6420"/></g>`;
}

function pepper(x: number, y: number, s: number, color: string) {
  const r = s / 2;
  return `<g><path d="M ${x - r} ${y - r * 0.4} Q ${x - r * 1.05} ${y + r} ${x - r * 0.2} ${y + r * 0.95} Q ${x} ${y + r * 0.7} ${x + r * 0.2} ${y + r * 0.95} Q ${x + r * 1.05} ${y + r} ${x + r} ${y - r * 0.4} Q ${x} ${y - r * 0.9} ${x - r} ${y - r * 0.4} Z" fill="${color}" stroke="#1f4d17" stroke-opacity="0.4" stroke-width="3"/>
  <path d="M ${x - r * 0.4} ${y - r * 0.3} Q ${x - r * 0.5} ${y + r * 0.5} ${x - r * 0.25} ${y + r * 0.7}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${r * 0.18}" fill="none" stroke-linecap="round"/>
  <path d="M ${x} ${y - r * 0.65} Q ${x + r * 0.1} ${y - r * 1.1} ${x + r * 0.35} ${y - r * 1.15}" stroke="#2f6420" stroke-width="${r * 0.18}" fill="none" stroke-linecap="round"/></g>`;
}

function cabbage(x: number, y: number, s: number) {
  const r = s / 2;
  return `<g><circle cx="${x}" cy="${y}" r="${r}" fill="#6fae4f" stroke="#3f7a2c" stroke-width="4"/>
  <circle cx="${x + r * 0.08}" cy="${y + r * 0.05}" r="${r * 0.72}" fill="#8cc46a" stroke="#5c9a40" stroke-width="3"/>
  <circle cx="${x + r * 0.12}" cy="${y + r * 0.1}" r="${r * 0.45}" fill="#b4dc8e" stroke="#7db35b" stroke-width="3"/>
  <path d="M ${x - r * 0.9} ${y} Q ${x} ${y - r * 0.2} ${x + r * 0.9} ${y + r * 0.1} M ${x} ${y - r * 0.95} Q ${x - r * 0.15} ${y} ${x + r * 0.1} ${y + r * 0.95}" stroke="#e5f3d6" stroke-width="4" fill="none" opacity="0.7"/></g>`;
}

function leaf(x: number, y: number, s: number, rotation: number) {
  const r = s / 2;
  return `<g transform="rotate(${rotation.toFixed(1)} ${x} ${y})"><path d="M ${x - r} ${y} Q ${x} ${y - r * 0.85} ${x + r} ${y} Q ${x} ${y + r * 0.85} ${x - r} ${y} Z" fill="#2f7d3a" stroke="#1d5426" stroke-width="3"/>
  <path d="M ${x - r} ${y} L ${x + r * 0.9} ${y}" stroke="#a8d5a0" stroke-width="4"/>
  <path d="M ${x - r * 0.3} ${y} L ${x} ${y - r * 0.35} M ${x + r * 0.2} ${y} L ${x + r * 0.45} ${y - r * 0.28} M ${x - r * 0.3} ${y} L ${x} ${y + r * 0.35} M ${x + r * 0.2} ${y} L ${x + r * 0.45} ${y + r * 0.28}" stroke="#a8d5a0" stroke-width="3" opacity="0.8"/></g>`;
}

function butternut(x: number, y: number, s: number, rotation: number) {
  const r = s / 2;
  return `<g transform="rotate(${rotation.toFixed(1)} ${x} ${y})"><ellipse cx="${x}" cy="${y + r * 0.45}" rx="${r * 0.62}" ry="${r * 0.55}" fill="#e7b25f" stroke="#b9823a" stroke-width="3"/>
  <rect x="${x - r * 0.32}" y="${y - r * 0.85}" width="${r * 0.64}" height="${r * 1.2}" rx="${r * 0.32}" fill="#e7b25f" stroke="#b9823a" stroke-width="3"/>
  <ellipse cx="${x - r * 0.12}" cy="${y - r * 0.2}" rx="${r * 0.08}" ry="${r * 0.45}" fill="#fff" opacity="0.3"/>
  <rect x="${x - r * 0.07}" y="${y - r * 1.05}" width="${r * 0.14}" height="${r * 0.25}" rx="4" fill="#6b4a22"/></g>`;
}

function carrot(x: number, y: number, scale: number) {
  const h = 300 * scale;
  return `<g><path d="M ${x - 26} ${y} Q ${x} ${y - 8} ${x + 26} ${y} L ${x + 4} ${y + h} Q ${x} ${y + h + 8} ${x - 4} ${y + h} Z" fill="#ec7a1c" stroke="#c45a0c" stroke-width="3"/>
  <path d="M ${x - 14} ${y + h * 0.3} l 14 4 M ${x - 10} ${y + h * 0.55} l 12 3 M ${x - 6} ${y + h * 0.75} l 8 2" stroke="#c45a0c" stroke-width="3"/>
  <path d="M ${x} ${y} q -30 -70 -45 -90 M ${x} ${y} q 0 -80 5 -110 M ${x} ${y} q 30 -70 48 -88" stroke="#3d8a2a" stroke-width="10" fill="none" stroke-linecap="round"/></g>`;
}

function onion(x: number, y: number, s: number) {
  const r = s / 2;
  return `<g><path d="M ${x} ${y - r * 1.05} Q ${x + r * 1.1} ${y - r * 0.2} ${x + r * 0.75} ${y + r * 0.6} Q ${x} ${y + r * 1.05} ${x - r * 0.75} ${y + r * 0.6} Q ${x - r * 1.1} ${y - r * 0.2} ${x} ${y - r * 1.05} Z" fill="#c98a3d" stroke="#8d5a22" stroke-width="3"/>
  <path d="M ${x} ${y - r} Q ${x + r * 0.45} ${y} ${x} ${y + r * 0.9} M ${x} ${y - r} Q ${x - r * 0.45} ${y} ${x} ${y + r * 0.9}" stroke="#8d5a22" stroke-width="2.5" fill="none" opacity="0.6"/>
  <ellipse cx="${x - r * 0.3}" cy="${y - r * 0.1}" rx="${r * 0.12}" ry="${r * 0.35}" fill="#fff" opacity="0.25"/></g>`;
}

function potato(x: number, y: number, s: number, rotation: number) {
  const r = s / 2;
  return `<g transform="rotate(${rotation.toFixed(1)} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.72}" fill="#c9a06a" stroke="#8f6a3b" stroke-width="3"/>
  <circle cx="${x - r * 0.4}" cy="${y - r * 0.15}" r="4" fill="#8f6a3b"/><circle cx="${x + r * 0.3}" cy="${y + r * 0.25}" r="4" fill="#8f6a3b"/><circle cx="${x + r * 0.1}" cy="${y - r * 0.35}" r="3" fill="#8f6a3b"/>
  <ellipse cx="${x - r * 0.25}" cy="${y - r * 0.3}" rx="${r * 0.35}" ry="${r * 0.12}" fill="#fff" opacity="0.2"/></g>`;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
