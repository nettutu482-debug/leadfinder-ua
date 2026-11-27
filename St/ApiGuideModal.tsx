import { useEffect } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck, X } from 'lucide-react';

interface ApiGuideModalProps {
  open: boolean;
  placesApiConfigured: boolean;
  onClose: () => void;
}

export function ApiGuideModal({ open, placesApiConfigured, onClose }: ApiGuideModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-guide-title"
    >
      <div
        className="w-full max-w-xl rounded-xl border border-slate-800 bg-[#111722] p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-blue-400 shrink-0" />
            <h3 id="api-guide-title" className="text-base font-semibold text-slate-50">
              Підключення Google Places API (New)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm text-slate-300 leading-relaxed">
          <div className="rounded-lg border border-slate-800 bg-[#0A0E15] p-3.5 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">Поточний стан на сервері:</span>
            {placesApiConfigured ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Ключ підключено та готовий до пошуку
              </span>
            ) : (
              <span className="text-xs font-medium text-amber-300">
                Очікує налаштування змінної GOOGLE_MAPS_API_KEY
              </span>
            )}
          </div>

          <div className="space-y-2.5 text-xs sm:text-sm">
            <p className="font-medium text-slate-100">Як працює інтеграція в LeadFinder:</p>
            <ol className="list-decimal list-inside space-y-2 text-slate-300">
              <li>
                Усі запити виконуються через серверну частину (<code className="font-mono text-slate-200">POST /api/places/search</code>), тому секретний ключ ніколи не потрапляє у відкритий браузерний код.
              </li>
              <li>
                Для пошуку використовується офіційний метод{' '}
                <code className="font-mono text-slate-200">places:searchText</code> з Google Places API (New) та точним переліком полів (<code className="font-mono text-slate-200">X-Goog-FieldMask</code>) для економії лімітів.
              </li>
              <li>
                Якщо ви запускаєте застосунок зі своїм Google Cloud проєктом, увімкніть у{' '}
                <a
                  href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Google Cloud Console
                </a>{' '}
                API <strong>Places API (New)</strong> та додайте ключ у секрет середовища{' '}
                <code className="font-mono text-slate-200">GOOGLE_MAPS_API_KEY</code>.
              </li>
            </ol>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0A0E15] p-3.5 flex items-start gap-2.5 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-slate-200 font-medium">Безпека ключа</p>
              <p className="mt-0.5">
                Рекомендується обмежити ключ у Google Cloud (API restrictions → Places API (New) та IP/HTTP referrer restrictions) згідно з{' '}
                <a
                  href="https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  інструкцією Google Cloud
                </a>
                .
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 transition-colors"
          >
            Зрозуміло
          </button>
        </div>
      </div>
    </div>
  );
}
