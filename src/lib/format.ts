export const euro = (value: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value ?? 0));

export const numberIt = (value: number | null | undefined, digits = 2) =>
  new Intl.NumberFormat("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value ?? 0));

export const monthName = (month: number) =>
  new Intl.DateTimeFormat("it-IT", { month: "long" }).format(new Date(2026, month - 1, 1));

export const todayInput = () => new Date().toISOString().slice(0, 10);

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
