import { LinkButton } from "../components/Button";

/**
 * Catch-all screen for an unknown address (design/mockups/not-found.html).
 * It stays inside the skeleton's layout frame and only offers the way back:
 * the home page and the search page.
 */
export default function NotFound() {
  return (
    <div
      className="stack gap-1"
      style={{ maxWidth: 520, margin: "0 auto", textAlign: "center", alignItems: "center" }}
    >
      <p className="tabular" style={{ fontSize: 34, fontWeight: 600, lineHeight: "40px" }}>
        404
      </p>
      <h2>Diese Seite existiert nicht (mehr).</h2>
      <p className="muted">
        Vielleicht wurde der Thread gelöscht, die Kategorie umbenannt oder der Link ist falsch.
      </p>
      <div className="row gap-2" style={{ justifyContent: "center", marginTop: 24 }}>
        <LinkButton to="/" variant="primary">
          Zur Startseite
        </LinkButton>
        <LinkButton to="/search" variant="secondary">
          Zur Suche
        </LinkButton>
      </div>
    </div>
  );
}
