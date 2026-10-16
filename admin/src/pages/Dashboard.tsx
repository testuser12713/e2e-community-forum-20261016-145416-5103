export default function Dashboard() {
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Dashboard</h1>
          <p>Überblick über Forum-Aktivität und Moderationsaufgaben.</p>
        </div>
      </div>
      <div className="empty-state">
        <h4>Kennzahlen folgen in Kürze</h4>
        <p>Nutzer-, Thread- und Kommentarzahlen sowie offene Meldungen erscheinen hier.</p>
      </div>
    </>
  );
}
