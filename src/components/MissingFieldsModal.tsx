import { AlertTriangle, X } from "lucide-react";

export function MissingFieldsModal({
  title = "Dati mancanti",
  fields,
  onClose,
}: {
  title?: string;
  fields: string[];
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="missing-fields-modal">
        <div className="missing-fields-icon"><AlertTriangle size={26} /></div>
        <div className="missing-fields-content">
          <div className="missing-fields-head">
            <div>
              <span className="eyebrow">Controllo compilazione</span>
              <h3>{title}</h3>
            </div>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Chiudi">
              <X size={18} />
            </button>
          </div>
          <p>Prima di salvare completa questi campi:</p>
          <ul>
            {fields.map((field) => <li key={field}>{field}</li>)}
          </ul>
          <div className="modal-actions">
            <button className="button" type="button" onClick={onClose}>Ho capito</button>
          </div>
        </div>
      </div>
    </div>
  );
}
