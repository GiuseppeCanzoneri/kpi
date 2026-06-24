import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { Layout } from "./components/Layout";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Index />} />
              {/* Placeholder per le altre rotte richieste */}
              <Route path="/istruzioni" element={<div className="text-2xl font-bold">Istruzioni</div>} />
              <Route path="/societa" element={<div className="text-2xl font-bold">Società</div>} />
              <Route path="/profili-tariffe" element={<div className="text-2xl font-bold">Profili & Tariffe</div>} />
              <Route path="/dipendenti" element={<div className="text-2xl font-bold">Dipendenti</div>} />
              <Route path="/commesse" element={<div className="text-2xl font-bold">Commesse</div>} />
              <Route path="/attivita" element={<div className="text-2xl font-bold">Attività</div>} />
              <Route path="/timesheet" element={<div className="text-2xl font-bold">Timesheet</div>} />
              <Route path="/riepilogo-mese" element={<div className="text-2xl font-bold">Riepilogo Mese</div>} />
              <Route path="/fatture-infragruppo" element={<div className="text-2xl font-bold">Fatture Infragruppo</div>} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;