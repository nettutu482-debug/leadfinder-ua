import { useCallback, useEffect, useState } from 'react';
import {
  Compass,
  Filter,
  GlobeLock,
  KeyRound,
  LayoutDashboard,
  Menu,
  Users,
  X,
} from 'lucide-react';
import { ApiGuideModal } from './components/ApiGuideModal.tsx';
import { KpiBar } from './components/KpiBar.tsx';
import { LeadsTable } from './components/LeadsTable.tsx';
import { ManualLeadModal, type ManualLeadInput } from './components/ManualLeadModal.tsx';
import { NoteModal } from './components/NoteModal.tsx';
import { SearchPanel, type SearchParamsPayload } from './components/SearchPanel.tsx';
import type {
  BusinessLead,
  CrmStatus,
  LeadStats,
  SearchHistoryItem,
  WebsiteFilter,
} from './shared/types.ts';
import { exportLeadsToCsv } from './utils/csv.ts';

const EMPTY_STATS: LeadStats = {
  total: 0,
  withoutWebsite: 0,
  withWebsite: 0,
  contactedTotal: 0,
  statusCounts: {
    new: 0,
    contacted: 0,
    replied: 0,
    interested: 0,
    declined: 0,
    client: 0,
  },
};

export default function App() {
  const [leads, setLeads] = useState<BusinessLead[]>([]);
  const [stats, setStats] = useState<LeadStats>(EMPTY_STATS);
  const [recentSearches, setRecentSearches] = useState<SearchHistoryItem[]>([]);
  const [placesApiConfigured, setPlacesApiConfigured] = useState<boolean>(true);
  const [isLoadingLeads, setIsLoadingLeads] = useState<boolean>(true);

  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastSearchSummary, setLastSearchSummary] = useState<{
    query: string;
    totalFetched: number;
    newSavedCount: number;
    noWebsiteCount: number;
  } | null>(null);

  const [websiteFilter, setWebsiteFilter] = useState<WebsiteFilter>('all');
  const [statusFilter, setStatusFilter] = useState<CrmStatus | 'all'>('all');

  const [editingNoteLead, setEditingNoteLead] = useState<BusinessLead | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isApiGuideOpen, setIsApiGuideOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    const handleQuotaEvent = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaEvent);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaEvent);
  }, []);

  const loadInitialData = useCallback(async () => {
    setIsLoadingLeads(true);
    try {
      const [healthRes, leadsRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/leads'),
      ]);

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setPlacesApiConfigured(Boolean(healthData.placesApiConfigured));
      }

      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        setLeads(Array.isArray(leadsData.leads) ? leadsData.leads : []);
        setStats(leadsData.stats ?? EMPTY_STATS);
        setRecentSearches(
          Array.isArray(leadsData.recentSearches) ? leadsData.recentSearches : []
        );
      }
    } catch (err) {
      console.error('Failed to load initial LeadFinder data:', err);
      showToast('Помилка зʼєднання з сервером бази даних.');
    } finally {
      setIsLoadingLeads(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const handleSearch = async (payload: SearchParamsPayload) => {
    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await fetch('/api/places/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 429 || data.errorCode === 'QUOTA_EXCEEDED') {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        setSearchError(
          data.message || 'Вичерпано ліміт запитів Google Places API (New).'
        );
        return;
      }

      if (!response.ok) {
        if (data.errorCode === 'API_KEY_MISSING') {
          setPlacesApiConfigured(false);
        }
        setSearchError(data.message || 'Не вдалося виконати пошук бізнесів.');
        return;
      }

      setPlacesApiConfigured(true);
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      setStats(data.stats ?? EMPTY_STATS);
      setRecentSearches(Array.isArray(data.recentSearches) ? data.recentSearches : []);
      setLastSearchSummary({
        query: data.query,
        totalFetched: Number(data.totalFetched) || 0,
        newSavedCount: Number(data.newSavedCount) || 0,
        noWebsiteCount: Number(data.noWebsiteCount) || 0,
      });

      // Синхронізуємо фільтр таблиці з обраним фільтром у формі пошуку
      setWebsiteFilter(payload.websiteFilter);
      setStatusFilter('all');

      showToast(
        `Знайдено ${data.totalFetched} бізнесів (${data.noWebsiteCount} без сайту)`
      );
    } catch (err) {
      console.error('Search error:', err);
      setSearchError('Не вдалося зʼєднатися із сервером для виконання пошуку.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleStatusUpdate = async (leadId: string, crmStatus: CrmStatus) => {
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crmStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || 'Помилка оновлення статусу.');
        return;
      }
      setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead : l)));
      if (data.stats) setStats(data.stats);
      showToast('Статус контакту оновлено.');
    } catch {
      showToast('Помилка збереження статусу.');
    }
  };

  const handleSaveNote = async (leadId: string, note: string) => {
    const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'Не вдалося зберегти нотатку.');
      return;
    }
    setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead : l)));
    if (data.stats) setStats(data.stats);
    showToast('Нотатку збережено.');
  };

  const handleCreateManualLead = async (payload: ManualLeadInput) => {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Не вдалося додати бізнес.');
    }
    setLeads((prev) => [data.lead, ...prev]);
    if (data.stats) setStats(data.stats);
    showToast('Бізнес додано до бази.');
  };

  const handleDeleteLead = async (leadId: string) => {
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || 'Не вдалося видалити бізнес.');
        return;
      }
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      if (data.stats) setStats(data.stats);
      showToast('Бізнес видалено зі списку.');
    } catch {
      showToast('Помилка під час видалення.');
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    try {
      const res = await fetch('/api/leads/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || 'Не вдалося видалити вибрані записи.');
        return;
      }
      const deletedSet = new Set(ids);
      setLeads((prev) => prev.filter((l) => !deletedSet.has(l.id)));
      if (data.stats) setStats(data.stats);
      showToast(`Видалено записів: ${data.deletedCount ?? ids.length}`);
    } catch {
      showToast('Помилка масового видалення.');
    }
  };

  const sidebarNavItems = [
    {
      id: 'all',
      label: 'Усі бізнеси',
      count: stats.total,
      icon: LayoutDashboard,
      active: websiteFilter === 'all' && statusFilter === 'all',
      onClick: () => {
        setWebsiteFilter('all');
        setStatusFilter('all');
        setMobileMenuOpen(false);
      },
    },
    {
      id: 'no-site',
      label: 'Без вебсайту',
      count: stats.withoutWebsite,
      icon: GlobeLock,
      active: websiteFilter === 'without_website' && statusFilter === 'all',
      onClick: () => {
        setWebsiteFilter('without_website');
        setStatusFilter('all');
        setMobileMenuOpen(false);
      },
    },
    {
      id: 'contacted',
      label: 'Написав',
      count: stats.statusCounts.contacted,
      icon: Compass,
      active: statusFilter === 'contacted',
      onClick: () => {
        setWebsiteFilter('all');
        setStatusFilter('contacted');
        setMobileMenuOpen(false);
      },
    },
    {
      id: 'interested',
      label: 'Зацікавлені',
      count: stats.statusCounts.interested,
      icon: Filter,
      active: statusFilter === 'interested',
      onClick: () => {
        setWebsiteFilter('all');
        setStatusFilter('interested');
        setMobileMenuOpen(false);
      },
    },
    {
      id: 'clients',
      label: 'Клієнти',
      count: stats.statusCounts.client,
      icon: Users,
      active: statusFilter === 'client',
      onClick: () => {
        setWebsiteFilter('all');
        setStatusFilter('client');
        setMobileMenuOpen(false);
      },
    },
  ];

  return (
    <div className="min-h-screen bg-[#0A0E15] text-slate-100 flex flex-col">
      {/* Mandatory Case A Demo Key Quota Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-slate-800/80 bg-[#0D121B]">
          <div className="h-16 px-6 flex items-center border-b border-slate-800/80">
            <span className="font-display text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap">
              LeadFinder
            </span>
          </div>

          <nav aria-label="Фільтри бази" className="flex-1 p-4 space-y-1">
            <div className="px-3 pb-2 text-xs font-medium text-slate-500">Воронка контактів</div>
            {sidebarNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={`w-full h-10 px-3 rounded-lg text-sm font-medium flex items-center justify-between gap-2 transition-colors whitespace-nowrap ${
                    item.active
                      ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums text-slate-400">{item.count}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-800/80 space-y-2">
            <button
              type="button"
              onClick={() => setIsApiGuideOpen(true)}
              className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-[#0A0E15] hover:border-slate-700 text-xs font-medium text-slate-300 hover:text-slate-100 flex items-center justify-between gap-2 transition-colors whitespace-nowrap"
            >
              <span className="flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5 text-blue-400" />
                Google Places API
              </span>
              <span className={placesApiConfigured ? 'text-emerald-400' : 'text-amber-300'}>
                {placesApiConfigured ? 'Готово' : 'Налаштувати'}
              </span>
            </button>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <div
              className="fixed inset-0 bg-black/70"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <aside className="relative z-50 w-72 max-w-[85vw] bg-[#0D121B] border-r border-slate-800 flex flex-col h-full">
              <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
                <span className="font-display text-lg font-bold text-slate-50">LeadFinder</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Закрити меню"
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 p-4 space-y-1">
                {sidebarNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={item.onClick}
                      className={`w-full h-11 px-3 rounded-lg text-sm font-medium flex items-center justify-between gap-2 ${
                        item.active
                          ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                          : 'text-slate-300 hover:bg-slate-800/50 border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </span>
                      <span className="font-mono text-xs tabular-nums">{item.count}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setIsApiGuideOpen(true);
                  }}
                  className="w-full h-11 px-3 rounded-lg border border-slate-800 bg-[#0A0E15] text-xs font-medium text-slate-200 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-blue-400" />
                    Google Places API
                  </span>
                  <span className={placesApiConfigured ? 'text-emerald-400' : 'text-amber-300'}>
                    {placesApiConfigured ? 'Готово' : 'Налаштувати'}
                  </span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Main Workspace */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Header */}
          <header className="h-16 px-4 md:px-8 border-b border-slate-800/80 bg-[#0D121B]/90 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Відкрити меню"
                className="lg:hidden p-2 -ml-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="font-display text-base md:text-lg font-semibold text-slate-50 truncate">
                Пошук та облік бізнес-клієнтів України
              </h1>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (leads.length === 0) {
                    showToast('Немає збережених контактів для експорту.');
                    return;
                  }
                  exportLeadsToCsv(leads);
                  showToast(`Експортовано ${leads.length} контактів у CSV.`);
                }}
                disabled={leads.length === 0}
                className="h-9 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Експорт бази CSV
              </button>
            </div>
          </header>

          {/* Content Container */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 max-w-[1440px] w-full mx-auto">
            <KpiBar
              stats={stats}
              onResetFilters={() => {
                setWebsiteFilter('all');
                setStatusFilter('all');
              }}
              onQuickFilterNoWebsite={() => {
                setWebsiteFilter('without_website');
                setStatusFilter('all');
              }}
              onQuickFilterContacted={() => {
                setWebsiteFilter('all');
                setStatusFilter('contacted');
              }}
              onQuickFilterInterested={() => {
                setWebsiteFilter('all');
                setStatusFilter('interested');
              }}
            />

            <SearchPanel
              placesApiConfigured={placesApiConfigured}
              isSearching={isSearching}
              searchError={searchError}
              lastSearchSummary={lastSearchSummary}
              recentSearches={recentSearches}
              onSearch={handleSearch}
              onOpenApiGuide={() => setIsApiGuideOpen(true)}
            />

            <LeadsTable
              leads={leads}
              isLoading={isLoadingLeads}
              websiteFilter={websiteFilter}
              onWebsiteFilterChange={setWebsiteFilter}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onStatusUpdate={handleStatusUpdate}
              onOpenNote={(lead) => setEditingNoteLead(lead)}
              onDeleteLead={handleDeleteLead}
              onBulkDelete={handleBulkDelete}
              onOpenManualAdd={() => setIsManualModalOpen(true)}
              onNotify={showToast}
            />
          </main>

          {/* Quiet Footer */}
          <footer className="px-4 md:px-8 py-4 border-t border-slate-800/70 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 max-w-[1440px] w-full mx-auto">
            <span>LeadFinder Україна · Збереження даних у локальній базі SQLite</span>
            <span>
              Пошук бізнесів працює через Google Places API (New) ·{' '}
              <a
                href="https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-slate-300"
              >
                Умови використання Google Maps Platform
              </a>
            </span>
          </footer>
        </div>
      </div>

      {/* Modals */}
      <NoteModal
        lead={editingNoteLead}
        onClose={() => setEditingNoteLead(null)}
        onSave={handleSaveNote}
      />

      <ManualLeadModal
        open={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onCreate={handleCreateManualLead}
      />

      <ApiGuideModal
        open={isApiGuideOpen}
        placesApiConfigured={placesApiConfigured}
        onClose={() => setIsApiGuideOpen(false)}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-slate-700 bg-[#161E2C] px-4 py-3 text-xs sm:text-sm text-slate-100 shadow-xl"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
