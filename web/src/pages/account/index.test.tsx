import {
  AuthenticatedUser,
  CurrentUserProvider,
} from "@/features/auth/use-current-user.ts";
import type { components } from "@/generated/api.ts";
import AccountPage from "@/pages/account/index.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { ACCOUNT_PATH, LOGIN_PATH, SEARCH_PATH } from "@/utils/path.ts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuthSession = components["schemas"]["AuthSession"];

const user: AuthenticatedUser = {
  id: "00000000-0000-4000-8000-0000000000e1",
  email: "me@example.com",
  type: "normal",
};

const CURRENT_ID = "00000000-0000-4000-8000-0000000000c1";
const OTHER_ID = "00000000-0000-4000-8000-0000000000c2";

function session(id: string, current: boolean): AuthSession {
  return {
    id,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    createdAt: "2026-10-01T00:00:00Z",
    lastUsedAt: "2026-10-20T00:00:00Z",
    current,
  };
}

const replace = vi.fn();

beforeEach(() => {
  replace.mockReset();
  vi.stubGlobal("location", {
    ...window.location,
    href: window.location.href,
    replace,
  });
  server.use(
    http.get("/api/v1/auth/sessions", () =>
      HttpResponse.json({
        sessions: [session(CURRENT_ID, true), session(OTHER_ID, false)],
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function rowFor(currentDevice: boolean) {
  renderWithProviders(
    <CurrentUserProvider value={user}>
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>
    </CurrentUserProvider>,
  );
  const rows = await within(
    await screen.findByRole("list", { name: "ログイン中の端末" }),
  ).findAllByRole("listitem");
  const row = rows.find(
    (r) => (within(r).queryByText("この端末") !== null) === currentDevice,
  );
  return within(row!).getByRole("button", { name: "ログアウト" });
}

describe("AccountPage", () => {
  it("revoking this device reloads onto the search page", async () => {
    server.use(
      http.delete(
        `/api/v1/auth/sessions/${CURRENT_ID}`,
        () => new HttpResponse(null, { status: 200 }),
      ),
    );

    await userEvent.click(await rowFor(true));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(SEARCH_PATH));
  });

  it("treats a typed not_found as already revoked", async () => {
    server.use(
      http.delete(`/api/v1/auth/sessions/${OTHER_ID}`, () =>
        HttpResponse.json(
          { type: "not_found", message: "not found" },
          { status: 404 },
        ),
      ),
    );

    await userEvent.click(await rowFor(false));

    expect(await screen.findByText("ログアウトしました")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("reports a bodiless 404 as an error and keeps the row", async () => {
    server.use(
      http.delete(
        `/api/v1/auth/sessions/${OTHER_ID}`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    await userEvent.click(await rowFor(false));

    expect(
      await screen.findByText("ログアウトできませんでした"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a bodiless 401 on the session list to the login page", async () => {
    server.use(
      http.get(
        "/api/v1/auth/sessions",
        () => new HttpResponse(null, { status: 401 }),
      ),
    );

    renderWithProviders(
      <CurrentUserProvider value={user}>
        <MemoryRouter>
          <AccountPage />
        </MemoryRouter>
      </CurrentUserProvider>,
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        `${LOGIN_PATH}?redirectTo=${encodeURIComponent(ACCOUNT_PATH)}`,
      ),
    );
  });
});
