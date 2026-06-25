import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  description,
  kicker = "Modulo KPI",
  actions,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  kicker?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header pro-header">
      <div>
        <div className="page-kicker">{kicker}</div>
        <h2>{title}</h2>
        {(description || subtitle) ? <p>{description || subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
