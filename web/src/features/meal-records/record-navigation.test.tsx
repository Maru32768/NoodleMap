import {
  RecordShopLink,
  RecordVenueLink,
  restoresSearchCamera,
  BackToMapLink,
} from "@/features/meal-records/record-navigation.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

function mount(
  initialEntries: NonNullable<
    Parameters<typeof createMemoryRouter>[1]
  >["initialEntries"],
) {
  const router = createMemoryRouter(
    [
      {
        path: "/search",
        element: <RecordVenueLink venueId="one">会場へ</RecordVenueLink>,
      },
      {
        path: "/venues/:id",
        element: (
          <>
            <BackToMapLink />
            <RecordVenueLink venueId="two">別の会場へ</RecordVenueLink>
            <RecordShopLink shopId="b">提供店B</RecordShopLink>
          </>
        ),
      },
    ],
    { initialEntries },
  );
  renderWithProviders(<RouterProvider router={router} />);
  return router;
}

describe("record navigation", () => {
  it("returns through the router to the complete original search URL and preserves its camera", async () => {
    const router = mount([
      {
        pathname: "/search",
        search: "?shop=a&custom=one",
        hash: "#details",
        state: { source: "saved" },
      },
    ]);
    await userEvent.click(screen.getByRole("link", { name: "会場へ" }));
    await userEvent.click(screen.getByRole("link", { name: "別の会場へ" }));
    expect(router.state.location.pathname).toBe("/venues/two");
    const back = screen.getByRole("link", { name: "地図に戻る" });
    expect(back).toHaveAttribute("href", "/search?shop=a&custom=one#details");
    await userEvent.click(back);
    expect(router.state.location).toMatchObject({
      pathname: "/search",
      search: "?shop=a&custom=one",
      hash: "#details",
    });
    expect(restoresSearchCamera(router.state.location.state)).toBe(true);
    expect(router.state.location.state).toMatchObject({
      returnToSearch: { state: { source: "saved" } },
    });
    await userEvent.click(screen.getByRole("link", { name: "会場へ" }));
    expect(screen.getByRole("link", { name: "地図に戻る" })).toHaveAttribute(
      "href",
      "/search?shop=a&custom=one#details",
    );
  });

  it("uses the app search route for a direct venue URL", async () => {
    const router = mount(["/venues/one"]);
    await userEvent.click(screen.getByRole("link", { name: "地図に戻る" }));
    expect(router.state.location.pathname).toBe("/search");
    expect(restoresSearchCamera(router.state.location.state)).toBe(false);
  });

  it("provider navigation preserves search parameters and asks to center the new shop", async () => {
    const router = mount(["/search?shop=a&custom=one#details"]);
    await userEvent.click(screen.getByRole("link", { name: "会場へ" }));
    await userEvent.click(screen.getByRole("link", { name: "提供店B" }));
    expect(router.state.location).toMatchObject({
      pathname: "/search",
      search: "?shop=b&custom=one",
      hash: "#details",
    });
    expect(restoresSearchCamera(router.state.location.state)).toBe(false);
  });
});
