import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Banner, Button, Checkbox, Field, Input, PasswordInput } from "../components";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ApiError, FORUM_URL, SESSION_STORAGE_KEY } from "../lib/api";

const PERMISSION_ERROR = "Dieses Konto hat keine Berechtigung für den Administrationsbereich.";

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "moderator";
}

function forgetPersistedSession(remember: boolean): void {
  if (remember) return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    return;
  }
}

export default function Login() {
  const { toggleTheme } = useTheme();
  const { login, logout } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const nextFieldErrors: Record<string, string> = {};
    if (!email.trim()) nextFieldErrors.email = "Bitte E-Mail-Adresse angeben.";
    if (!password) nextFieldErrors.password = "Bitte Passwort angeben.";
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      if (!isAdminRole(user.role)) {
        setError(PERMISSION_ERROR);
        await logout();
        return;
      }
      forgetPersistedSession(remember);
      navigate("/", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors(caught.fields);
        setError(caught.message);
      } else {
        setError("Die Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.");
      }
    } finally {
      setSubmitting(false);
    }
  };

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

        {error !== null ? <Banner tone="danger">{error}</Banner> : null}

        <form className="stack gap-3" style={{ marginTop: 24 }} onSubmit={handleSubmit} noValidate>
          <Field label="E-Mail" htmlFor="admin-login-email" error={fieldErrors.email}>
            <Input
              id="admin-login-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field label="Passwort" htmlFor="admin-login-pw" error={fieldErrors.password}>
            <PasswordInput
              id="admin-login-pw"
              name="password"
              value={password}
              autoComplete="current-password"
              onChange={setPassword}
            />
          </Field>

          <Checkbox checked={remember} onChange={setRemember}>
            Angemeldet bleiben
          </Checkbox>

          <div className="form-actions">
            <Button type="submit" variant="primary" size="lg" block loading={submitting}>
              Anmelden
            </Button>
          </div>
        </form>

        <p className="small" style={{ textAlign: "center", marginTop: 16 }}>
          <a href={FORUM_URL}>Zurück zum Forum</a>
        </p>

        <hr className="divider" />
        <p className="helper" style={{ textAlign: "center" }}>
          Der Zugang ist auf 30 Minuten Inaktivität begrenzt.
        </p>
      </div>
    </main>
  );
}
