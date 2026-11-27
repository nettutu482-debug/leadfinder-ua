import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app';

let appInstancePromise: Promise<any> | null = null;

async function getExpressApp() {
  if (!appInstancePromise) {
    appInstancePromise = createApp({ serveStatic: false });
  }
  return appInstancePromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getExpressApp();
    return app(req, res);
  } catch (err: any) {
    console.error('API serverless handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Server initialization failed',
        details: err?.message || String(err),
      })
    );
  }
}
```[cite: 15]

---

### 2. `St/package.json`

```json
{
  "name": "react-example",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development tsx server.ts",
    "build": "vite build",
    "start": "node server.ts",
    "preview": "vite preview",
    "clean": "rm -rf dist server.js",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@google/genai": "^2.4.0",
    "@tailwindcss/vite": "^4.3.3",
    "@vitejs/plugin-react": "^6.1.1",
    "lucide-react": "^0.546.0",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "vite": "^8.3.0",
    "express": "^4.21.2",
    "dotenv": "^17.2.3",
    "motion": "^12.23.24",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.1",
    "@types/pg": "^8.11.10",
    "autoprefixer": "^10.4.21",
    "esbuild": ">=0.25.0",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.21.0",
    "typescript": "~5.8.2",
    "@types/express": "^4.17.21"
  }
}
```[cite: 18]

---

### 3. `St/server.ts`

```ts
import 'dotenv/config';
import { createApp } from './server/app';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = await createApp({ serveStatic: true });
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LeadFinder server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
```[cite: 19]

---

### 4. `St/server/app.ts`

```ts
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  createManualLead,
  deleteLead,
  deleteLeadsBulk,
  getAllLeads,
  getLeadStats,
  getRecentSearches,
  recordSearchHistory,
  updateLead,
  upsertLeadsBatch,
  type UpsertPlaceInput,
} from './db';
import {
  CRM_STATUS_OPTIONS,
  sanitizeExternalUrl,
  type CrmStatus,
  type WebsiteFilter,
} from '../src/shared/types';

const VALID_STATUSES = new Set<CrmStatus>(CRM_STATUS_OPTIONS.map((s) => s.value));

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'nextPageToken',
].join(',');

function getMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.MAPS_API_KEY ||
    ''
  ).trim();
}

interface GooglePlaceApiItem {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string; languageCode?: string };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
}

interface GooglePlacesSearchResponse {
  places?: GooglePlaceApiItem[];
  nextPageToken?: string;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

const PRIMARY_TYPE_UK_FALLBACK: Record<string, string> = {
  barber_shop: 'Барбершоп',
  beauty_salon: 'Салон краси',
  hair_salon: 'Перукарня',
  nail_salon: 'Манікюрна студія',
  car_repair: 'СТО / Автосервіс',
  car_wash: 'Автомийка',
  dentist: 'Стоматологія',
  dental_clinic: 'Стоматологічна клініка',
  cafe: 'Кафе / Кавʼярня',
  coffee_shop: 'Кавʼярня',
  restaurant: 'Ресторан',
  gym: 'Фітнес-клуб',
  fitness_center: 'Фітнес-центр',
  veterinary_care: 'Ветеринарна клініка',
  lawyer: 'Юридичні послуги',
  real_estate_agency: 'Агентство нерухомості',
  florist: 'Квітковий магазин',
};

function formatCategoryLabel(place: GooglePlaceApiItem, fallbackNiche: string): string {
  const display = place.primaryTypeDisplayName?.text?.trim();
  if (display) return display;
  if (place.primaryType && PRIMARY_TYPE_UK_FALLBACK[place.primaryType]) {
    return PRIMARY_TYPE_UK_FALLBACK[place.primaryType];
  }
  return fallbackNiche;
}

export async function createApp(options?: { serveStatic?: boolean }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    const apiKey = getMapsApiKey();
    res.json({
      ok: true,
      placesApiConfigured: Boolean(apiKey),
      database: 'postgres',
    });
  });

  app.get('/api/leads', async (_req, res) => {
    try {
      const leads = await getAllLeads();
      const stats = await getLeadStats();
      const recentSearches = await getRecentSearches(8);
      res.json({ ok: true, leads, stats, recentSearches });
    } catch (err) {
      console.error('Failed to read leads:', err);
      res.status(500).json({ ok: false, message: 'Не вдалося завантажити збережені бізнеси.' });
    }
  });

  app.post('/api/leads', async (req, res) => {
    try {
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const city = typeof body.city === 'string' ? body.city.trim() : '';
      const category = typeof body.category === 'string' ? body.category.trim() : '';
      const address = typeof body.address === 'string' ? body.address.trim() : '';
      const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;
      const rawWebsite = typeof body.website === 'string' ? body.website.trim() : '';
      const rawMapsUri = typeof body.googleMapsUri === 'string' ? body.googleMapsUri.trim() : '';
      const note = typeof body.note === 'string' ? body.note.trim() : '';

      if (!name || !city) {
        return res.status(400).json({
          ok: false,
          message: 'Назва бізнесу та місто є обовʼязковими.',
        });
      }

      const safeWebsite = rawWebsite ? sanitizeExternalUrl(rawWebsite) : null;
      if (rawWebsite && !safeWebsite) {
        return res.status(400).json({
          ok: false,
          message: 'Некоректне посилання на вебсайт. Використовуйте http:// або https://.',
        });
      }

      const safeMapsUri = rawMapsUri ? sanitizeExternalUrl(rawMapsUri) : null;
      if (rawMapsUri && !safeMapsUri) {
        return res.status(400).json({
          ok: false,
          message: 'Некоректне посилання на Google Maps.',
        });
      }

      const lead = await createManualLead({
        id: `manual_${crypto.randomUUID()}`, name, category: category \vert{}\vert{} 'Малий / середній бізнес', address: address \vert{}\vert{} city, city, niche: category \vert{}\vert{} 'Додано вручну', phone, website: safeWebsite, googleMapsUri: safeMapsUri, note, });  const stats = await getLeadStats(); res.status(201).json({ ok: true, lead, stats }); } catch (err) { console.error('Failed to create manual lead:', err); res.status(500).json({ ok: false, message: 'Не вдалося додати бізнес.' }); } });  app.patch('/api/leads/:id', async (req, res) => { try { const id = req.params.id; const body = req.body ?? {}; const patch: { crmStatus?: CrmStatus; note?: string } = {};  if (body.crmStatus !== undefined) { if (typeof body.crmStatus !== 'string' \vert{}\vert{} !VALID_STATUSES.has(body.crmStatus as CrmStatus)) { return res.status(400).json({ ok: false, message: 'Недійсний CRM-статус.' }); } patch.crmStatus = body.crmStatus as CrmStatus; }  if (body.note !== undefined) { if (typeof body.note !== 'string') { return res.status(400).json({ ok: false, message: 'Нотатка має бути текстом.' }); } patch.note = body.note.slice(0, 2000); }  const updated = await updateLead(id, patch); if (!updated) { return res.status(404).json({ ok: false, message: 'Бізнес не знайдено.' }); }  const stats = await getLeadStats(); res.json({ ok: true, lead: updated, stats }); } catch (err) { console.error('Failed to update lead:', err); res.status(500).json({ ok: false, message: 'Не вдалося оновити дані бізнесу.' }); } });  app.delete('/api/leads/:id', async (req, res) => { try { const deleted = await deleteLead(req.params.id); if (!deleted) { return res.status(404).json({ ok: false, message: 'Бізнес не знайдено.' }); } const stats = await getLeadStats(); res.json({ ok: true, stats }); } catch (err) { console.error('Failed to delete lead:', err); res.status(500).json({ ok: false, message: 'Не вдалося видалити бізнес.' }); } });  app.post('/api/leads/bulk-delete', async (req, res) => { try { const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string') : []; const deletedCount = await deleteLeadsBulk(ids); const stats = await getLeadStats(); res.json({ ok: true, deletedCount, stats }); } catch (err) { console.error('Failed to bulk delete leads:', err); res.status(500).json({ ok: false, message: 'Не вдалося видалити вибрані бізнеси.' }); } });  app.post('/api/places/search', async (req, res) => { const apiKey = getMapsApiKey(); if (!apiKey) { return res.status(503).json({ ok: false, errorCode: 'API_KEY_MISSING', message: 'Google Places API (New) ще не підключено. Додайте змінну середовища GOOGLE_MAPS_API_KEY у налаштуваннях середовища (Secrets) на сервері.', }); }  const body = req.body ?? {}; const city = typeof body.city === 'string' ? body.city.trim() : ''; const nicheLabel = typeof body.nicheLabel === 'string' ? body.nicheLabel.trim() : ''; const searchTerm = typeof body.searchTerm === 'string' ? body.searchTerm.trim() : ''; const includedType = typeof body.includedType === 'string' && /^[a-z0-9_]+$/.test(body.includedType.trim()) ? body.includedType.trim() : undefined; const requestedCountRaw = Number(body.limit ?? 20); const limit = Math.min(Math.max(Number.isFinite(requestedCountRaw) ? requestedCountRaw : 20, 1), 60); const websiteFilter: WebsiteFilter = body.websiteFilter === 'without_website' \vert{}\vert{} body.websiteFilter === 'with_website' ? body.websiteFilter : 'all';  if (!city \vert{}\vert{} !searchTerm) { return res.status(400).json({ ok: false, errorCode: 'INVALID_INPUT', message: 'Вкажіть місто (або населений пункт) та нішу бізнесу для пошуку.', }); }  const cityIncludesUkraine = /україн\vert{}ukraine/i.test(city); const textQuery = cityIncludesUkraine ? `${searchTerm} ${city}` : `${searchTerm} ${city}, Україна`;  const collected: GooglePlaceApiItem[] = []; let pageToken: string \vert{} undefined; const maxPages = Math.ceil(limit / 20);  try { for (let page = 0; page < maxPages && collected.length < limit; page++) { const remaining = limit - collected.length; const pageSize = Math.min(20, remaining);  const requestPayload: Record<string, unknown> = { textQuery, languageCode: 'uk', regionCode: 'UA', pageSize, };  if (includedType) { requestPayload.includedType = includedType; } if (pageToken) { requestPayload.pageToken = pageToken; }  const apiResponse = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK, 'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio', }, body: JSON.stringify(requestPayload), });  const payload = (await apiResponse.json().catch(() => ({}))) as GooglePlacesSearchResponse;  if (!apiResponse.ok) { const apiStatus = payload.error?.status \vert{}\vert{} ''; const apiMessage = payload.error?.message \vert{}\vert{} `HTTP ${apiResponse.status}`;

          if (apiResponse.status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
            return res.status(429).json({
              ok: false,
              errorCode: 'QUOTA_EXCEEDED',
              message:
                'Вичерпано ліміт запитів Google Maps Platform API. Спробуйте пізніше або перевірте квоти вашого проєкту.',
            });
          }

          if (apiResponse.status === 401 || apiResponse.status === 403 || apiStatus === 'PERMISSION_DENIED') {
            return res.status(403).json({
              ok: false,
              errorCode: 'API_PERMISSION_DENIED',
              message:
                'Ключ API відхилено Google Places API (New). Перевірте, що Places API (New) увімкнено у Google Cloud та ключ не має несумісних обмежень.',
            });
          }

          if (page > 0 && collected.length > 0) {
            break;
          }

          return res.status(502).json({
            ok: false,
            errorCode: 'PLACES_API_ERROR',
            message: `Помилка Google Places API (New): ${apiMessage}`, }); }  const pagePlaces = Array.isArray(payload.places) ? payload.places : []; for (const p of pagePlaces) { if (p.id && collected.length < limit) { collected.push(p); } }  pageToken = payload.nextPageToken; if (!pageToken \vert{}\vert{} pagePlaces.length === 0) { break; } }  const upsertInputs: UpsertPlaceInput[] = []; const seenIds = new Set<string>();  for (const place of collected) { if (!place.id \vert{}\vert{} seenIds.has(place.id)) continue; seenIds.add(place.id);  const safeWebsite = sanitizeExternalUrl(place.websiteUri); const safeMapsUri = sanitizeExternalUrl(place.googleMapsUri) \vert{}\vert{} `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id)}`;

        upsertInputs.push({
          id: place.id,
          placeId: place.id,
          name: place.displayName?.text?.trim() || 'Без назви',
          category: formatCategoryLabel(place, nicheLabel || searchTerm),
          primaryType: place.primaryType ?? null,
          address:
            place.shortFormattedAddress?.trim() ||
            place.formattedAddress?.trim() ||
            city,
          city,
          niche: nicheLabel || searchTerm,
          phone:
            place.nationalPhoneNumber?.trim() ||
            place.internationalPhoneNumber?.trim() ||
            null,
          website: safeWebsite,
          hasWebsite: Boolean(safeWebsite),
          googleMapsUri: safeMapsUri,
          rating: typeof place.rating === 'number' ? place.rating : null,
          userRatingCount:
            typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
          businessStatus: place.businessStatus ?? null,
          lat: typeof place.location?.latitude === 'number' ? place.location.latitude : null,
          lng: typeof place.location?.longitude === 'number' ? place.location.longitude : null,
          source: 'google_places',
        });
      }

      const { savedLeads, newCount } = await upsertLeadsBatch(upsertInputs);
      const noWebsiteCount = savedLeads.filter((l) => !l.hasWebsite).length;

      await recordSearchHistory({
        city,
        niche: nicheLabel || searchTerm,
        requestedCount: limit,
        returnedCount: savedLeads.length,
        newLeadsCount: newCount,
        noWebsiteCount,
      });

      const matchedResults = savedLeads.filter((lead) => {
        if (websiteFilter === 'without_website') return !lead.hasWebsite;
        if (websiteFilter === 'with_website') return lead.hasWebsite;
        return true;
      });

      const allLeads = await getAllLeads();
      const stats = await getLeadStats();
      const recentSearches = await getRecentSearches(8);

      res.json({
        ok: true,
        query: textQuery,
        totalFetched: savedLeads.length,
        newSavedCount: newCount,
        noWebsiteCount,
        matchedIds: matchedResults.map((l) => l.id),
        leads: allLeads,
        stats,
        recentSearches,
      });
    } catch (err) {
      console.error('Places search unexpected error:', err);
      res.status(500).json({
        ok: false,
        errorCode: 'SERVER_ERROR',
        message: 'Не вдалося виконати запит до Google Places API (New). Перевірте підключення до мережі.',
      });
    }
  });

  if (options?.serveStatic !== false) {
    const distDir = path.resolve(process.cwd(), 'dist');
    const distIndex = path.join(distDir, 'index.html');
    const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(distIndex);

    if (isDev) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(distIndex);
      });
    }
  }

  return app;
}
```[cite: 20]

---

### 5. `St/server/db.ts`

```ts
import { Pool } from 'pg';
import type {
  BusinessLead,
  CrmStatus,
  LeadSource,
  LeadStats,
  SearchHistoryItem,
} from '../src/shared/types';

function getDatabaseUrl(): string {
  const url = (
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    ''
  ).trim();

  if (!url) {
    throw new Error(
      'Не задана строка подключения к базе данных (DATABASE_URL). Добавьте её в переменные окружения.'
    );
  }
  return url;
}

const globalForDb = globalThis as unknown as {
  __leadfinderPgPool?: Pool;
  __leadfinderDbInitPromise?: Promise<void>;
};

function getPool(): Pool {
  if (!globalForDb.__leadfinderPgPool) {
    const connectionString = getDatabaseUrl();
    const isLocalhost =
      connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

    globalForDb.__leadfinderPgPool = new Pool({
      connectionString,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return globalForDb.__leadfinderPgPool;
}

export async function ensureDatabaseInitialized(): Promise<void> {
  if (!globalForDb.__leadfinderDbInitPromise) {
    globalForDb.__leadfinderDbInitPromise = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS leads (
          id TEXT PRIMARY KEY,
          place_id TEXT UNIQUE,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          primary_type TEXT,
          address TEXT NOT NULL,
          city TEXT NOT NULL,
          niche TEXT NOT NULL,
          phone TEXT,
          website TEXT,
          has_website INTEGER NOT NULL DEFAULT 0,
          google_maps_uri TEXT,
          rating DOUBLE PRECISION,
          user_rating_count INTEGER,
          business_status TEXT,
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          crm_status TEXT NOT NULL DEFAULT 'new',
          note TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT 'google_places',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
        CREATE INDEX IF NOT EXISTS idx_leads_crm_status ON leads(crm_status);
        CREATE INDEX IF NOT EXISTS idx_leads_has_website ON leads(has_website);
        CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

        CREATE TABLE IF NOT EXISTS search_history (
          id SERIAL PRIMARY KEY,
          city TEXT NOT NULL,
          niche TEXT NOT NULL,
          requested_count INTEGER NOT NULL,
          returned_count INTEGER NOT NULL,
          new_leads_count INTEGER NOT NULL,
          no_website_count INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    })().catch((err) => {
      globalForDb.__leadfinderDbInitPromise = undefined;
      throw err;
    });
  }

  await globalForDb.__leadfinderDbInitPromise;
}

interface LeadRow {
  id: string;
  place_id: string | null;
  name: string;
  category: string;
  primary_type: string | null;
  address: string;
  city: string;
  niche: string;
  phone: string | null;
  website: string | null;
  has_website: number;
  google_maps_uri: string | null;
  rating: number | null;
  user_rating_count: number | null;
  business_status: string | null;
  lat: number | null;
  lng: number | null;
  crm_status: CrmStatus;
  note: string;
  source: LeadSource;
  created_at: string;
  updated_at: string;
}

interface SearchHistoryRow {
  id: number;
  city: string;
  niche: string;
  requested_count: number;
  returned_count: number;
  new_leads_count: number;
  no_website_count: number;
  created_at: string;
}

function mapLeadRow(row: LeadRow): BusinessLead {
  return {
    id: row.id,
    placeId: row.place_id,
    name: row.name,
    category: row.category,
    primaryType: row.primary_type,
    address: row.address,
    city: row.city,
    niche: row.niche,
    phone: row.phone,
    website: row.website,
    hasWebsite: Number(row.has_website) === 1,
    googleMapsUri: row.google_maps_uri,
    rating: row.rating !== null ? Number(row.rating) : null,
    userRatingCount: row.user_rating_count !== null ? Number(row.user_rating_count) : null,
    businessStatus: row.business_status,
    lat: row.lat !== null ? Number(row.lat) : null,
    lng: row.lng !== null ? Number(row.lng) : null,
    crmStatus: row.crm_status,
    note: row.note ?? '',
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHistoryRow(row: SearchHistoryRow): SearchHistoryItem {
  return {
    id: Number(row.id),
    city: row.city,
    niche: row.niche,
    requestedCount: Number(row.requested_count),
    returnedCount: Number(row.returned_count),
    newLeadsCount: Number(row.new_leads_count),
    noWebsiteCount: Number(row.no_website_count),
    createdAt: row.created_at,
  };
}

export async function getAllLeads(): Promise<BusinessLead[]> {
  await ensureDatabaseInitialized();
  const pool = getPool();
  const result = await pool.query(`
    SELECT * FROM leads
    ORDER BY created_at DESC, ctid DESC
  `);
  return (result.rows as LeadRow[]).map(mapLeadRow);
}

export async function getLeadById(id: string): Promise<BusinessLead | null> {
  await ensureDatabaseInitialized();
  const pool = getPool();
  const result = await pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
  const row = result.rows[0] as LeadRow | undefined;
  return row ? mapLeadRow(row) : null;
}

export async function getLeadStats(): Promise<LeadStats> {
  await ensureDatabaseInitialized();
  const pool = getPool();
  const result = await pool.query(`
    SELECT crm_status, has_website, COUNT(*)::int AS cnt
    FROM leads
    GROUP BY crm_status, has_website
  `);

  const statusCounts: Record<CrmStatus, number> = {
    new: 0,
    contacted: 0,
    replied: 0,
    interested: 0,
    declined: 0,
    client: 0,
  };

  let total = 0;
  let withoutWebsite = 0;
  let withWebsite = 0;

  for (const row of result.rows as Array<{
    crm_status: CrmStatus;
    has_website: number;
    cnt: number;
  }>) {
    const count = Number(row.cnt) || 0;
    total += count;
    if (Number(row.has_website) === 1) {
      withWebsite += count;
    } else {
      withoutWebsite += count;
    }
    if (row.crm_status in statusCounts) {
      statusCounts[row.crm_status] += count;
    }
  }

  const contactedTotal =
    statusCounts.contacted +
    statusCounts.replied +
    statusCounts.interested +
    statusCounts.declined +
    statusCounts.client;

  return {
    total,
    withoutWebsite,
    withWebsite,
    contactedTotal,
    statusCounts,
  };
}

export async function getRecentSearches(limit = 10): Promise<SearchHistoryItem[]> {
  await ensureDatabaseInitialized();
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT * FROM search_history
    ORDER BY id DESC
    LIMIT $1
  `,
    [limit]
  );
  return (result.rows as SearchHistoryRow[]).map(mapHistoryRow);
}

export interface UpsertPlaceInput {
  id: string;
  placeId: string | null;
  name: string;
  category: string;
  primaryType: string | null;
  address: string;
  city: string;
  niche: string;
  phone: string | null;
  website: string | null;
  hasWebsite: boolean;
  googleMapsUri: string | null;
  rating: number | null;
  userRatingCount: number | null;
  businessStatus: string | null;
  lat: number | null;
  lng: number | null;
  source: LeadSource;
}

export async function upsertLeadsBatch(items: UpsertPlaceInput[]): Promise<{
  savedLeads: BusinessLead[];
  newCount: number;
}> {
  await ensureDatabaseInitialized();
  const pool = getPool();
  const client = await pool.connect();
  const now = new Date().toISOString();

  let newCount = 0;
  const ids: string[] = [];

  try {
    await client.query('BEGIN');

    for (const item of items) {
      const existingRes = await client.query(`SELECT id FROM leads WHERE id = $1`, [item.id]);
      if (existingRes.rowCount === 0) {
        newCount += 1;
        await client.query(
          `
          INSERT INTO leads (
            id, place_id, name, category, primary_type, address, city, niche,
            phone, website, has_website, google_maps_uri, rating, user_rating_count,
            business_status, lat, lng, crm_status, note, source, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14,
            $15, $16, $17, 'new', '', $18, $19
