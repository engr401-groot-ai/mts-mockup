import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Triage from "./pages/Triage";
import BillDetail from "./pages/BillDetail";
import Bills from "./pages/Bills";
import Hearings from "./pages/Hearings";
import HearingDetail from "./pages/HearingDetail";
import Archive from "./pages/Archive";
import Digests from "./pages/Digests";
import DigestNew from "./pages/DigestNew";
import Scorecard from "./pages/Scorecard";
import NotFound from "./pages/NotFound";
import MtsMockup from "./pages/MtsMockup";
import HearingsList from "./pages/HearingsList";
import HearingTranscript from "./pages/HearingTranscript";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/mts-mockup" replace />} />
          <Route path="/triage" element={<Index />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/bills/:id" element={<BillDetail />} />
          <Route path="/hearings" element={<Hearings />} />
          <Route path="/hearings/:id" element={<HearingDetail />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/digests" element={<Digests />} />
          <Route path="/digests/new" element={<DigestNew />} />
          <Route path="/scorecard" element={<Scorecard />} />
          <Route path="/mts-mockup" element={<MtsMockup />} />
          <Route path="/hearings-list" element={<HearingsList />} />
          <Route path="/hearing/:id" element={<HearingTranscript />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
