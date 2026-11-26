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
} from './db.ts';
import {
  CRM_STATUS_OPTIONS,
  sanitizeExternalUrl,
  type CrmStatus,
  type WebsiteFilter,
} from '../src/shared/types.ts';

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
        id: `manual_${crypto.randomUUID()}`,
        name,
        category: category || 'Малий / середній бізнес',
        address: address || city,
        city,
        niche: category || 'Додано вручну',
        phone,
        website: safeWebsite,
        googleMapsUri: safeMapsUri,
        note,
      });

      const stats = await getLeadStats();
      res.status(201).json({ ok: true, lead, stats });
    } catch (err) {
      console.error('Failed to create manual lead:', err);
      res.status(500).json({ ok: false, message: 'Не вдалося додати бізнес.' });
    }
  });

  app.patch('/api/leads/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const body = req.body ?? {};
      const patch: { crmStatus?: CrmStatus; note?: string } = {};

      if (body.crmStatus !== undefined) {
        if (typeof body.crmStatus !== 'string' || !VALID_STATUSES.has(body.crmStatus as CrmStatus)) {
          return res.status(400).json({ ok: false, message: 'Недійсний CRM-статус.' });
        }
        patch.crmStatus = body.crmStatus as CrmStatus;
      }

      if (body.note !== undefined) {
        if (typeof body.note !== 'string') {
          return res.status(400).json({ ok: false, message: 'Нотатка має бути текстом.' });
        }
        patch.note = body.note.slice(0, 2000);
      }

      const updated = await updateLead(id, patch);
      if (!updated) {
        return res.status(404).json({ ok: false, message: 'Бізнес не знайдено.' });
      }

      const stats = await getLeadStats();
      res.json({ ok: true, lead: updated, stats });
    } catch (err) {
      console.error('Failed to update lead:', err);
      res.status(500).json({ ok: false, message: 'Не вдалося оновити дані бізнесу.' });
    }
  });

  app.delete('/api/leads/:id', async (req, res) => {
    try {
      const deleted = await deleteLead(req.params.id);
      if (!deleted) {
        return res.status(404).json({ ok: false, message: 'Бізнес не знайдено.' });
      }
      const stats = await getLeadStats();
      res.json({ ok: true, stats });
    } catch (err) {
      console.error('Failed to delete lead:', err);
      res.status(500).json({ ok: false, message: 'Не вдалося видалити бізнес.' });
    }
  });

  app.post('/api/leads/bulk-delete', async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string')
        : [];
      const deletedCount = await deleteLeadsBulk(ids);
      const stats = await getLeadStats();
      res.json({ ok: true, deletedCount, stats });
    } catch (err) {
      console.error('Failed to bulk delete leads:', err);
      res.status(500).json({ ok: false, message: 'Не вдалося видалити вибрані бізнеси.' });
    }
  });

  app.post('/api/places/search', async (req, res) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      return res.status(503).json({
        ok: false,
        errorCode: 'API_KEY_MISSING',
        message:
          'Google Places API (New) ще не підключено. Додайте змінну середовища GOOGLE_MAPS_API_KEY у налаштуваннях середовища (Secrets) на сервері.',
      });
    }

    const body = req.body ?? {};
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const nicheLabel = typeof body.nicheLabel === 'string' ? body.nicheLabel.trim() : '';
    const searchTerm = typeof body.searchTerm === 'string' ? body.searchTerm.trim() : '';
    const includedType =
      typeof body.includedType === 'string' && /^[a-z0-9_]+$/.test(body.includedType.trim())
        ? body.includedType.trim()
        : undefined;
    const requestedCountRaw = Number(body.limit ?? 20);
    const limit = Math.min(Math.max(Number.isFinite(requestedCountRaw) ? requestedCountRaw : 20, 1), 60);
    const websiteFilter: WebsiteFilter =
      body.websiteFilter === 'without_website' || body.websiteFilter === 'with_website'
        ? body.websiteFilter
        : 'all';

    if (!city || !searchTerm) {
      return res.status(400).json({
        ok: false,
        errorCode: 'INVALID_INPUT',
        message: 'Вкажіть місто (або населений пункт) та нішу бізнесу для пошуку.',
      });
    }

    const cityIncludesUkraine = /україн|ukraine/i.test(city);
    const textQuery = cityIncludesUkraine
      ? `${searchTerm} ${city}`
      : `${searchTerm} ${city}, Україна`;

    const collected: GooglePlaceApiItem[] = [];
    let pageToken: string | undefined;
    const maxPages = Math.ceil(limit / 20);

    try {
      for (let page = 0; page < maxPages && collected.length < limit; page++) {
        const remaining = limit - collected.length;
        const pageSize = Math.min(20, remaining);

        const requestPayload: Record<string, unknown> = {
          textQuery,
          languageCode: 'uk',
          regionCode: 'UA',
          pageSize,
        };

        if (includedType) {
          requestPayload.includedType = includedType;
        }
        if (pageToken) {
          requestPayload.pageToken = pageToken;
        }

        const apiResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
            'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
          },
          body: JSON.stringify(requestPayload),
        });

        const payload = (await apiResponse.json().catch(() => ({}))) as GooglePlacesSearchResponse;

        if (!apiResponse.ok) {
          const apiStatus = payload.error?.status || '';
          const apiMessage = payload.error?.message || `HTTP ${apiResponse.status}`;

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
            message: `Помилка Google Places API (New): ${apiMessage}`,
          });
        }

        const pagePlaces = Array.isArray(payload.places) ? payload.places : [];
        for (const p of pagePlaces) {
          if (p.id && collected.length < limit) {
            collected.push(p);
          }
        }

        pageToken = payload.nextPageToken;
        if (!pageToken || pagePlaces.length === 0) {
          break;
        }
      }

      const upsertInputs: UpsertPlaceInput[] = [];
      const seenIds = new Set<string>();

      for (const place of collected) {
        if (!place.id || seenIds.has(place.id)) continue;
        seenIds.add(place.id);

        const safeWebsite = sanitizeExternalUrl(place.websiteUri);
        const safeMapsUri =
          sanitizeExternalUrl(place.googleMapsUri) ||
          `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id)}`;

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
