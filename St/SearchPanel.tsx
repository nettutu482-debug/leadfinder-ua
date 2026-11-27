import { useState, type FormEvent } from 'react';
import { AlertCircle, Clock, Loader2, MapPin, Search } from 'lucide-react';
import {
  NICHE_PRESETS,
  UKRAINE_CITY_SUGGESTIONS,
  type SearchHistoryItem,
  type WebsiteFilter,
} from '../shared/types.ts';

export interface SearchParamsPayload {
  city: string;
  nicheLabel: string;
  searchTerm: string;
  includedType?: string;
  limit: number;
  websiteFilter: WebsiteFilter;
}

interface SearchPanelProps {
  placesApiConfigured: boolean;
  isSearching: boolean;
  searchError: string | null;
  lastSearchSummary: {
    query: string;
    totalFetched: number;
    newSavedCount: number;
    noWebsiteCount: number;
  } | null;
  recentSearches: SearchHistoryItem[];
  onSearch: (payload: SearchParamsPayload) => Promise<void>;
  onOpenApiGuide: () => void;
}

export function SearchPanel({
  placesApiConfigured,
  isSearching,
  searchError,
  lastSearchSummary,
  recentSearches,
  onSearch,
  onOpenApiGuide,
}: SearchPanelProps) {
  const [city, setCity] = useState('Київ');
  const [nicheId, setNicheId] = useState(NICHE_PRESETS[0].id);
  const [customNiche, setCustomNiche] = useState('');
  const [limit, setLimit] = useState<number>(20);
  const [websiteFilter, setWebsiteFilter] = useState<WebsiteFilter>('all');

  const selectedPreset = NICHE_PRESETS.find((n) => n.id === nicheId) ?? NICHE_PRESETS[0];
  const isCustomNiche = nicheId === 'custom';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedCity = city.trim();
    const searchTerm = isCustomNiche ? customNiche.trim() : selectedPreset.searchTerm;
    const nicheLabel = isCustomNiche ? customNiche.trim() : selectedPreset.label;

    if (!trimmedCity || !searchTerm) return;

    await onSearch({
      city: trimmedCity,
      nicheLabel,
      searchTerm,
      includedType: isCustomNiche ? undefined : selectedPreset.includedType,
      limit,
      websiteFilter,
    });
  };

  const handleReplaySearch = async (item: SearchHistoryItem) => {
    setCity(item.city);
    const matchedPreset = NICHE_PRESETS.find((p) => p.label === item.niche);
    if (matchedPreset) {
      setNicheId(matchedPreset.id);
      setCustomNiche('');
    } else {
      setNicheId('custom');
      setCustomNiche(item.niche);
    }
    setLimit(item.requestedCount);

    await onSearch({
      city: item.city,
      nicheLabel: item.niche,
      searchTerm: matchedPreset ? matchedPreset.searchTerm : item.niche,
      includedType: matchedPreset?.includedType,
      limit: item.requestedCount,
      websiteFilter,
    });
  };

  return (
    <section
      aria-label="Пошук бізнесів через Google Places API"
      className="rounded-xl border border-slate-800/80 bg-[#111722] p-5 md:p-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-slate-800/80">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Пошук потенційних клієнтів</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Реальні дані бізнесів України через Google Places API (New)
          </p>
        </div>

        <div className="flex items-center gap-3">
          {placesApiConfigured ? (
            <span className="text-xs font-medium text-emerald-400 whitespace-nowrap">
              Google Places API підключено
            </span>
          ) : (
            <button
              type="button"
              onClick={onOpenApiGuide}
              className="text-xs font-medium text-amber-300 hover:text-amber-200 underline underline-offset-4 whitespace-nowrap"
            >
              Потрібне підключення API-ключа
            </button>
          )}
        </div>
      </div>

      {!placesApiConfigured && (
        <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-100/90">
              <p className="font-medium">Google Places API (New) ще не налаштовано</p>
              <p className="mt-1 text-xs text-amber-200/75">
                Для пошуку реальних бізнесів додайте змінну середовища{' '}
                <code className="font-mono text-amber-200 bg-amber-950/60 px-1.5 py-0.5 rounded">
                  GOOGLE_MAPS_API_KEY
                </code>{' '}
                на сервері. Вигадані або тестові компанії не використовуються.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenApiGuide}
            className="px-3.5 py-2 rounded-lg bg-amber-500/15 border border-amber-400/30 text-xs font-medium text-amber-200 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0"
          >
            Інструкція підключення
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
          {/* Місто */}
          <div className="xl:col-span-4">
            <label htmlFor="search-city" className="block text-xs font-medium text-slate-300 mb-1.5">
              Місто або населений пункт
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="search-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Наприклад: Львів, Вінниця, Буча..."
                required
                className="w-full h-11 pl-9 pr-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Ніша бізнесу */}
          <div className="xl:col-span-4">
            <label htmlFor="search-niche" className="block text-xs font-medium text-slate-300 mb-1.5">
              Ніша бізнесу
            </label>
            <select
              id="search-niche"
              value={nicheId}
              onChange={(e) => setNicheId(e.target.value)}
              className="w-full h-11 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {NICHE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {/* Кількість результатів */}
          <div className="xl:col-span-2">
            <label htmlFor="search-limit" className="block text-xs font-medium text-slate-300 mb-1.5">
              Кількість результатів
            </label>
            <select
              id="search-limit"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full h-11 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 font-mono tabular-nums focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value={10}>До 10</option>
              <option value={20}>До 20</option>
              <option value={40}>До 40</option>
              <option value={60}>До 60</option>
            </select>
          </div>

          {/* Фільтр за наявністю сайту */}
          <div className="xl:col-span-2">
            <label htmlFor="search-website-filter" className="block text-xs font-medium text-slate-300 mb-1.5">
              Вебсайт
            </label>
            <select
              id="search-website-filter"
              value={websiteFilter}
              onChange={(e) => setWebsiteFilter(e.target.value as WebsiteFilter)}
              className="w-full h-11 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Усі бізнеси</option>
              <option value="without_website">Тільки без сайту</option>
              <option value="with_website">Тільки з сайтом</option>
            </select>
          </div>
        </div>

        {/* Поле для власної ніші */}
        {isCustomNiche && (
          <div>
            <label htmlFor="custom-niche" className="block text-xs font-medium text-slate-300 mb-1.5">
              Власний запит ніші
            </label>
            <input
              id="custom-niche"
              type="text"
              value={customNiche}
              onChange={(e) => setCustomNiche(e.target.value)}
              placeholder="Наприклад: детейлінг студія, ремонт телефонів, приватний дитсадок..."
              required={isCustomNiche}
              className="w-full h-11 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Швидкий вибір міст + кнопка пошуку */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 mr-1">Швидкий вибір міста:</span>
            {UKRAINE_CITY_SUGGESTIONS.slice(0, 8).map((cityName) => (
              <button
                key={cityName}
                type="button"
                onClick={() => setCity(cityName)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap shrink-0 ${
                  city.trim().toLowerCase() === cityName.toLowerCase()
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {cityName}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={isSearching || !city.trim() || (isCustomNiche && !customNiche.trim())}
            className="h-11 px-6 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Пошук у Google Places...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Знайти бізнеси
              </>
            )}
          </button>
        </div>
      </form>

      {/* Помилка або підсумок останнього пошуку */}
      {searchError && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/25 px-4 py-3 text-sm text-rose-200 flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{searchError}</span>
        </div>
      )}

      {lastSearchSummary && !searchError && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-[#0A0E15]/80 px-4 py-3 text-xs sm:text-sm text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            Запит: <strong className="text-slate-100">{lastSearchSummary.query}</strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="tabular-nums">
            Отримано: <strong className="text-slate-100">{lastSearchSummary.totalFetched}</strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="tabular-nums">
            Нових збережено:{' '}
            <strong className="text-blue-300">{lastSearchSummary.newSavedCount}</strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="tabular-nums">
            Без вебсайту:{' '}
            <strong className="text-emerald-400">{lastSearchSummary.noWebsiteCount}</strong>
          </span>
        </div>
      )}

      {/* Останні пошукові запити */}
      {recentSearches.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800/60 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 mr-1">
            <Clock className="w-3.5 h-3.5" />
            Нещодавні пошуки:
          </span>
          {recentSearches.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={isSearching}
              onClick={() => handleReplaySearch(item)}
              className="px-2.5 py-1 rounded-md bg-[#0A0E15] border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-slate-100 transition-colors whitespace-nowrap"
            >
              {item.niche} · {item.city} ({item.returnedCount})
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
