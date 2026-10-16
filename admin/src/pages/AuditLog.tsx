export default function AuditLog() {
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Audit-Log</h1>
          <p>Alle Moderations- und Verwaltungsaktionen, unveränderlich protokolliert.</p>
        </div>
      </div>
      <div className="empty-state">
        <h4>Audit-Log folgt in Kürze</h4>
        <p>Akteur, Aktion, Ziel und Zeitpunkt jeder Moderationsaktion erscheinen hier.</p>
      </div>
    </>
  );
}
