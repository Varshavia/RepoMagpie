// Dates on invoices, as 2026-10-25.
export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}
