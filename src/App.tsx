import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import MtsMockup from "./pages/MtsMockup";
import Hearings from "./pages/Hearings";
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
          <Route path="/mts-mockup" element={<MtsMockup />} />
          <Route path="/hearings2/" element={<Hearings />} />
          <Route path="/hearing2/:year/:committee/:billName/:videoTitle" element={<HearingTranscript />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
