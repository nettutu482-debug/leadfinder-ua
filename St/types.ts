export type CrmStatus =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'declined'
  | 'client';

export type WebsiteFilter = 'all' | 'without_website' | 'with_website';

export type LeadSource = 'google_places' | 'manual';

export interface BusinessLead {
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
  crmStatus: CrmStatus;
  note: string;
  source: LeadSource;
  createdAt: string;
  updatedAt: string;
}

export interface LeadStats {
  total: number;
  withoutWebsite: number;
  withWebsite: number;
  contactedTotal: number;
  statusCounts: Record<CrmStatus, number>;
}

export interface SearchHistoryItem {
  id: number;
  city: string;
  niche: string;
  requestedCount: number;
  returnedCount: number;
  newLeadsCount: number;
  noWebsiteCount: number;
  createdAt: string;
}

export interface NichePreset {
  id: string;
  label: string;
  searchTerm: string;
  includedType?: string;
}

export const CRM_STATUS_OPTIONS: Array<{
  value: CrmStatus;
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}> = [
  {
    value: 'new',
    label: 'Не контактував',
    textClass: 'text-slate-300',
    bgClass: 'bg-slate-800/70',
    borderClass: 'border-slate-700/80',
  },
  {
    value: 'contacted',
    label: 'Написав',
    textClass: 'text-blue-300',
    bgClass: 'bg-blue-950/60',
    borderClass: 'border-blue-800/60',
  },
  {
    value: 'replied',
    label: 'Відповів',
    textClass: 'text-amber-300',
    bgClass: 'bg-amber-950/60',
    borderClass: 'border-amber-800/60',
  },
  {
    value: 'interested',
    label: 'Зацікавлений',
    textClass: 'text-emerald-300',
    bgClass: 'bg-emerald-950/60',
    borderClass: 'border-emerald-800/60',
  },
  {
    value: 'declined',
    label: 'Відмова',
    textClass: 'text-rose-300',
    bgClass: 'bg-rose-950/60',
    borderClass: 'border-rose-800/60',
  },
  {
    value: 'client',
    label: 'Клієнт',
    textClass: 'text-cyan-300',
    bgClass: 'bg-cyan-950/60',
    borderClass: 'border-cyan-800/60',
  },
];

export const CRM_STATUS_MAP: Record<CrmStatus, (typeof CRM_STATUS_OPTIONS)[number]> =
  CRM_STATUS_OPTIONS.reduce(
    (acc, item) => {
      acc[item.value] = item;
      return acc;
    },
    {} as Record<CrmStatus, (typeof CRM_STATUS_OPTIONS)[number]>
  );

export const NICHE_PRESETS: NichePreset[] = [
  { id: 'barber_shop', label: 'Барбершопи', searchTerm: 'барбершоп', includedType: 'barber_shop' },
  { id: 'beauty_salon', label: 'Салони краси', searchTerm: 'салон краси', includedType: 'beauty_salon' },
  { id: 'nail_salon', label: 'Манікюрні студії', searchTerm: 'манікюр студія нігтів', includedType: 'nail_salon' },
  { id: 'car_repair', label: 'СТО та автосервіс', searchTerm: 'СТО автосервіс', includedType: 'car_repair' },
  { id: 'car_wash', label: 'Автомийки', searchTerm: 'автомийка', includedType: 'car_wash' },
  { id: 'dentist', label: 'Стоматології', searchTerm: 'стоматологія', includedType: 'dentist' },
  { id: 'cafe', label: "Кафе та кав'ярні", searchTerm: "кафе кав'ярня", includedType: 'cafe' },
  { id: 'restaurant', label: 'Ресторани', searchTerm: 'ресторан', includedType: 'restaurant' },
  { id: 'gym', label: 'Фітнес-клуби та спортзали', searchTerm: 'фітнес клуб спортзал', includedType: 'gym' },
  { id: 'veterinary_care', label: 'Ветеринарні клініки', searchTerm: 'ветеринарна клініка', includedType: 'veterinary_care' },
  { id: 'lawyer', label: 'Юридичні компанії та адвокати', searchTerm: 'адвокат юридичні послуги', includedType: 'lawyer' },
  { id: 'real_estate', label: 'Агентства нерухомості', searchTerm: 'агентство нерухомості', includedType: 'real_estate_agency' },
  { id: 'florist', label: 'Квіткові магазини та студії', searchTerm: 'магазин квітів флорист', includedType: 'florist' },
  { id: 'custom', label: 'Інша ніша (власний запит)', searchTerm: '' },
];

export const UKRAINE_CITY_SUGGESTIONS = [
  'Київ',
  'Львів',
  'Одеса',
  'Дніпро',
  'Харків',
  'Вінниця',
  'Івано-Франківськ',
  'Полтава',
  'Тернопіль',
  'Чернівці',
  'Рівне',
  'Луцьк',
  'Ужгород',
  'Черкаси',
  'Житомир',
  'Хмельницький',
  'Запоріжжя',
  'Миколаїв',
];

export function sanitizeExternalUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const withProtocol =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
