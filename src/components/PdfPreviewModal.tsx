import { Download, X } from "lucide-react";

export type PdfPreviewState = {
  url: string;
  filename: string;
  title: string;
};

export function PdfPreviewModal({
  preview,
  onClose,
}: {
  preview: PdfPreviewState;
  onClose: () => void;
}) {
  const download = () => {
    const a = document.createElement("a");
    a.href = preview.url;
    a.download = preview.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="modal-backdrop pdf-preview-backdrop" role="dialog" aria-modal="true">
      <div className="pdf-preview-modal">
        <div className="pdf-preview-header">
          <div>
            <span className="eyebrow">Anteprima PDF</span>
            <h3>{preview.title}</h3>
            <p className="muted">Controlla il documento prima di scaricarlo o inviarlo.</p>
          </div>
          <div className="row-actions">
            <button className="button secondary" type="button" onClick={download}>
              <Download size={16} /> Scarica
            </button>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Chiudi anteprima PDF">
              <X size={18} />
            </button>
          </div>
        </div>
        <iframe className="pdf-preview-frame" src={preview.url} title={preview.title} />
      </div>
    </div>
  );
}
