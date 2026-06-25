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

export function todayInput() {
  return new Date().toISOString().split('T')[0];
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}