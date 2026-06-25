import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { Loading } from "./components/Loading";
import Login from "./pages/Login";
import NoRole from "./pages/NoRole";
import Dashboard from "./pages/Dashboard";
import Timesheet from "./pages/Timesheet";
import Approvazioni from "./pages/Approvazioni";
import Riepilogo from "./pages/Riepilogo";
import Fatture from "./pages/Fatture";
import Report from "./pages/Report";
import ImportExcel from "./pages/ImportExcel";
import Anagrafiche from "./pages/Anagrafiche";
import Accessi from "./pages/Accessi";
import Istruzioni from "./pages/Istruzioni";

function ProtectedRoutes() {
  const { user, loading, roles } = useAuth();
  if (loading) return <Loading label="Avvio modulo KPI" />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles.length === 0) return <NoRole />;
  return <Layout />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoutes />}>
            <Route index element={<Dashboard />} />
            <Route path="timesheet" element={<Timesheet />} />

          <Route path="approvazioni" element={<Approvazioni />} />
            <Route path="riepilogo" element={<Riepilogo />} />
            <Route path="fatture" element={<Fatture />} />
            <Route path="report" element={<Report />} />
            <Route path="import" element={<ImportExcel />} />
            <Route path="anagrafiche" element={<Anagrafiche />} />
            <Route path="accessi" element={<Accessi />} />
            <Route path="istruzioni" element={<Istruzioni />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
