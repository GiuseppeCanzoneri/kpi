import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import Accessi from "./pages/Accessi";
import Anagrafiche from "./pages/Anagrafiche";
import Fatture from "./pages/Fatture";
import CentriCosto from "./pages/CentriCosto";
import ImportExcel from "./pages/ImportExcel";
import Index from "./pages/Index";
import Istruzioni from "./pages/Istruzioni";
import Login from "./pages/Login";
import NoRole from "./pages/NoRole";
import NotFound from "./pages/NotFound";
import Report from "./pages/Report";
import Riepilogo from "./pages/Riepilogo";
import Timesheet from "./pages/Timesheet";
import Tariffario from "./pages/Tariffario";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children, adminOnly = false, superOnly = false }: { children: ReactElement; adminOnly?: boolean; superOnly?: boolean }) {
  const { user, roles, loading, isSuperAdmin, isAdminArea } = useAuth();

  if (loading) {
    return (
      <div className="center-page">
        <div className="loading-card">
          <div className="spinner" />
          <strong>Caricamento portale</strong>
          <span>Sto verificando sessione e ruolo operativo.</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (roles.length === 0) return <Navigate to="/no-role" replace />;
  if (superOnly && !isSuperAdmin) return <Navigate to="/" replace />;
  if (adminOnly && !isSuperAdmin && !isAdminArea) return <Navigate to="/timesheet" replace />;

  return <Layout>{children}</Layout>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/no-role" element={<NoRole />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/timesheet" element={<ProtectedRoute><Timesheet /></ProtectedRoute>} />
            <Route path="/riepilogo" element={<ProtectedRoute adminOnly><Riepilogo /></ProtectedRoute>} />
            <Route path="/fatture" element={<ProtectedRoute adminOnly><Fatture /></ProtectedRoute>} />
            <Route path="/report" element={<ProtectedRoute><Report /></ProtectedRoute>} />
            <Route path="/anagrafiche" element={<ProtectedRoute adminOnly><Anagrafiche /></ProtectedRoute>} />
            <Route path="/import" element={<ProtectedRoute adminOnly><ImportExcel /></ProtectedRoute>} />
            <Route path="/accessi" element={<ProtectedRoute adminOnly><Accessi /></ProtectedRoute>} />
            <Route path="/istruzioni" element={<ProtectedRoute><Istruzioni /></ProtectedRoute>} />
            <Route path="/tariffario" element={<ProtectedRoute superOnly><Tariffario /></ProtectedRoute>} />
            <Route path="/centri-costo" element={<ProtectedRoute adminOnly><CentriCosto /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
        <Sonner />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
