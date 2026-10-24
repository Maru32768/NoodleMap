import { Provider } from "@/components/ui/provider.tsx";
import { Toaster } from "@/components/ui/toaster.tsx";
import { render, renderHook } from "@testing-library/react";
import { ReactNode } from "react";
import { SWRConfig } from "swr";

// App providers with a fresh SWR cache per render so tests never share data.
// SWR never retries a failed request on its own here: its 5–10 s retry fits in
// a findBy/waitFor wait (see setup.ts), so a test of a 再試行 button could pass
// on the automatic retry. `onErrorRetry` also covers hooks that pass their own
// `shouldRetryOnError` (use-auth, use-sessions), which overrides this one.
function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
        onErrorRetry: () => {},
      }}
    >
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
