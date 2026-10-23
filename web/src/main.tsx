import { AppErrorBoundary } from "@/components/app-error-boundary.tsx";
import { Provider } from "@/components/ui/provider.tsx";
import { Toaster } from "@/components/ui/toaster.tsx";
import "maplibre-gl/dist/maplibre-gl.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Provider>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
        <Toaster />
      </Provider>
    </BrowserRouter>
  </StrictMode>,
);
