import { useAuth } from "@/features/auth/use-auth.ts";
import { renderHookWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

const user = {
  id: "00000000-0000-4000-8000-0000000000c3",
  email: "admin@example.com",
  isAdmin: true,
};

// Components read these during render, which is what subscribes them to SWR
// updates; reading them lazily from the test would miss re-renders.
function renderAuth() {
  return renderHookWithProviders(() => {
    const { currentUser, isLoading, loginWithGoogle, logout } = useAuth();
    return { currentUser, isLoading, loginWithGoogle, logout };
  });
}

describe("useAuth", () => {
  it("exposes the signed-in user", async () => {
    server.use(http.get("/api/v1/auth/me", () => HttpResponse.json(user)));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.currentUser).toEqual(user));
  });

  it("treats 401 as signed out instead of an error", async () => {
    let calls = 0;
    server.use(
      http.get("/api/v1/auth/me", () => {
        calls++;
        return HttpResponse.json(
          { type: "authentication_required" },
          { status: 401 },
        );
      }),
    );

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentUser).toBeUndefined();
    expect(calls).toBe(1);
  });

  it("signs in with a Google credential and updates the current user", async () => {
    let credential: unknown;
    server.use(
      http.get("/api/v1/auth/me", () =>
        HttpResponse.json({ type: "authentication_required" }, { status: 401 }),
      ),
      http.post("/api/v1/auth/google", async ({ request }) => {
        credential = ((await request.json()) as { credential: string })
          .credential;
        return HttpResponse.json({ user });
      }),
    );
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loginWithGoogle("google-id-token");
    });

    expect(credential).toBe("google-id-token");
    expect(result.current.currentUser).toEqual(user);
  });

  it("clears the current user on logout", async () => {
    server.use(
      http.get("/api/v1/auth/me", () => HttpResponse.json(user)),
      http.post("/api/v1/auth/logout", () => new HttpResponse(null)),
    );
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.currentUser).toEqual(user));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.currentUser).toBeUndefined();
  });
});
