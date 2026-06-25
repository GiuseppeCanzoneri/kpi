import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { AppSidebar } from "./components/AppSidebar";
import { Loading } from "./components/Loading";
import Login from "./pages/Login";
import NoRole from "./pages/NoRole";
import Dashboard from "./pages/Index";
import Timesheet from "./pages/Timesheet";
import Approvazioni from "./pages/Approvazioni";
import Riepilogo from "./pages/Riepilogo";
import Fatture from "./pages/Fatture";
import Report from "./pages/Report";
import ImportExcel from "./pages/ImportExcel";
import Anagrafiche from "./pages/Anagrafiche";
import Accessi from "./pages/Accessi";
import Istruzioni from "./pages/Istruzioni";
import { Toaster } from "@/components/ui/sonner";

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, roles } = useAuth();
  
  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-slate-50"><Loading label="Inizializzazione sistema..." /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles.length === 0) return <NoRole />;

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
          <Route path="/timesheet" element={<ProtectedLayout><Timesheet /></ProtectedLayout>} />
          <Route path="/approvazioni" element={<ProtectedLayout><Approvazioni /></ProtectedLayout>} />
          <Route path="/riepilogo" element={<ProtectedLayout><Riepilogo /></ProtectedLayout>} />
          <Route path="/fatture" element={<ProtectedLayout><Fatture /></ProtectedLayout>} />
          <Route path="/report" element={<ProtectedLayout><Report /></ProtectedLayout>} />
          <Route path="/import" element={<ProtectedLayout><ImportExcel /></ProtectedLayout>} />
          <Route path="/anagrafiche" element={<ProtectedLayout><Anagrafiche /></ProtectedLayout>} />
          <Route path="/accessi" element={<ProtectedLayout><Accessi /></ProtectedLayout>} />
          <Route path="/istruzioni" element={<ProtectedLayout><Istruzioni /></ProtectedLayout>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </AuthProvider>
  );
}