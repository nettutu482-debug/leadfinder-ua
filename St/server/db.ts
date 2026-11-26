import { Pool } from 'pg';
import type {
  BusinessLead,
  CrmStatus,
  LeadSource,
  LeadStats,
  SearchHistoryItem,
} from '../src/shared/types.ts';

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
            $15, $16, $17, 'new', '', $18, $19, $20
          )
        `,
          [
            item.id,
            item.placeId,
            item.name,
            item.category,
            item.primaryType,
            item.address,
            item.city,
            item.niche,
            item.phone,
            item.website,
            item.hasWebsite ? 1 : 0,
            item.googleMapsUri,
            item.rating,
            item.userRatingCount,
            item.businessStatus,
            item.lat,
            item.lng,
            item.source,
            now,
            now,
          ]
        );
      } else {
        await client.query(
          `
          UPDATE leads SET
            name = $1,
            category = $2,
            primary_type = $3,
            address = $4,
            city = $5,
            niche = $6,
            phone = COALESCE($7, phone),
            website = $8,
            has_website = $9,
            google_maps_uri = COALESCE($10, google_maps_uri),
            rating = $11,
            user_rating_count = $12,
            business_status = $13,
            lat = $14,
            lng = $15,
            updated_at = $16
          WHERE id = $17
        `,
          [
            item.name,
            item.category,
            item.primaryType,
            item.address,
            item.city,
            item.niche,
            item.phone,
            item.website,
            item.hasWebsite ? 1 : 0,
            item.googleMapsUri,
            item.rating,
            item.userRatingCount,
            item.businessStatus,
            item.lat,
            item.lng,
            now,
            item.id,
          ]
        );
      }
      ids.push(item.id);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const savedLeads: BusinessLead[] = [];
  for (const id of ids) {
    const lead = await getLeadById(id);
    if (lead) {
      savedLeads.push(lead);
    }
  }

  return { savedLeads, newCount };
}

export async function createManualLead(input: {
  id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  niche: string;
  phone: string | null;
  website: string | null;
  googleMapsUri: string | null;
  note: string;
}): Promise<BusinessLead> {
  await ensureDatabaseInitialized();
  const pool = getPool();
  const now = new Date().toISOString();
  const hasWebsite = Boolean(input.website && input.website.trim().length > 0);

  await pool.query(
    `
    INSERT INTO leads (
      id, place_id, name, category, primary_type, address, city, niche,
      phone, website, has_website, google_maps_uri, rating, user_rating_count,
      business_status, lat, lng, crm_status, note, source, created_at, updated_at
    ) VALUES (
      $1, NULL, $2, $3, NULL, $4, $5, $6,
      $7, $8, $9, $10, NULL, NULL,
      'OPERATIONAL', NULL, NULL, 'new', $11, 'manual', $12, $13
    )
  `,
    [
      input.id,
      input.name,
      input.category,
      input.address,
      input.city,
      input.niche,
      input.phone,
      input.website,
      hasWebsite ? 1 : 0,
      input.googleMapsUri,
      input.note,
      now,
      now,
    ]
  );

  const created = await getLeadById(input.id);
  if (!created) {
    throw new Error('Failed to retrieve created lead');
  }
  return created;
}

export async function updateLead(
  id: string,
  patch: { crmStatus?: CrmStatus; note?: string }
): Promise<BusinessLead | null> {
  await ensureDatabaseInitialized();
  const existing = await getLeadById(id);
  if (!existing) return null;

  const nextStatus = patch.crmStatus ?? existing.crmStatus;
  const nextNote = patch.note !== undefined ? patch.note : existing.note;
  const now = new Date().toISOString();
  const pool = getPool();

  await pool.query(
    `UPDATE leads SET crm_status = $1, note = $2, updated_at = $3 WHERE id = $4`,
    [nextStatus, nextNote, now, id]
  );

  return getLeadById(id);
}

export async function deleteLead(id: string): Promise<boolean> {
  await ensureDatabaseInitialized();
  const pool = getPool();
  const result = await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteLeadsBulk(ids: string[]): Promise<number> {
  await ensureDatabaseInitialized();
  if (ids.length === 0) return 0;
  const pool = getPool();
  const result = await pool.query(`DELETE FROM leads WHERE id = ANY($1::text[])`, [ids]);
  return result.rowCount ?? 0;
}

export async function recordSearchHistory(entry: {
  city: string;
  niche: string;
  requestedCount: number;
  returnedCount: number;
  newLeadsCount: number;
  noWebsiteCount: number;
}): Promise<void> {
  await ensureDatabaseInitialized();
  const pool = getPool();
  await pool.query(
    `
    INSERT INTO search_history (
      city, niche, requested_count, returned_count, new_leads_count, no_website_count, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  `,
    [
      entry.city,
      entry.niche,
      entry.requestedCount,
      entry.returnedCount,
      entry.newLeadsCount,
      entry.noWebsiteCount,
      new Date().toISOString(),
    ]
  );
}
