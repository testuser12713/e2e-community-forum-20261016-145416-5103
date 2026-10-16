import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Banner,
  Button,
  Field,
  IconButton,
  MoonIcon,
  PasswordInput,
  RuleList,
  SunIcon,
  TextInput,
} from "../components";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ApiError } from "../lib/api";

interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

/** The register screen's password rules, verbatim from design/mockups/register.html. */
const PASSWORD_RULES: PasswordRule[] = [
  { id: "len", label: "mindestens 10 Zeichen", test: (value) => value.length >= 10 },
  {
    id: "case",
    label: "Groß- und Kleinbuchstabe",
    test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value),
  },
  { id: "digit", label: "mindestens eine Ziffer", test: (value) => /[0-9]/.test(value) },
];

interface FieldErrors {
  username?: string;
  email?: string;
  password?: string;
  password2?: string;
}

const FIELD_KEYS = ["username", "email", "password", "password2"] as const;

/**
 * Registration screen of the forum. Standalone auth shell of the design
 * (design/mockups/register.html): brand row, theme toggle, form with the
 * password rule checklist. An untouched form starts neutral; the violated rule
 * turns red at the password field as soon as the user types, and a taken
 * username/e-mail shows the server's message at its field.
 */
export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { toggleTheme } = useTheme();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const passwordTouched = attempted || password.length > 0;
  const passwordRulesMet = PASSWORD_RULES.every((rule) => rule.test(password));
  const password2Touched = password2.length > 0;
  const passwordsMatch = password2Touched && password2 === password;

  const handleFieldChange = (field: keyof FieldErrors, value: string) => {
    if (field === "username") setUsername(value);
    if (field === "email") setEmail(value);
    if (field === "password") setPassword(value);
    if (field === "password2") setPassword2(value);
    setFieldErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setAttempted(true);
    setFormError(null);

    const errors: FieldErrors = {};
    if (username.trim() === "") errors.username = "Bitte gib einen Benutzernamen ein.";
    if (email.trim() === "") errors.email = "Bitte gib eine E-Mail-Adresse ein.";
    if (password2 !== password) errors.password2 = "Die Passwörter stimmen nicht überein.";

    if (!passwordRulesMet || Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await register(username.trim(), email.trim(), password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        const serverFields: FieldErrors = {};
        for (const key of FIELD_KEYS) {
          const message = err.fields[key];
          if (typeof message === "string" && message !== "") serverFields[key] = message;
        }
        if (Object.keys(serverFields).length > 0) {
          setFieldErrors(serverFields);
        } else {
          setFormError(
            err.status === 429
              ? "Zu viele Versuche. Bitte warte einen Moment."
              : err.message,
          );
        }
      } else {
        setFormError("Die Registrierung ist fehlgeschlagen. Bitte versuche es erneut.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const password2Error =
    fieldErrors.password2 ??
    (password2Touched && password2 !== password ? "Die Passwörter stimmen nicht überein." : undefined);

  return (
    <div className="auth-wrap" data-od-id="register-main">
      <div className="card auth-card auth-card--440" data-od-id="register-card">
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

        <h1 data-od-id="register-title">Konto erstellen</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Ein Name, eine E-Mail, ein Passwort.
        </p>

        {formError !== null && (
          <div style={{ marginTop: 16 }}>
            <Banner variant="danger">{formError}</Banner>
          </div>
        )}

        <form className="stack gap-3" style={{ marginTop: 24 }} onSubmit={handleSubmit} data-od-id="register-form">
          <Field label="Benutzername" htmlFor="reg-user" error={fieldErrors.username}>
            <TextInput
              id="reg-user"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              invalid={fieldErrors.username !== undefined}
              onChange={(event) => handleFieldChange("username", event.target.value)}
            />
          </Field>

          <Field label="E-Mail" htmlFor="reg-mail" error={fieldErrors.email}>
            <TextInput
              id="reg-mail"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="du@example.com"
              value={email}
              invalid={fieldErrors.email !== undefined}
              onChange={(event) => handleFieldChange("email", event.target.value)}
            />
          </Field>

          <Field
            label="Passwort"
            htmlFor="reg-pw"
            error={passwordTouched && !passwordRulesMet ? fieldErrors.password : undefined}
          >
            <PasswordInput
              id="reg-pw"
              name="password"
              autoComplete="new-password"
              aria-describedby="pw-rules"
              value={password}
              invalid={passwordTouched && !passwordRulesMet}
              onChange={(event) => handleFieldChange("password", event.target.value)}
            />
            <RuleList
              id="pw-rules"
              items={PASSWORD_RULES.map((rule) => ({
                label: rule.label,
                status: passwordTouched ? (rule.test(password) ? "ok" : "bad") : undefined,
              }))}
            />
          </Field>

          <Field
            label="Passwort wiederholen"
            htmlFor="reg-pw2"
            hint={passwordsMatch ? "Die Passwörter stimmen überein." : undefined}
            error={password2Error}
          >
            <PasswordInput
              id="reg-pw2"
              name="password2"
              autoComplete="new-password"
              value={password2}
              invalid={password2Error !== undefined}
              onChange={(event) => handleFieldChange("password2", event.target.value)}
            />
          </Field>

          <div className="form-actions">
            <Button type="submit" variant="primary" size="lg" block loading={submitting}>
              Konto erstellen
            </Button>
          </div>
        </form>

        <p className="small" style={{ textAlign: "center", marginTop: 16 }}>
          Bereits registriert? <Link to="/login">Anmelden</Link>
        </p>

        <hr className="divider" />
        <p className="helper" style={{ textAlign: "center" }}>
          Passwörter werden mit Argon2 gehasht.
        </p>
      </div>
    </div>
  );
}
