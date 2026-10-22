import { Provider } from "@/components/ui/provider.tsx";
import { Toaster } from "@/components/ui/toaster.tsx";
import { render, renderHook } from "@testing-library/react";
import { ReactNode } from "react";
import { SWRConfig } from "swr";

// App providers with a fresh SWR cache per render so tests never share data.
function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <Provider>
        {children}
        <Toaster />
      </Provider>
    </SWRConfig>
  );
}

export function renderWithProviders(ui: ReactNode) {
  return render(ui, { wrapper: AppProviders });
}

export function renderHookWithProviders<T>(hook: () => T) {
  return renderHook(hook, { wrapper: AppProviders });
}
