/**
 * Centralized Date Utilities
 * Eliminates duplicated date formatting logic across components.
 */

/**
 * Convert any date value to a timestamp (ms since epoch).
 * Returns 0 for invalid/missing dates.
 */
export function toTimestamp(value?: string | Date | number): number {
  if (!value) return 0;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/**
 * Format a date string to Brazilian short format (e.g., "15 jan").
 */
export function formatShortDate(value?: string): string {
  const timestamp = toTimestamp(value);
  if (!timestamp) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(timestamp));
}

/**
 * Format a date string to Brazilian full format (DD/MM/YYYY).
 */
export function formatDateToBR(dateStr?: string): string {
  if (!dateStr) return '-';
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = dateOnly.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Format a database ISO date string to a clean YYYY-MM-DD string.
 */
export function formatDbDate(date: string | Date | null | undefined): string {
  if (!date) return new Date().toISOString().split('T')[0];
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
}

/**
 * Get relative time string in Portuguese (e.g., "Há 5 min", "Há 2h", "Há 3 dias").
 */
export function getRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffInMinutes < 1) return 'Agora';
  if (diffInMinutes < 60) return `Há ${diffInMinutes} min`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `Há ${diffInHours}h`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `Há ${diffInDays} dias`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Get the day name from a date (e.g., "Seg", "Ter").
 */
export function getDayName(date: Date): string {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return days[date.getDay()];
}

/**
 * Create a date from date and time parts.
 */
export function parseEventDate(dateStr: string, timeStr?: string): Date | null {
  if (!dateStr) return null;
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const dateParts = dateOnly.split('-');
  const timeParts = (timeStr || '00:00').split(':');

  if (dateParts.length === 3) {
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const hour = parseInt(timeParts[0] || '0', 10);
    const minute = parseInt(timeParts[1] || '0', 10);
    return new Date(year, month, day, hour, minute);
  }
  return new Date(dateStr);
}
