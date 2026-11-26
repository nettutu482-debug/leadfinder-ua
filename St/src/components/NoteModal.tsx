import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import type { BusinessLead } from '../shared/types.ts';

interface NoteModalProps {
  lead: BusinessLead | null;
  onClose: () => void;
  onSave: (leadId: string, note: string) => Promise<void>;
}

export function NoteModal({ lead, onClose, onSave }: NoteModalProps) {
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNote(lead?.note ?? '');
  }, [lead]);

  useEffect(() => {
    if (!lead) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lead, onClose]);

  if (!lead) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(lead.id, note.trim());
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-modal-title"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-800 bg-[#111722] p-5 md:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id="note-modal-title" className="text-base font-semibold text-slate-50 truncate">
              Нотатка про клієнта
            </h3>
            <p className="mt-0.5 text-xs text-slate-400 truncate">
              {lead.name} · {lead.city}
            </p>
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="lead-note-input" className="block text-xs font-medium text-slate-300 mb-1.5">
              Деталі спілкування, пропозиція або наступний крок
            </label>
            <textarea
              id="lead-note-input"
              rows={5}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Наприклад: Немає сайту, активний Instagram. Надіслано пропозицію лендінгу + онлайн-запис у Telegram, передзвонити у вівторок."
              className="w-full rounded-lg bg-[#0A0E15] border border-slate-800 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
              autoFocus
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-500 tabular-nums">
              <span>Зберігається автоматично в базі після натискання «Зберегти»</span>
              <span>{note.length}/2000</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-slate-800 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-2 transition-colors"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Зберегти нотатку
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
