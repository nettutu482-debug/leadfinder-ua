import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';

export interface ManualLeadInput {
  name: string;
  category: string;
  city: string;
  address: string;
  phone: string;
  website: string;
  googleMapsUri: string;
  note: string;
}

interface ManualLeadModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: ManualLeadInput) => Promise<void>;
}

export function ManualLeadModal({ open, onClose, onCreate }: ManualLeadModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [googleMapsUri, setGoogleMapsUri] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !city.trim()) {
      setError('Вкажіть назву бізнесу та місто.');
      return;
    }
    setIsSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        category: category.trim(),
        city: city.trim(),
        address: address.trim(),
        phone: phone.trim(),
        website: website.trim(),
        googleMapsUri: googleMapsUri.trim(),
        note: note.trim(),
      });
      setName('');
      setCategory('');
      setCity('');
      setAddress('');
      setPhone('');
      setWebsite('');
      setGoogleMapsUri('');
      setNote('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося додати бізнес.');
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
      aria-labelledby="manual-lead-title"
    >
      <div
        className="w-full max-w-xl rounded-xl border border-slate-800 bg-[#111722] p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="manual-lead-title" className="text-base font-semibold text-slate-50">
              Додати бізнес вручну
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Збережіть контакт у базу CRM, якщо ви знайшли його самостійно
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="m-name" className="block text-xs font-medium text-slate-300 mb-1">
                Назва бізнесу *
              </label>
              <input
                id="m-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Наприклад: Barbershop Knyaz"
                className="w-full h-10 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="m-city" className="block text-xs font-medium text-slate-300 mb-1">
                Місто *
              </label>
              <input
                id="m-city"
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Наприклад: Львів"
                className="w-full h-10 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="m-category" className="block text-xs font-medium text-slate-300 mb-1">
                Категорія / Ніша
              </label>
              <input
                id="m-category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Наприклад: Барбершоп"
                className="w-full h-10 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="m-phone" className="block text-xs font-medium text-slate-300 mb-1">
                Телефон
              </label>
              <input
                id="m-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+380 67 000 00 00"
                className="w-full h-10 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 font-mono placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="m-address" className="block text-xs font-medium text-slate-300 mb-1">
              Адреса
            </label>
            <input
              id="m-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="вул. Городоцька, 120"
              className="w-full h-10 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="m-website" className="block text-xs font-medium text-slate-300 mb-1">
                Вебсайт (залиште порожнім, якщо немає)
              </label>
              <input
                id="m-website"
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.ua"
                className="w-full h-10 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="m-maps" className="block text-xs font-medium text-slate-300 mb-1">
                Посилання на Google Maps
              </label>
              <input
                id="m-maps"
                type="text"
                value={googleMapsUri}
                onChange={(e) => setGoogleMapsUri(e.target.value)}
                placeholder="https://maps.google.com/..."
                className="w-full h-10 px-3 rounded-lg bg-[#0A0E15] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="m-note" className="block text-xs font-medium text-slate-300 mb-1">
              Нотатка
            </label>
            <textarea
              id="m-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Початковий коментар..."
              className="w-full rounded-lg bg-[#0A0E15] border border-slate-800 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

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
              Додати бізнес
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
