import { useCallback, useState } from "react";
import { cn } from "../lib/cn";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";
import { Menu, MenuItem, MenuSeparator } from "./Popover";
import { useDismissable } from "./useDismissable";

export interface AccountMenuUser {
  username: string;
  color?: number;
}

export interface AccountMenuProps {
  user?: AccountMenuUser | null;
  /** Signs the user out; without it the entry is not rendered. */
  onLogout?: () => void;
  profileHref?: string;
  settingsHref?: string;
  notificationsHref?: string;
  loginHref?: string;
  registerHref?: string;
  defaultOpen?: boolean;
  label?: string;
  className?: string;
}

/**
 * Avatar trigger and account menu of the header. Signed-out visitors get the
 * sign-in / register entries instead of the account entries.
 */
export function AccountMenu({
  user,
  onLogout,
  profileHref,
  settingsHref,
  notificationsHref,
  loginHref,
  registerHref,
  defaultOpen = false,
  label = "Konto",
  className,
}: AccountMenuProps) {
  const [open, setOpen] = useState(defaultOpen);
  const signedIn = user !== undefined && user !== null;

  const close = useCallback(() => setOpen(false), []);
  const wrapperRef = useDismissable(open, close);

  return (
    <div className={cn("popwrap", className)} ref={wrapperRef}>
      <IconButton
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Avatar name={user?.username} size={24} color={user?.color} />
      </IconButton>

      <Menu open={open} label={label}>
        {signedIn ? (
          <>
            {profileHref !== undefined && (
              <MenuItem to={profileHref} onClick={close}>
                Profil
              </MenuItem>
            )}
            {settingsHref !== undefined && (
              <MenuItem to={settingsHref} onClick={close}>
                Einstellungen
              </MenuItem>
            )}
            {notificationsHref !== undefined && (
              <MenuItem to={notificationsHref} onClick={close}>
                Benachrichtigungen
              </MenuItem>
            )}
            {onLogout !== undefined && (
              <>
                <MenuSeparator />
                <MenuItem
                  onClick={() => {
                    close();
                    onLogout();
                  }}
                >
                  Abmelden
                </MenuItem>
              </>
            )}
          </>
        ) : (
          <>
            {loginHref !== undefined && (
              <MenuItem to={loginHref} onClick={close}>
                Anmelden
              </MenuItem>
            )}
            {registerHref !== undefined && (
              <MenuItem to={registerHref} onClick={close}>
                Registrieren
              </MenuItem>
            )}
          </>
        )}
      </Menu>
    </div>
  );
}
