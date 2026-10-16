import { useTheme } from "../context/ThemeContext";
import { FORUM_URL } from "../lib/api";

export default function Login() {
  const { toggleTheme } = useTheme();

  return (
    <main className="auth-wrap">
      <div className="card auth-card auth-card--440">
        <div className="between">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">
              A
            </span>
            Forum-Admin
          </span>
          <button
            className="icon-btn"
            type="button"
            onClick={toggleTheme}
            aria-label="Hell/Dunkel umschalten"
          >
            <svg className="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
            <svg className="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          </button>
        </div>

        <h1>Administrationsbereich</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Zugang nur für Administratoren und Moderatoren. Alle Anmeldungen werden protokolliert.
        </p>

        <p className="center small" style={{ textAlign: "center", marginTop: 16 }}>
          <a href={FORUM_URL}>Zurück zum Forum</a>
        </p>

        <hr className="divider" />
        <p className="helper" style={{ textAlign: "center" }}>
          Die Anmeldung erscheint in Kürze.
        </p>
      </div>
    </main>
  );
}
