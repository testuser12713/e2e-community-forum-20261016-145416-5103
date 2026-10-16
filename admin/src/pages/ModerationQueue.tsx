export default function ModerationQueue() {
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Meldungen</h1>
          <p>Prüfe, entscheide und dokumentiere jeden Fall.</p>
        </div>
      </div>
      <div className="empty-state">
        <h4>Moderations-Warteschlange folgt in Kürze</h4>
        <p>Gemeldete Inhalte erscheinen hier mit den Entscheidungen der Moderation.</p>
      </div>
    </>
  );
}
