export function formatMoney(amount: string | number | null | undefined, withSymbol = true): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = typeof amount === 'string' ? Number(amount) : amount;
  const formatted = new Intl.NumberFormat('en-MW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
  return withSymbol ? `MWK ${formatted}` : formatted;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-MW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-MW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
