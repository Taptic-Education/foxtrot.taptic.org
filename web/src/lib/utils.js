import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function formatCurrency(amount, currency = 'ZAR') {
  const symbols = { ZAR: 'R', USD: '$', EUR: '€', GBP: '£' };
  const symbol = symbols[currency] || currency;
  const num = parseFloat(amount) || 0;
  return `${symbol}${num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date) {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'dd MMM yyyy');
  } catch {
    return '—';
  }
}

export function formatRelativeDate(date) {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

export function getCurrencySymbol(currency) {
  const symbols = { ZAR: 'R', USD: '$', EUR: '€', GBP: '£' };
  return symbols[currency] || currency;
}

export function getStatusBadgeClass(status) {
  const map = {
    active: 'badge-success',
    completed: 'badge-success',
    approved: 'badge-success',
    pending: 'badge-warning',
    low: 'badge-warning',
    cancelled: 'badge-danger',
    rejected: 'badge-danger',
    archived: 'badge-muted',
    inactive: 'badge-muted',
    medium: 'badge-muted',
    high: 'badge-danger',
  };
  return map[status?.toLowerCase()] || 'badge-muted';
}
