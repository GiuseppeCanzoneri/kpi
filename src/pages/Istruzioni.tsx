import { PageHeader } from "../components/PageHeader";

export default function Istruzioni() {
  return (
    <div>
      <PageHeader title="Istruzioni operative" subtitle="Uso del modulo KPI / Contabilità Ore Infragruppo." />
      <section className="panel prose">
        <h3>Flusso corretto</h3>
        <ol>
          <li>Il SUPER_ADMIN configura <strong>società</strong>, <strong>sedi</strong>, <strong>aree</strong> e <strong>profili tariffari</strong>.</li>
          <li>Il SUPER_ADMIN crea/aggiorna <strong>dipendenti</strong>, <strong>commesse</strong> e <strong>categorie attività</strong>.</li>
          <li>Il SUPER_ADMIN assegna gli utenti alle aree dalla pagina <strong>Accessi area</strong>.</li>
          <li>Gli USER_AREA inseriscono le proprie ore in stato <strong>Bozza</strong>.</li>
          <li>Gli ADMIN_AREA approvano o rimandano a correzione le ore della propria area.</li>
          <li>Il SUPER_ADMIN genera riepiloghi, prospetti fattura e report PDF.</li>
        </ol>
        <h3>Regole contabili</h3>
        <p>Il sistema calcola automaticamente la società datrice dal dipendente, la tariffa dal profilo, le ore pesate dalla categoria attività e il tipo movimento.</p>
        <ul>
          <li><strong>Interno non fatturabile</strong>: società datrice uguale a società beneficiaria.</li>
          <li><strong>Infragruppo fatturabile</strong>: società datrice diversa da società beneficiaria.</li>
        </ul>
        <h3>Tariffario</h3>
        <p>Il tariffario è sensibile e può essere gestito solo dal <strong>SUPER_ADMIN</strong>. La formula è:</p>
        <pre>tariffa = costo_orario_base × (1 + overhead% / 100) × (1 + margine% / 100)</pre>
        <h3>Modello Excel</h3>
        <p>La struttura segue il file <strong>Modello_contabilita_ore_area_tecnica_infragruppo.xlsx</strong> con i fogli Dashboard, Istruzioni, Società, Profili_tariffe, Dipendenti, Commesse, Attività, Timesheet, Riepilogo_mese e Fatture_infragruppo.</p>
      </section>
    </div>
  );
}
