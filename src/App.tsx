import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { Loading } from "./components/Loading";
import Login from "./pages/Login";
import NoRole from "./pages/NoRole";
import Dashboard from "./pages/Dashboard";
import Timesheet from "./pages/Timesheet";
import Riepilogo from "./pages/Riepilogo";
import Fatture from "./pages/Fatture";
import Report from "./pages/Report";
import ImportExcel from "./pages/ImportExcel";
import Anagrafiche from "./pages/Anagrafiche";
import Accessi from "./pages/Accessi";
import Istruzioni from "./pages/Istruzioni";
import Tariffario from "./pages/Tariffario";
import CentriCosto from "./pages/CentriCosto";
import KpiPerformance from "./pages/KpiPerformance";
import KpiValidazione from "./pages/KpiValidazione";
import KpiDirezione from "./pages/KpiDirezione";
import KpiImpostazioni from "./pages/KpiImpostazioni";

function ProtectedRoutes() {
  const { user, loading, roles, isSuperAdmin, isAdminArea } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles.length === 0) return <NoRole />;

  const canAdmin = isSuperAdmin || isAdminArea;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/timesheet" element={<Timesheet />} />
        <Route path="/kpi" element={<KpiPerformance />} />
        <Route path="/kpi/validazione" element={canAdmin ? <KpiValidazione /> : <Navigate to="/kpi" replace />} />
        <Route path="/kpi/direzione" element={canAdmin ? <KpiDirezione /> : <Navigate to="/kpi" replace />} />
        <Route path="/kpi/impostazioni" element={canAdmin ? <KpiImpostazioni /> : <Navigate to="/kpi" replace />} />
        <Route path="/riepilogo" element={canAdmin ? <Riepilogo /> : <Navigate to="/" replace />} />
        <Route path="/fatture" element={canAdmin ? <Fatture /> : <Navigate to="/" replace />} />
        <Route path="/report" element={<Report />} />
        <Route path="/anagrafiche" element={canAdmin ? <Anagrafiche /> : <Navigate to="/" replace />} />
        <Route path="/tariffario" element={isSuperAdmin ? <Tariffario /> : <Navigate to="/" replace />} />
        <Route path="/centri-costo" element={canAdmin ? <CentriCosto /> : <Navigate to="/" replace />} />
        <Route path="/import" element={canAdmin ? <ImportExcel /> : <Navigate to="/" replace />} />
        <Route path="/accessi" element={canAdmin ? <Accessi /> : <Navigate to="/" replace />} />
        <Route path="/istruzioni" element={<Istruzioni />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
