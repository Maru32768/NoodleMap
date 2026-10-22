import { ProtectedRoute } from "@/features/auth/protected-route.tsx";
import {
  AuthenticatedUser,
  CurrentUser,
  CurrentUserProvider,
  GUEST_USER,
} from "@/features/auth/use-current-user.ts";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

const normalUser: AuthenticatedUser = {
  id: "00000000-0000-4000-8000-0000000000d4",
  email: "user@example.com",
  type: "normal",
};

function CurrentLocation() {
  const location = useLocation();
  return <p>at {`${location.pathname}${location.search}`}</p>;
}

function renderAdminRoute(
  user: CurrentUser,
  entry: string,
  permissionPredicate?: (user: AuthenticatedUser) => boolean,
) {
  render(
    <CurrentUserProvider value={user}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute permissionPredicate={permissionPredicate}>
                <p>admin page</p>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<CurrentLocation />} />
        </Routes>
      </MemoryRouter>
    </CurrentUserProvider>,
  );
}

describe("ProtectedRoute", () => {
  it("sends guests to login with the full return path", () => {
    renderAdminRoute(GUEST_USER, "/admin?shop=1#edit");

    expect(
      screen.getByText(
        `at /login?redirectTo=${encodeURIComponent("/admin?shop=1#edit")}`,
      ),
    ).toBeInTheDocument();
  });

  it("sends signed-in users without permission to search", () => {
    renderAdminRoute(normalUser, "/admin", (user) => user.type === "admin");

    expect(screen.getByText("at /search")).toBeInTheDocument();
    expect(screen.queryByText("admin page")).not.toBeInTheDocument();
  });

  it("renders the page for a permitted user", () => {
    renderAdminRoute(
      { ...normalUser, type: "admin" },
      "/admin",
      (user) => user.type === "admin",
    );

    expect(screen.getByText("admin page")).toBeInTheDocument();
  });

  it("renders the page for any signed-in user without a predicate", () => {
    renderAdminRoute(normalUser, "/admin");

    expect(screen.getByText("admin page")).toBeInTheDocument();
  });
});
