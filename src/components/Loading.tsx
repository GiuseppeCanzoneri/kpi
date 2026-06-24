export function Loading({ label = "Caricamento" }: { label?: string }) {
  return <div className="loading">{label}...</div>;
}
