import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Banner,
  Button,
  Field,
  IconButton,
  MoonIcon,
  PasswordInput,
  SunIcon,
  TextInput,
} from "../components";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ApiError } from "../lib/api";

const WRONG_CREDENTIALS = "Benutzername oder Passwort ist falsch.";
const MISSING_FIELDS = "Bitte fülle beide Felder aus.";
const RATE_LIMITED = "Zu viele Versuche. Bitte warte einen Moment.";

/**
 * Sign-in screen of the forum. Standalone auth shell of the design
 * (design/mockups/login.html): brand row, theme toggle, form, no forum header.
 * Wrong credentials show the design's banner above the form; an untouched form
 * starts neutral.
 */
export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { toggleTheme } = useTheme();

  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setError(null);

    if (identity.trim() === "" || password === "") {
      setError(MISSING_FIELDS);
      return;
    }

    setSubmitting(true);
    try {
      await login(identity.trim(), password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.status === 429 ? RATE_LIMITED : err.message);
      } else {
        setError(WRONG_CREDENTIALS);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrap" data-od-id="login-main">
      <div className="card auth-card auth-card--400" data-od-id="login-card">
        <div className="between">
          <Link className="brand" to="/" data-od-id="brand">
            <span className="brand-mark" aria-hidden="true">
              C
            </span>
            Community
          </Link>
          <IconButton label="Hell/Dunkel umschalten" onClick={toggleTheme} data-od-id="theme-toggle">
            <MoonIcon />
            <SunIcon />
          </IconButton>
        </div>

        <h1 data-od-id="login-title">Willkommen zurück</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Melde dich an, um Threads zu schreiben und abzustimmen.
        </p>

        {error !== null && (
          <div style={{ marginTop: 16 }}>
            <Banner variant="danger">{error}</Banner>
          </div>
        )}

        <form className="stack gap-3" style={{ marginTop: 24 }} onSubmit={handleSubmit} data-od-id="login-form">
          <Field label="Benutzername oder E-Mail" htmlFor="login-id">
            <TextInput
              id="login-id"
              name="identity"
              type="text"
              autoComplete="username"
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
            />
          </Field>

          <Field label="Passwort" htmlFor="login-pw">
            <PasswordInput
              id="login-pw"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <div className="form-actions">
            <Button type="submit" variant="primary" size="lg" block loading={submitting}>
              Anmelden
            </Button>
          </div>
        </form>

        <p className="small" style={{ textAlign: "center", marginTop: 16 }}>
          Noch kein Konto? <Link to="/register">Registrieren</Link>
        </p>

        <hr className="divider" />
        <p className="helper" style={{ textAlign: "center" }}>
          Angemeldet bleibst du über ein sicheres Refresh-Token-Cookie.
        </p>
      </div>
    </div>
  );
}
