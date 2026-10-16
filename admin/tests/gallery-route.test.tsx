import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { AuthProvider } from "../src/context/AuthContext";
import { ThemeProvider } from "../src/context/ThemeContext";
import { writeSession, type Session } from "../src/lib/api";

const ADMIN_SESSION: Session = {
  accessToken: "test-access-token",
  user: {
    id: 1,
    username: "admin",
    email: "admin@forum.test",
    bio: null,
    role: "admin",
    karma: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
};

function renderApp(route: string) {
  writeSession(ADMIN_SESSION);
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe("admin gallery route", () => {
  it("serves the component gallery even outside a development build", () => {
    const previous = import.meta.env.DEV;
    import.meta.env.DEV = false;
    try {
      renderApp("/gallery");
      expect(screen.getByRole("heading", { level: 1, name: "Komponentengalerie" })).toBeTruthy();
    } finally {
      import.meta.env.DEV = previous;
    }
  });

  it("still sends an unknown route to the dashboard", () => {
    renderApp("/does-not-exist");
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
  });
});
