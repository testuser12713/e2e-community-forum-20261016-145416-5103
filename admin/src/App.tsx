import { Navigate, Route, Routes } from "react-router-dom";
import Gallery from "./dev/Gallery";
import AdminLayout from "./layout/AdminLayout";
import AuditLog from "./pages/AuditLog";
import Categories from "./pages/Categories";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import ModerationQueue from "./pages/ModerationQueue";
import Users from "./pages/Users";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/moderation" element={<ModerationQueue />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/gallery" element={<Gallery />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
