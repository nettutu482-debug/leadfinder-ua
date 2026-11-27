import type { LeadStats } from '../shared/types.ts';

interface KpiBarProps {
  stats: LeadStats;
  onQuickFilterNoWebsite: () => void;
  onQuickFilterContacted: () => void;
  onQuickFilterInterested: () => void;
  onResetFilters: () => void;
}

export function KpiBar({
  stats,
  onQuickFilterNoWebsite,
  onQuickFilterContacted,
  onQuickFilterInterested,
  onResetFilters,
}: KpiBarProps) {
  const noWebsitePercent =
    stats.total > 0 ? Math.round((stats.withoutWebsite / stats.total) * 100) : 0;

  const cards = [
    {
      label: 'Усього знайдено бізнесів',
      value: stats.total,
      meta: `${stats.withWebsite} із сайтом`,
      valueClass: 'text-slate-50',
      onClick: onResetFilters,
    },
    {
      label: 'Без вебсайту',
      value: stats.withoutWebsite,
      meta: stats.total > 0 ? `${noWebsitePercent}% від бази` : 'Пріоритетні ліди',
      valueClass: 'text-emerald-400',
      onClick: onQuickFilterNoWebsite,
    },
    {
      label: 'Контактів, яким уже написано',
      value: stats.contactedTotal,
      meta: `В очікуванні відповіді: ${stats.statusCounts.contacted}`,
      valueClass: 'text-blue-400',
      onClick: onQuickFilterContacted,
    },
    {
      label: 'Зацікавлених клієнтів',
      value: stats.statusCounts.interested + stats.statusCounts.client,
      meta: `Зацікавлені: ${stats.statusCounts.interested} · Клієнти: ${stats.statusCounts.client}`,
      valueClass: 'text-amber-300',
      onClick: onQuickFilterInterested,
    },
  ];

  return (
    <section aria-label="Ключові показники" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <button
          key={card.label}
          type="button"
          onClick={card.onClick}
          className="text-left rounded-xl border border-slate-800/80 bg-[#111722] p-5 transition-colors hover:border-slate-700 hover:bg-[#151D2B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <div className="text-xs font-medium text-slate-400 truncate">{card.label}</div>
          <div className={`mt-2 text-3xl font-bold font-mono tabular-nums tracking-tight ${card.valueClass}`}>
            {card.value}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums truncate">{card.meta}</div>
        </button>
      ))}
    </section>
  );
}
