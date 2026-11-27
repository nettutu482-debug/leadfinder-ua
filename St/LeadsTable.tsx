import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Copy,
  Download,
  ExternalLink,
  Globe,
  GlobeLock,
  MapPin,
  MessageSquarePlus,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  CRM_STATUS_MAP,
  CRM_STATUS_OPTIONS,
  sanitizeExternalUrl,
  type BusinessLead,
  type CrmStatus,
  type WebsiteFilter,
} from '../shared/types.ts';
import { exportLeadsToCsv } from '../utils/csv.ts';

export type SortOption =
  | 'newest'
  | 'name_asc'
  | 'name_desc'
  | 'no_website_first'
  | 'status'
  | 'rating_desc';

interface LeadsTableProps {
  leads: BusinessLead[];
  isLoading: boolean;
  websiteFilter: WebsiteFilter;
  onWebsiteFilterChange: (val: WebsiteFilter) => void;
  statusFilter: CrmStatus | 'all';
  onStatusFilterChange: (val: CrmStatus | 'all') => void;
  onStatusUpdate: (leadId: string, status: CrmStatus) => Promise<void>;
  onOpenNote: (lead: BusinessLead) => void;
  onDeleteLead: (leadId: string) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onOpenManualAdd: () => void;
  onNotify: (message: string) => void;
}

const STATUS_SORT_ORDER: Record<CrmStatus, number> = {
  new: 0,
  contacted: 1,
  replied: 2,
  interested: 3,
  client: 4,
  declined: 5,
};

function getDisplayDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LeadsTable({
  leads,
  isLoading,
  websiteFilter,
  onWebsiteFilterChange,
  statusFilter,
  onStatusFilterChange,
  onStatusUpdate,
  onOpenNote,
  onDeleteLead,
  onBulkDelete,
  onOpenManualAdd,
  onNotify,
}: LeadsTableProps) {
  const [searchText, setSearchText] = useState('');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const uniqueCities = useMemo(() => {
    const set = new Set<string>();
    for (const lead of leads) {
      if (lead.city) set.add(lead.city);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'uk'));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    const filtered = leads.filter((lead) => {
      if (websiteFilter === 'without_website' && lead.hasWebsite) return false;
      if (websiteFilter === 'with_website' && !lead.hasWebsite) return false;
      if (statusFilter !== 'all' && lead.crmStatus !== statusFilter) return false;
      if (cityFilter !== 'all' && lead.city !== cityFilter) return false;
      if (q) {
        const haystack = [lead.name, lead.category, lead.address, lead.city, lead.phone ?? '', lead.note]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name, 'uk');
        case 'name_desc':
          return b.name.localeCompare(a.name, 'uk');
        case 'no_website_first':
          if (a.hasWebsite !== b.hasWebsite) return a.hasWebsite ? 1 : -1;
          return a.name.localeCompare(b.name, 'uk');
        case 'status':
          return STATUS_SORT_ORDER[a.crmStatus] - STATUS_SORT_ORDER[b.crmStatus];
        case 'rating_desc':
          return (b.rating ?? -1) - (a.rating ?? -1);
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return sorted;
  }, [leads, searchText, websiteFilter, statusFilter, cityFilter, sortBy]);

  const allVisibleSelected =
    filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.includes(l.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(filteredLeads.map((l) => l.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      const merged = new Set([...selectedIds, ...filteredLeads.map((l) => l.id)]);
      setSelectedIds(Array.from(merged));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleCopy = async (text: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onNotify(`Скопійовано ${label}: ${text}`);
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 1600);
    } catch {
      onNotify('Не вдалося скопіювати в буфер обміну.');
    }
  };

  const handleExportCsv = () => {
    if (filteredLeads.length === 0) {
      onNotify('Немає даних для експорту.');
      return;
    }
    exportLeadsToCsv(filteredLeads);
    onNotify(`Експортовано ${filteredLeads.length} контактів у CSV.`);
  };

  const handleBulkDeleteClick = async () => {
    if (selectedIds.length === 0) return;
    await onBulkDelete(selectedIds);
    setSelectedIds([]);
  };

  return (
    <section
      aria-label="База потенційних клієнтів"
      className="rounded-xl border border-slate-800/80 bg-[#111722]"
    >
      {/* Панель фільтрів та дій */}
      <div className="p-4 md:p-5 border-b border-slate-800/80 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-50">База бізнесів</h2>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              Показано {filteredLeads.length} з {leads.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDeleteClick}
                className="h-9 px-3.5 rounded-lg border border-rose-500/40 bg-rose-950/40 hover:bg-rose-950/70 text-xs font-medium text-rose-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Видалити вибрані ({selectedIds.length})
              </button>
            )}

            <button
              type="button"
              onClick={onOpenManualAdd}
              className="h-9 px-3.5 rounded-lg border border-slate-700/80 bg-[#0A0E15] hover:bg-slate-800/80 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Додати вручну
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredLeads.length === 0}
              className="h-9 px-3.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Експорт CSV
            </button>
          </div>
        </div>

        {/* Пошук за назвою + фільтри + сортування */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Пошук за назвою, адресою, телефоном..."
              aria-label="Пошук за назвою"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Швидкі перемикачі наявності вебсайту */}
          <div className="lg:col-span-4 flex items-center p-1 rounded-lg bg-[#0A0E15] border border-slate-800">
            {(
              [
                { value: 'all', label: 'Усі' },
                { value: 'without_website', label: 'Тільки без сайту' },
                { value: 'with_website', label: 'Є сайт' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => onWebsiteFilterChange(tab.value)}
                className={`flex-1 h-8 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  websiteFilter === tab.value
                    ? 'bg-slate-800 text-slate-50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="lg:col-span-2">
            <select
              aria-label="Фільтр за CRM-статусом"
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as CrmStatus | 'all')}
              className="w-full h-10 px-2.5 rounded-lg bg-[#0A0E15] border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Усі статуси</option>
              {CRM_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2 flex gap-2">
            {uniqueCities.length > 1 && (
              <select
                aria-label="Фільтр за містом"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-1/2 h-10 px-2 rounded-lg bg-[#0A0E15] border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="all">Усі міста</option>
                {uniqueCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            <div className={`relative ${uniqueCities.length > 1 ? 'w-1/2' : 'w-full'}`}>
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                aria-label="Сортування"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full h-10 pl-8 pr-2 rounded-lg bg-[#0A0E15] border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="newest">Спочатку новіші</option>
                <option value="no_website_first">Спочатку без сайту</option>
                <option value="name_asc">Назва (А–Я)</option>
                <option value="name_desc">Назва (Я–А)</option>
                <option value="status">За CRM-статусом</option>
                <option value="rating_desc">За рейтингом</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Стан завантаження */}
      {isLoading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="h-12 rounded-lg bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : filteredLeads.length === 0 ? (
        /* Порожній стан */
        <div className="py-14 px-6 text-center">
          <div className="mx-auto w-11 h-11 rounded-xl border border-slate-800 bg-[#0A0E15] flex items-center justify-center text-slate-400">
            <Search className="w-5 h-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-100">
            {leads.length === 0 ? 'Список бізнесів поки порожній' : 'Нічого не знайдено за фільтрами'}
          </h3>
          <p className="mt-1.5 text-sm text-slate-400 max-w-md mx-auto">
            {leads.length === 0
              ? 'Скористайтеся формою пошуку вище, щоб отримати реальні бізнеси України з Google Places API (New), або додайте контакт вручну.'
              : 'Спробуйте скинути фільтр за сайтом, статусом або змінити пошуковий запит.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {leads.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSearchText('');
                  setCityFilter('all');
                  onWebsiteFilterChange('all');
                  onStatusFilterChange('all');
                }}
                className="h-10 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 transition-colors"
              >
                Скинути фільтри
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenManualAdd}
                className="h-10 px-4 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Додати бізнес вручну
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Десктопна таблиця */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-[#0D131D] text-[12px] font-medium text-slate-400">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      aria-label="Вибрати всі показані бізнеси"
                      className="rounded border-slate-700 bg-[#0A0E15] text-blue-500 focus:ring-blue-500"
                    />
                  </th>
                  <th className="py-3 px-3 min-w-[210px]">Назва та категорія</th>
                  <th className="py-3 px-3 min-w-[210px]">Адреса</th>
                  <th className="py-3 px-3 min-w-[165px]">Телефон</th>
                  <th className="py-3 px-3 min-w-[165px]">Вебсайт</th>
                  <th className="py-3 px-3 min-w-[160px]">CRM-статус</th>
                  <th className="py-3 px-3 min-w-[165px]">Нотатка</th>
                  <th className="py-3 pl-3 pr-4 text-right min-w-[125px]">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {filteredLeads.map((lead) => {
                  const safeWebsite = sanitizeExternalUrl(lead.website);
                  const safeMaps = sanitizeExternalUrl(lead.googleMapsUri);
                  const statusMeta = CRM_STATUS_MAP[lead.crmStatus] ?? CRM_STATUS_OPTIONS[0];
                  const isSelected = selectedIds.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={`transition-colors hover:bg-[#151D2B]/70 ${
                        isSelected ? 'bg-blue-950/20' : ''
                      }`}
                    >
                      <td className="py-3.5 pl-4 pr-2 align-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(lead.id)}
                          aria-label={`Вибрати ${lead.name}`}
                          className="mt-1 rounded border-slate-700 bg-[#0A0E15] text-blue-500 focus:ring-blue-500"
                        />
                      </td>

                      {/* Назва та категорія */}
                      <td className="py-3.5 px-3 align-top">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-slate-100 leading-snug">{lead.name}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(lead.name, `name-${lead.id}`, 'назву')}
                            title="Копіювати назву"
                            aria-label={`Копіювати назву ${lead.name}`}
                            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
                          >
                            {copiedKey === `name-${lead.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="mt-1 text-xs text-slate-400 flex flex-wrap items-center gap-x-1.5">
                          <span>{lead.category}</span>
                          {lead.rating !== null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums text-amber-300/90">
                                ★ {lead.rating.toFixed(1)}
                                {lead.userRatingCount ? ` (${lead.userRatingCount})` : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Адреса */}
                      <td className="py-3.5 px-3 align-top">
                        <div className="text-xs text-slate-300 leading-relaxed">{lead.address}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{lead.city}</div>
                      </td>

                      {/* Телефон */}
                      <td className="py-3.5 px-3 align-top">
                        {lead.phone ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${lead.phone.replace(/\s+/g, '')}`}
                              className="font-mono tabular-nums text-xs text-slate-200 hover:text-blue-400 transition-colors"
                            >
                              {lead.phone}
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCopy(lead.phone!, `phone-${lead.id}`, 'телефон')}
                              title="Копіювати телефон"
                              aria-label={`Копіювати телефон ${lead.phone}`}
                              className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
                            >
                              {copiedKey === `phone-${lead.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Не вказано</span>
                        )}
                      </td>

                      {/* Вебсайт */}
                      <td className="py-3.5 px-3 align-top">
                        {lead.hasWebsite && safeWebsite ? (
                          <div>
                            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                              <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>Є сайт</span>
                            </div>
                            <a
                              href={safeWebsite}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 block text-xs text-blue-400 hover:text-blue-300 truncate max-w-[160px]"
                              title={safeWebsite}
                            >
                              {getDisplayDomain(safeWebsite)}
                            </a>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                            <GlobeLock className="w-3.5 h-3.5 shrink-0" />
                            <span>Немає сайту</span>
                          </div>
                        )}
                      </td>

                      {/* CRM Статус */}
                      <td className="py-3.5 px-3 align-top">
                        <select
                          aria-label={`CRM статус для ${lead.name}`}
                          value={lead.crmStatus}
                          onChange={(e) => onStatusUpdate(lead.id, e.target.value as CrmStatus)}
                          className={`w-full h-8 px-2 rounded-md border text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 ${statusMeta.bgClass} ${statusMeta.borderClass} ${statusMeta.textClass}`}
                        >
                          {CRM_STATUS_OPTIONS.map((opt) => (
                            <option
                              key={opt.value}
                              value={opt.value}
                              className="bg-[#111722] text-slate-100"
                            >
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Нотатка */}
                      <td className="py-3.5 px-3 align-top">
                        <button
                          type="button"
                          onClick={() => onOpenNote(lead)}
                          className="w-full text-left group rounded-md px-2 py-1 -mx-2 -my-1 hover:bg-slate-800/70 transition-colors"
                        >
                          {lead.note ? (
                            <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                              {lead.note}
                            </p>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500 group-hover:text-slate-300">
                              <MessageSquarePlus className="w-3.5 h-3.5" />
                              Додати нотатку
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Дії */}
                      <td className="py-3.5 pl-3 pr-4 align-top text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {safeMaps && (
                            <a
                              href={safeMaps}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Відкрити в Google Maps"
                              aria-label={`Відкрити ${lead.name} в Google Maps`}
                              className="h-8 px-2.5 rounded-md border border-slate-800 bg-[#0A0E15] hover:border-slate-700 text-xs text-slate-200 hover:text-white inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                            >
                              <MapPin className="w-3.5 h-3.5 text-blue-400" />
                              <span>Карта</span>
                              <ExternalLink className="w-3 h-3 text-slate-500" />
                            </a>
                          )}

                          {confirmDeleteId === lead.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteLead(lead.id);
                                setConfirmDeleteId(null);
                              }}
                              onMouseLeave={() => setConfirmDeleteId(null)}
                              className="h-8 px-2.5 rounded-md bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white transition-colors whitespace-nowrap"
                            >
                              Підтвердити
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(lead.id)}
                              title="Видалити зі списку"
                              aria-label={`Видалити ${lead.name}`}
                              className="h-8 w-8 rounded-md border border-slate-800 bg-[#0A0E15] hover:border-rose-500/40 hover:text-rose-400 text-slate-400 inline-flex items-center justify-center transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Мобільний список карток (< md) */}
          <div className="md:hidden divide-y divide-slate-800/80">
            {filteredLeads.map((lead) => {
              const safeWebsite = sanitizeExternalUrl(lead.website);
              const safeMaps = sanitizeExternalUrl(lead.googleMapsUri);
              const statusMeta = CRM_STATUS_MAP[lead.crmStatus] ?? CRM_STATUS_OPTIONS[0];

              return (
                <div key={lead.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-slate-100 truncate">{lead.name}</h3>
                        <button
                          type="button"
                          onClick={() => handleCopy(lead.name, `m-name-${lead.id}`, 'назву')}
                          aria-label="Копіювати назву"
                          className="p-1.5 text-slate-400 hover:text-slate-100"
                        >
                          {copiedKey === `m-name-${lead.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400">
                        {lead.category} · {lead.city}
                      </p>
                    </div>

                    {lead.hasWebsite && safeWebsite ? (
                      <span className="text-xs text-slate-400 shrink-0">Є сайт</span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-400 shrink-0">
                        Немає сайту
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300">{lead.address}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    {lead.phone ? (
                      <div className="inline-flex items-center gap-2">
                        <a
                          href={`tel:${lead.phone.replace(/\s+/g, '')}`}
                          className="font-mono tabular-nums text-slate-200 underline decoration-slate-700"
                        >
                          {lead.phone}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopy(lead.phone!, `m-phone-${lead.id}`, 'телефон')}
                          className="px-2 py-1 rounded bg-slate-800 text-slate-200 inline-flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          Копіювати
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-500">Телефон не вказано</span>
                    )}

                    {safeWebsite && (
                      <a
                        href={safeWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 truncate max-w-[180px]"
                      >
                        {getDisplayDomain(safeWebsite)}
                      </a>
                    )}
                  </div>

                  {lead.note && (
                    <p className="text-xs text-slate-300 bg-[#0A0E15] border border-slate-800 rounded-lg p-2.5">
                      {lead.note}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <select
                      aria-label={`Статус для ${lead.name}`}
                      value={lead.crmStatus}
                      onChange={(e) => onStatusUpdate(lead.id, e.target.value as CrmStatus)}
                      className={`h-11 px-2.5 rounded-lg border text-xs font-medium ${statusMeta.bgClass} ${statusMeta.borderClass} ${statusMeta.textClass}`}
                    >
                      {CRM_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-[#111722] text-slate-100">
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => onOpenNote(lead)}
                      className="h-11 px-3 rounded-lg border border-slate-800 bg-[#0A0E15] text-xs text-slate-200 inline-flex items-center justify-center gap-1.5"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      {lead.note ? 'Змінити нотатку' : 'Нотатка'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {safeMaps && (
                      <a
                        href={safeMaps}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 h-11 rounded-lg border border-slate-800 bg-[#0A0E15] text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-1.5"
                      >
                        <MapPin className="w-3.5 h-3.5 text-blue-400" />
                        Відкрити Google Maps
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeleteLead(lead.id);
                      }}
                      aria-label={`Видалити ${lead.name}`}
                      className="h-11 px-3.5 rounded-lg border border-slate-800 bg-[#0A0E15] text-xs text-rose-300 inline-flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Видалити
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
