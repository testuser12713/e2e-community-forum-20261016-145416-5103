import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import Gallery from "./dev/Gallery";
import { AppLayout } from "./layout/AppLayout";
import Category from "./pages/Category";
import EditThread from "./pages/EditThread";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NewThread from "./pages/NewThread";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Register from "./pages/Register";
import Search from "./pages/Search";
import Settings from "./pages/Settings";
import Tag from "./pages/Tag";
import ThreadDetail from "./pages/ThreadDetail";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/category/:slug" element={<Category />} />
            <Route path="/tag/:tag" element={<Tag />} />
            <Route path="/threads/:id/edit" element={<EditThread />} />
            <Route path="/threads/:id" element={<ThreadDetail />} />
            <Route path="/new-thread" element={<NewThread />} />
            <Route path="/search" element={<Search />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/users/:username" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            {import.meta.env.DEV ? (
              <Route path="/dev/gallery" element={<Gallery />} />
            ) : null}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
