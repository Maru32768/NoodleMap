import { FavoriteRating } from "@/features/shops/rating-hearts.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { describe, expect, it } from "vitest";

describe("FavoriteRating", () => {
  it("shows the score out of 100", () => {
    const { container } = renderWithProviders(<FavoriteRating rate={85} />);

    expect(container).toHaveTextContent("85 / 100");
  });

  it("uses the tighter separator in compact mode", () => {
    const { container } = renderWithProviders(
      <FavoriteRating rate={85} compact />,
    );

    expect(container).toHaveTextContent("85 /100");
  });

  it("omits the score when the shop is unrated", () => {
    const { container } = renderWithProviders(
      <FavoriteRating rate={undefined} />,
    );

    expect(container).not.toHaveTextContent("/ 100");
  });
});
