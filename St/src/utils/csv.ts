import { CRM_STATUS_MAP, type BusinessLead } from '../shared/types.ts';

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let text = String(value).replace(/\r?\n/g, ' ').trim();
  // Prevent spreadsheet formula injection while keeping Ukrainian +380 phone numbers intact
  if (/^[=@\t]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportLeadsToCsv(leads: BusinessLead[]): void {
  const headers = [
    'Назва',
    'Категорія',
    'Місто',
    'Адреса',
    'Телефон',
    'Статус сайту',
    'Вебсайт',
    'Google Maps',
    'CRM Статус',
    'Нотатка',
    'Рейтинг',
    'Кількість відгуків',
    'Дата додавання',
  ];

  const rows = leads.map((lead) => [
    escapeCsvCell(lead.name),
    escapeCsvCell(lead.category),
    escapeCsvCell(lead.city),
    escapeCsvCell(lead.address),
    escapeCsvCell(lead.phone ?? ''),
    escapeCsvCell(lead.hasWebsite ? 'Є сайт' : 'Немає сайту'),
    escapeCsvCell(lead.website ?? ''),
    escapeCsvCell(lead.googleMapsUri ?? ''),
    escapeCsvCell(CRM_STATUS_MAP[lead.crmStatus]?.label ?? lead.crmStatus),
    escapeCsvCell(lead.note),
    escapeCsvCell(lead.rating !== null ? lead.rating : ''),
    escapeCsvCell(lead.userRatingCount !== null ? lead.userRatingCount : ''),
    escapeCsvCell(new Date(lead.createdAt).toLocaleDateString('uk-UA')),
  ]);

  const csvContent =
    '\uFEFF' + [headers.map((h) => escapeCsvCell(h)).join(','), ...rows.map((r) => r.join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `leadfinder-ukraine-${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
