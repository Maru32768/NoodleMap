import { MobileFooter } from "@/components/layout/mobile-footer.tsx";
import {
  type CurrentUser,
  CurrentUserProvider,
} from "@/features/auth/use-current-user.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

function renderFooter(url: string, user: CurrentUser = { type: "guest" }) {
  renderWithProviders(
    <CurrentUserProvider value={user}>
      <MemoryRouter initialEntries={[url]}>
        <MobileFooter />
      </MemoryRouter>
    </CurrentUserProvider>,
  );
  return within(screen.getByRole("navigation", { name: "メインメニュー" }));
}

describe("MobileFooter", () => {
  it("marks the current page's tab instead of linking to it", () => {
    const nav = renderFooter("/meal-records");

    expect(nav.queryByRole("link", { name: "食べた記録" })).toBeNull();
    expect(
      nav.getByText("食べた記録").closest("[aria-current]"),
    ).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "地図" })).toHaveAttribute(
      "href",
      "/search",
    );
  });

  it("offers a guest no ログイン or マイページ tab", () => {
    const nav = renderFooter("/search");
    expect(nav.queryByRole("link", { name: "ログイン" })).toBeNull();
    expect(nav.queryByRole("link", { name: "マイページ" })).toBeNull();
  });

  it("links a signed-in user to マイページ", () => {
    const nav = renderFooter("/search", {
      id: "u",
      email: "u@example.com",
      type: "normal",
    });
    expect(nav.getByRole("link", { name: "マイページ" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(nav.queryByRole("link", { name: "地図" })).toBeNull();
  });
});
