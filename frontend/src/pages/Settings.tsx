import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardHead,
  CardTitle,
  Field,
  PasswordInput,
  RuleList,
  Textarea,
  Toast,
  ToastRegion,
} from "../components";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ApiError, apiFetch } from "../lib/api";
import type { UserOut } from "../lib/api";

const ROLE_LABEL: Record<string, string> = {
  user: "Nutzer",
  moderator: "Moderator",
  admin: "Administrator",
};

const ROLE_VARIANT: Record<string, "role" | "moderator" | "admin"> = {
  user: "role",
  moderator: "moderator",
  admin: "admin",
};

const BIO_MAX_LENGTH = 500;

interface ToastState {
  message: string;
  variant: "success" | "danger";
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Settings() {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [bio, setBio] = useState(user?.bio ?? "");
  const [bioSaving, setBioSaving] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (user !== null) setBio(user.bio ?? "");
  }, [user]);

  const passwordRules = useMemo<
    { label: string; status: "ok" | "pending" }[]
  >(
    () => [
      { label: "mindestens 10 Zeichen", status: newPassword.length >= 10 ? "ok" : "pending" },
      {
        label: "Groß- und Kleinbuchstabe",
        status:
          /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) ? "ok" : "pending",
      },
      { label: "mindestens eine Ziffer", status: /[0-9]/.test(newPassword) ? "ok" : "pending" },
    ],
    [newPassword],
  );

  if (loading) {
    return <p className="muted">Wird geladen…</p>;
  }

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  const saveBio = () => {
    setBioError(null);
    setBioSaving(true);
    apiFetch<UserOut>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ bio: bio.trim() === "" ? null : bio }),
    })
      .then(() => {
        setToast({ message: "Bio gespeichert.", variant: "success" });
      })
      .catch((error: unknown) => {
        setBioError(error instanceof ApiError ? error.message : "Die Bio konnte nicht gespeichert werden.");
      })
      .finally(() => {
        setBioSaving(false);
      });
  };

  const changePassword = () => {
    setCurrentError(null);
    setNewError(null);
    setRepeatError(null);

    if (newPassword !== repeatPassword) {
      setRepeatError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setPasswordSaving(true);
    apiFetch<void>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
      .then(() => {
        setCurrentPassword("");
        setNewPassword("");
        setRepeatPassword("");
        setToast({ message: "Passwort geändert.", variant: "success" });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError) {
          const fieldError = (name: string): string | null => error.fields[name] ?? null;
          setCurrentError(fieldError("current_password"));
          setNewError(fieldError("new_password"));
          if (error.fields.current_password === undefined && error.fields.new_password === undefined) {
            setToast({ message: error.message, variant: "danger" });
          }
        } else {
          setToast({ message: "Das Passwort konnte nicht geändert werden.", variant: "danger" });
        }
      })
      .finally(() => {
        setPasswordSaving(false);
      });
  };

  const handleLogout = () => {
    void logout().then(() => navigate("/login"));
  };

  return (
    <div className="reading-col" style={{ margin: "0 auto" }}>
      <h1 data-od-id="settings-title" style={{ marginBottom: 24 }}>
        Einstellungen
      </h1>

      <Card data-od-id="settings-account">
        <CardHead>
          <CardTitle>Konto</CardTitle>
        </CardHead>
        <dl className="kv">
          <dt>Benutzername</dt>
          <dd>@{user.username}</dd>
          <dt>E-Mail</dt>
          <dd>{user.email}</dd>
          <dt>Rolle</dt>
          <dd>
            <span className={`badge badge--${ROLE_VARIANT[user.role] ?? "role"}`}>
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </dd>
          <dt>Mitglied seit</dt>
          <dd>{formatDateTime(user.created_at)}</dd>
        </dl>
      </Card>

      <Card data-od-id="settings-profile">
        <CardHead>
          <CardTitle>Profil</CardTitle>
        </CardHead>
        <Field
          label="Bio"
          htmlFor="bio"
          counter={`${bio.length}/${BIO_MAX_LENGTH}`}
          error={bioError}
        >
          <Textarea
            id="bio"
            maxLength={BIO_MAX_LENGTH}
            value={bio}
            invalid={bioError !== null}
            onChange={(event) => setBio(event.target.value)}
          />
        </Field>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <Button variant="primary" loading={bioSaving} onClick={saveBio} data-od-id="save-bio">
            Bio speichern
          </Button>
        </div>
      </Card>

      <Card data-od-id="settings-password">
        <CardHead>
          <CardTitle>Passwort ändern</CardTitle>
        </CardHead>
        <div className="stack gap-3">
          <Field label="Aktuelles Passwort" htmlFor="pw-cur" error={currentError}>
            <PasswordInput
              id="pw-cur"
              autoComplete="current-password"
              value={currentPassword}
              invalid={currentError !== null}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field label="Neues Passwort" htmlFor="pw-new" error={newError}>
            <PasswordInput
              id="pw-new"
              autoComplete="new-password"
              value={newPassword}
              invalid={newError !== null}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <RuleList items={passwordRules} />
          </Field>
          <Field label="Neues Passwort wiederholen" htmlFor="pw-new2" error={repeatError}>
            <PasswordInput
              id="pw-new2"
              autoComplete="new-password"
              value={repeatPassword}
              invalid={repeatError !== null}
              onChange={(event) => setRepeatPassword(event.target.value)}
            />
          </Field>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <Button
            variant="primary"
            loading={passwordSaving}
            onClick={changePassword}
            data-od-id="change-password"
          >
            Passwort ändern
          </Button>
        </div>
      </Card>

      <Card data-od-id="settings-appearance">
        <CardHead>
          <CardTitle>Darstellung</CardTitle>
        </CardHead>
        <div className="sort-tabs" role="tablist" aria-label="Theme">
          <button
            className="sort-tab"
            type="button"
            role="tab"
            aria-selected={theme === "light"}
            onClick={() => {
              if (theme !== "light") toggleTheme();
            }}
          >
            Hell
          </button>
          <button
            className="sort-tab"
            type="button"
            role="tab"
            aria-selected={theme === "dark"}
            onClick={() => {
              if (theme !== "dark") toggleTheme();
            }}
          >
            Dunkel
          </button>
          <button
            className="sort-tab"
            type="button"
            role="tab"
            aria-selected={false}
            disabled
            title="Bald verfügbar"
            style={{ opacity: 0.5, cursor: "not-allowed" }}
          >
            System
          </button>
        </div>
        <p className="helper" style={{ marginTop: 8 }}>
          Die Wahl bleibt nach dem Neuladen erhalten.
        </p>
      </Card>

      <Card data-od-id="settings-session">
        <CardHead>
          <CardTitle>Sitzung</CardTitle>
        </CardHead>
        <p className="muted small">
          Angemeldet bleibst du über ein sicheres Refresh-Token-Cookie. Beim Abmelden wird das Token
          serverseitig ungültig.
        </p>
        <div className="row gap-2 wrap" style={{ marginTop: 12 }}>
          <Button variant="danger" disabled title="Bald verfügbar" data-od-id="logout-all">
            Überall abmelden
          </Button>
          <Button variant="secondary" onClick={handleLogout}>
            Abmelden
          </Button>
        </div>
        <p className="helper" style={{ marginTop: 8 }}>
          „Überall abmelden“ ist noch nicht verfügbar.
        </p>
      </Card>

      <Card data-od-id="settings-danger">
        <CardHead>
          <CardTitle>Gefahrenzone</CardTitle>
        </CardHead>
        <p className="muted small">
          Konto löschen ist derzeit nicht verfügbar und bleibt deaktiviert.
        </p>
        <div className="row gap-2 wrap" style={{ marginTop: 12 }}>
          <Button variant="secondary" disabled title="Bald verfügbar" data-od-id="delete-account">
            Konto löschen
          </Button>
          <span className="helper">Bald verfügbar</span>
        </div>
      </Card>

      <ToastRegion>
        {toast !== null && (
          <Toast variant={toast.variant} onClose={() => setToast(null)}>
            {toast.message}
          </Toast>
        )}
      </ToastRegion>
    </div>
  );
}
