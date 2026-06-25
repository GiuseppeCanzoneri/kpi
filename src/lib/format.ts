export function euro(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value));
}

export function numberIt(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value));
}

export function monthLabel(month: number, year: number) {
  return `${String(month).padStart(2, "0")}/${year}`;
}

export function statusClass(status: string) {
  const key = status.toLowerCase().replace(/\s+/g, "-");
  return `status-badge status-${key}`;
}
