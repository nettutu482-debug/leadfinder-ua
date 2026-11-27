import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import type {
  BusinessLead,
  CrmStatus,
  LeadSource,
  LeadStats,
  SearchHistoryItem,
} from '../src/shared/types.ts';

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

interface RawLeadRow {
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
  has_website: boolean | number;
  google_maps_uri: string | null;
  rating: number | string | null;
  user_rating_count: number | string | null;
  business_status: string | null;
  lat: number | string | null;
  lng: number | string | null;
  crm_status: CrmStatus;
  note: string | null;
  source: LeadSource;
  created_at: string | Date;
  updated_at: string | Date;
}

interface RawSearchHistoryRow {
  id: number | string;
  city: string;
  niche: string;
  requested_count: number | string;
  returned_count: number | string;
  new_leads_count: number | string;
  no_website_count: number | string;
  created_at: string | Date;
}

function toIsoString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toHasWebsiteBoolean(value: boolean | number): boolean {
  return value === true || value === 1;
}

function mapLeadRow(row: RawLeadRow): BusinessLead {
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
    hasWebsite: toHasWebsiteBoolean(row.has_website),
    googleMapsUri: row.google_maps_uri,
    rating: toNullableNumber(row.rating),
    userRatingCount: toNullableNumber(row.user_rating_count),
    businessStatus: row.business_status,
    lat: toNullableNumber(row.lat),
    lng: toNullableNumber(row.lng),
    crmStatus: row.crm_status,
    note: row.note ?? '',
    source: row.source,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapHistoryRow(row: RawSearchHistoryRow): SearchHistoryItem {
  return {
    id: Number(row.id),
    city: row.city,
    niche: row.niche,
    requestedCount: Number(row.requested_count),
    returnedCount: Number(row.returned_count),
    newLeadsCount: Number(row.new_leads_count),
    noWebsiteCount: Number(row.no_website_count),
    createdAt: toIsoString(row.created_at),
  };
}

// ---------- PostgreSQL Engine (Vercel / Production when DATABASE_URL is set) ----------

let pgPool: Pool | null = null;
let pgInitPromise: Promise<{ hasWebsiteIsBoolean: boolean }> | null = null;

function isPostgresEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

function getPgPool(): Pool {
  if (pgPool) return pgPool;
  const connectionString = process.env.DATABASE_URL!.trim();
  const isLocal =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('sslmode=disable');

  pgPool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  return pgPool;
}

async function ensurePgSchema(): Promise<{ pool: Pool; hasWebsiteIsBoolean: boolean }> {
  const pool = getPgPool();
  if (!pgInitPromise) {
    pgInitPromise = (async () => {
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
          has_website BOOLEAN NOT NULL DEFAULT FALSE,
          google_maps_uri TEXT,
          rating DOUBLE PRECISION,
          user_rating_count INTEGER,
          business_status TEXT,
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          crm_status TEXT NOT NULL DEFAULT 'new',
          note TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT 'google_places',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      const colCheck = await pool.query<{ data_type: string }>(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'has_website'
      `);

      const dataType = colCheck.rows[0]?.data_type?.toLowerCase() ?? 'boolean';
      const hasWebsiteIsBoolean = dataType === 'boolean';
      return { hasWebsiteIsBoolean };
    })().catch((err) => {
      pgInitPromise = null;
      throw err;
    });
  }

  const meta = await pgInitPromise;
  return { pool, hasWebsiteIsBoolean: meta.hasWebsiteIsBoolean };
}

// ---------- SQLite Fallback Engine (Local AI Studio preview without DATABASE_URL) ----------

type SqliteDb = import('node:sqlite').DatabaseSync;
let sqliteDb: SqliteDb | null = null;
let sqliteInitPromise: Promise<SqliteDb> | null = null;

async function ensureSqliteDb(): Promise<SqliteDb> {
  if (sqliteDb) return sqliteDb;
  if (!sqliteInitPromise) {
    sqliteInitPromise = (async () => {
      const dataDir = path.resolve(process.cwd(), 'data');
      const dbPath = path.join(dataDir, 'leadfinder.db');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const sqliteModuleName = ['node', 'sqlite'].join(':');
      const { DatabaseSync } = (await import(sqliteModuleName)) as typeof import('node:sqlite');
      const db = new DatabaseSync(dbPath);

      db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

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
          rating REAL,
          user_rating_count INTEGER,
          business_status TEXT,
          lat REAL,
          lng REAL,
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
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city TEXT NOT NULL,
          niche TEXT NOT NULL,
          requested_count INTEGER NOT NULL,
          returned_count INTEGER NOT NULL,
          new_leads_count INTEGER NOT NULL,
          no_website_count INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      sqliteDb = db;
      return db;
    })().catch((err) => {
      sqliteInitPromise = null;
      throw err;
    });
  }
  return sqliteInitPromise;
}

// ---------- Public Repository API ----------

export function getDatabaseEngine(): 'postgresql' | 'sqlite' {
  return isPostgresEnabled() ? 'postgresql' : 'sqlite';
}

export async function checkDatabaseHealth(): Promise<{ ok: boolean; engine: 'postgresql' | 'sqlite' }> {
  if (isPostgresEnabled()) {
    const { pool } = await ensurePgSchema();
    await pool.query('SELECT 1');
    return { ok: true, engine: 'postgresql' };
  }
  const db = await ensureSqliteDb();
  db.prepare('SELECT 1').get();
  return { ok: true, engine: 'sqlite' };
}

export async function getAllLeads(): Promise<BusinessLead[]> {
  if (isPostgresEnabled()) {
    const { pool } = await ensurePgSchema();
    const res = await pool.query<RawLeadRow>(`
      SELECT * FROM leads
      ORDER BY created_at DESC, id DESC
    `);
    return res.rows.map(mapLeadRow);
  }

  const db = await ensureSqliteDb();
  const rows = db
    .prepare(`SELECT * FROM leads ORDER BY datetime(created_at) DESC, rowid DESC`)
    .all() as unknown as RawLeadRow[];
  return rows.map(mapLeadRow);
}

export async function getLeadById(id: string): Promise<BusinessLead | null> {
  if (isPostgresEnabled()) {
    const { pool } = await ensurePgSchema();
    const res = await pool.query<RawLeadRow>(`SELECT * FROM leads WHERE id = $1`, [id]);
    return res.rows[0] ? mapLeadRow(res.rows[0]) : null;
  }

  const db = await ensureSqliteDb();
  const row = db.prepare(`SELECT * FROM leads WHERE id = ?`).get(id) as unknown as RawLeadRow | undefined;
  return row ? mapLeadRow(row) : null;
}

export async function getLeadStats(): Promise<LeadStats> {
  let rows: Array<{ crm_status: CrmStatus; has_website: boolean | number; cnt: number | string }>;

  if (isPostgresEnabled()) {
    const { pool } = await ensurePgSchema();
    const res = await pool.query<{ crm_status: CrmStatus; has_website: boolean | number; cnt: string }>(`
      SELECT crm_status, has_website, COUNT(*) as cnt
      FROM leads
      GROUP BY crm_status, has_website
    `);
    rows = res.rows;
  } else {
    const db = await ensureSqliteDb();
    rows = db
      .prepare(`SELECT crm_status, has_website, COUNT(*) as cnt FROM leads GROUP BY crm_status, has_website`)
      .all() as unknown as Array<{ crm_status: CrmStatus; has_website: number; cnt: number }>;
  }

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

  for (const row of rows) {
    const count = Number(row.cnt) || 0;
    total += count;
    if (toHasWebsiteBoolean(row.has_website)) {
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
  if (isPostgresEnabled()) {
    const { pool } = await ensurePgSchema();
    const res = await pool.query<RawSearchHistoryRow>(
      `SELECT * FROM search_history ORDER BY id DESC LIMIT $1`,
      [limit]
    );
    return res.rows.map(mapHistoryRow);
  }

  const db = await ensureSqliteDb();
  const rows = db
    .prepare(`SELECT * FROM search_history ORDER BY id DESC LIMIT ?`)
    .all(limit) as unknown as RawSearchHistoryRow[];
  return rows.map(mapHistoryRow);
}

export async function upsertLeadsBatch(items: UpsertPlaceInput[]): Promise<{
  savedLeads: BusinessLead[];
  newCount: number;
}> {
  if (items.length === 0) {
    return { savedLeads: [], newCount: 0 };
  }

  const now = new Date().toISOString();

  if (isPostgresEnabled()) {
    const { pool, hasWebsiteIsBoolean } = await ensurePgSchema();
    const client: PoolClient = await pool.connect();
    let newCount = 0;
    const savedLeads: BusinessLead[] = [];

    try {
      await client.query('BEGIN');

      for (const item of items) {
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM leads WHERE id = $1`,
          [item.id]
        );
        const hasWebsiteVal = hasWebsiteIsBoolean ? item.hasWebsite : item.hasWebsite ? 1 : 0;

        if (existing.rowCount === 0) {
          newCount += 1;
          const inserted = await client.query<RawLeadRow>(
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
            RETURNING *
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
              hasWebsiteVal,
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
          if (inserted.rows[0]) savedLeads.push(mapLeadRow(inserted.rows[0]));
        } else {
          const updated = await client.query<RawLeadRow>(
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
            RETURNING *
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
              hasWebsiteVal,
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
          if (updated.rows[0]) savedLeads.push(mapLeadRow(updated.rows[0]));
        }
      }

      await client.query('COMMIT');
      return { savedLeads, newCount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // SQLite branch
  const db = await ensureSqliteDb();
  const findStmt = db.prepare(`SELECT id FROM leads WHERE id = ?`);
  const insertStmt = db.prepare(`
    INSERT INTO leads (
      id, place_id, name, category, primary_type, address, city, niche,
      phone, website, has_website, google_maps_uri, rating, user_rating_count,
      business_status, lat, lng, crm_status, note, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', '', ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE leads SET
      name = ?,
      category = ?,
      primary_type = ?,
      address = ?,
      city = ?,
      niche = ?,
      phone = COALESCE(?, phone),
      website = ?,
      has_website = ?,
      google_maps_uri = COALESCE(?, google_maps_uri),
      rating = ?,
      user_rating_count = ?,
      business_status = ?,
      lat = ?,
      lng = ?,
      updated_at = ?
    WHERE id = ?
  `);

  let newCount = 0;
  const ids: string[] = [];

  db.exec('BEGIN');
  try {
    for (const item of items) {
      const existing = findStmt.get(item.id) as { id: string } | undefined;
      if (!existing) {
        newCount += 1;
        insertStmt.run(
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
          now
        );
      } else {
        updateStmt.run(
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
          item.id
        );
      }
      ids.push(item.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const savedLeads = (
    await Promise.all(ids.map((id) => getLeadById(id)))
  ).filter((lead): lead is BusinessLead => lead !== null);

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
  const now = new Date().toISOString();
  const hasWebsite = Boolean(input.website && input.website.trim().length > 0);

  if (isPostgresEnabled()) {
    const { pool, hasWebsiteIsBoolean } = await ensurePgSchema();
    const hasWebsiteVal = hasWebsiteIsBoolean ? hasWebsite : hasWebsite ? 1 : 0;
    const res = await pool.query<RawLeadRow>(
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
      RETURNING *
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
        hasWebsiteVal,
        input.googleMapsUri,
        input.note,
        now,
        now,
      ]
    );
    return mapLeadRow(res.rows[0]);
  }

  const db = await ensureSqliteDb();
  db.prepare(`
    INSERT INTO leads (
      id, place_id, name, category, primary_type, address, city, niche,
      phone, website, has_website, google_maps_uri, rating, user_rating_count,
      business_status, lat, lng, crm_status, note, source, created_at, updated_at
    ) VALUES (?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'OPERATIONAL', NULL, NULL, 'new', ?, 'manual', ?, ?)
  `).run(
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
    now
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
  const existing = await getLeadById(id);
  if (!existing) return null;

  const nextStatus = patch.crmStatus ?? existing.crmStatus;
  const nextNote = patch.note !== undefined ? patch.note : existing.note;
  const now = new Date().toISOString();

  if (isPostgresEnabled()) {
    const { pool } = await ensurePgSchema();
    const res = await pool.query<RawLeadRow>(
      `UPDATE leads SET crm_status = $1, note = $2, updated_at = $3 WHERE id = $4 RETURNING *`,
      [nextStatus, nextNote, now, id]
    );
    return res.rows[0] ? mapLeadRow(res.rows[0]) : null;
  }

  const db = await ensureSqliteDb();
  db.prepare(`UPDATE leads SET crm_status = ?, note = ?, updated_at = ? WHERE id = ?`).run(
    nextStatus,
    nextNote,
    now,
    id
  );
  return getLeadById(id);
}

export async function deleteLead(id: string): Promise<boolean> {
  if (isPostgresEnabled()) {
    const { pool } = await ensurePgSchema();
    const res = await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  const db = await ensureSqliteDb();
  const result = db.prepare(`DELETE FROM leads WHERE id = ?`).run(id);
  return Number(result.changes) > 0;
}

export async function deleteLeadsBulk(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  if (isPostgresEnabled()) {
    const { pool } = await ensurePgSchema();
    const res = await pool.query(`DELETE FROM leads WHERE id = ANY($1::text[])`, [ids]);
    return res.rowCount ?? 0;
  }

  const db = await ensureSqliteDb();
  let deleted = 0;
  const stmt = db.prepare(`DELETE FROM leads WHERE id = ?`);
  db.exec('BEGIN');
  try {
    for (const id of ids) {
      const res = stmt.run(id);
      deleted += Number(res.changes);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return deleted;
}

export async function recordSearchHistory(entry: {
  city: string;
  niche: string;
  requestedCount: number;
  returnedCount: number;
  newLeadsCount: number;
  noWebsiteCount: number;
}): Promise<void> {
  const now = new Date().toISOString();

  if (isPostgresEnabled()) {
    const { pool } = await ensurePgSchema();
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
        now,
      ]
    );
    return;
  }

  const db = await ensureSqliteDb();
  db.prepare(`
    INSERT INTO search_history (
      city, niche, requested_count, returned_count, new_leads_count, no_website_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.city,
    entry.niche,
    entry.requestedCount,
    entry.returnedCount,
    entry.newLeadsCount,
    entry.noWebsiteCount,
    now
  );
}
